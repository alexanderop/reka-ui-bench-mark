# Migrating a component test suite from jsdom to Vitest Browser Mode

A field guide, written while moving a real Vue component library's 97-file / 2,015-test suite
off jsdom. Everything here was hit in practice and verified in a browser — no advice from
first principles, no "should work".

**Status:** living document. It grows as the migration does; see
[Adding to this guide](#adding-to-this-guide). Items still unproven are marked
**[unverified]** rather than quietly asserted.

**Applies to:** Vitest **4.1.x**, `@vitest/browser-playwright` 4.1.x, Playwright 1.62,
`vitest-browser-vue` 2.1, Vue 3.5. Vitest 4 moved several things that blog posts and older
docs still get wrong — see [Setup](#1-setup-that-actually-works-on-vitest-4).

---

## 0. The short version

The reason to do this is **mock deletion**. jsdom has no layout, no real focus, no pointer
capture, so suites accumulate stubs to paper over it — and the stubs are load-bearing in ways
nobody intended. A typical slider test opens like this:

```ts
globalThis.ResizeObserver = class ResizeObserver { observe() {} /* … */ }
window.HTMLElement.prototype.scrollIntoView = vi.fn()
window.HTMLElement.prototype.hasPointerCapture = vi.fn().mockImplementation(id => id)
window.HTMLElement.prototype.releasePointerCapture = vi.fn()
window.HTMLElement.prototype.setPointerCapture = vi.fn()
```

That third line is not a detail. `hasPointerCapture` returning truthy is the *only* reason the
component's `pointermove` handler runs at all. The test passes because the mock says yes, not
because the code works.

In a browser you delete all five lines. Concretely, on one component, deleting just the
`ResizeObserver` stub caused a real `useSize` composable to execute for the first time —
**9 lines of a shared composable, plus a component branch, that jsdom had never once run.**

And the mocks are not merely redundant, they are actively hiding breakage. We deleted
`setPointerCapture(event.pointerId)` from the component under test — i.e. broke pointer capture
outright — and ran both suites: **the browser test failed, the jsdom test still passed.** Its
own `hasPointerCapture` mock answers yes for a capture that was never taken. That test could
not have failed that mutation, in any version of the component. If you want one measurement to
justify this work to someone else, that is the one: pick your most heavily-mocked file, break
the thing the mock stands in for, and see which suite notices.

The cost is real too, and the honest framing is: **browser mode is not a strictly better
jsdom.** Some files get worse. A test for a pure function pays browser startup for nothing.

So decide up front which migration you are running, because it changes almost every later
call: browser mode **alongside** jsdom for the files that need it, or browser mode
**instead of** jsdom, with the environment deleted at the end. This guide was written during
the first and finished during the second. Two things carry over regardless:

- **Find your DOM-free files first and move them to a plain `node` project.** Not to a
  browser, and not left on jsdom either. 10 of our 97 files — 28% of all tests — needed no DOM
  at all. Cheapest step available, and it is the same step under both strategies.
- **Measure one boring port early.** A composable that gains nothing cost 1.5× wall clock, and
  a cold Chromium launch was ~0.6s. That number is what decides whether replacing jsdom
  outright is affordable for you.

See [What not to migrate](#10-what-not-to-migrate).

---

## 1. Setup that actually works on Vitest 4

Two things changed in v4 that will send you in circles if you follow older material:

- The provider is **a function from a separate package**, not the v3 string
  `provider: 'playwright'`.
- The browser context import moved from `@vitest/browser/context` to **`vitest/browser`**.

### Run both environments side by side

Do not flip the suite over in one commit. Run two Vitest **projects** against the same source
tree so you can migrate file by file and diff the two approaches:

```ts
// vite.config.ts
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          include: ['./**/*.test.{ts,js}'],
          // without this, the glob above also swallows the browser tests
          exclude: ['**/node_modules/**', '**/*.browser.test.ts'],
          setupFiles: './vitest.setup.ts',
        },
      },
      {
        extends: true,
        test: {
          name: 'browser',
          include: ['./**/*.browser.test.ts'],
          exclude: ['**/node_modules/**'],
          setupFiles: './vitest.browser.setup.ts', // NOT the jsdom one
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
})
```

Naming convention: `Component.browser.test.ts` next to the existing `Component.test.ts`.

### The setup files must not be shared

This is the single most common way to waste an afternoon. Your jsdom setup file almost
certainly contains things that are wrong, redundant, or actively harmful in a browser:

| In your jsdom setup | In a browser |
|---|---|
| `@testing-library/jest-dom` matchers | **redundant** — browser mode ships its own fork |
| canvas mocks | redundant |
| `getComputedStyle` patches for jsdom bugs | patching a bug that does not exist |
| `scrollIntoView` / observer stubs | the whole reason you are here |

Give the browser project its own setup file containing only what a browser genuinely needs.

### Config inheritance rules worth knowing

- `extends: true` pulls in root `plugins`, `resolve`, and root-level `test` options. Anything
  environment-specific therefore belongs **in the project**, not at the root.
- A project-level **`resolve.alias` merges with the inherited root one rather than replacing
  it** — verified by deleting an alias from a project and watching an import that depends on
  it still resolve. So a project only needs to declare the aliases it *adds*.
- `css` and `resolve` sit at the **project level**, siblings of `test`, not inside it.

---

## 2. The translation table

`vitest-browser-vue`'s `render` is `@vue/test-utils`' `mount` with `attachTo: container`, and
its `emitted` delegates straight to `wrapper.emitted`. It is a thin locator-flavoured shell
over VTU, which is why most of this is mechanical.

| `@vue/test-utils` + jsdom | Browser mode |
|---|---|
| `mount(C, { props })` | `await render(C, { props })` |
| `wrapper.setProps({…})` | `await screen.rerender({…})` |
| `wrapper.find('[role="x"]')` | `screen.getByRole('x')` |
| `expect(wrapper.html()).toContain(…)` | `await expect.element(loc).toHaveAttribute(…)` |
| `wrapper.emitted('e')` | `screen.emitted('e')` |
| `el.trigger('keydown', { key })` | focus the element, then `await userEvent.keyboard('{Key}')` |
| `el.trigger('pointerdown', { clientX })` | real input: `loc.click({ position })`, `loc.dropTo()` |
| `wrapper.find('[type="number"]')` (hidden) | `screen.getByRole('spinbutton', { includeHidden: true })` |
| `form.trigger('submit')` | click a real `<button type="submit">` |
| `mount(…)` once in the `describe` body | move it into `beforeEach` — `render` auto-unmounts |
| `expect(wrapper.html()).toBe('<label>…')` | `screen.container.firstElementChild.outerHTML` — there is no `.html()` |
| `el.click()` / `el.trigger('click')` | `loc.click()` — which also fires `mousedown`, `focus`, `mouseup` |
| `beforeEach(() => document.body.innerHTML = '')` | *(delete)* — the helper removes its container |
| ResizeObserver / pointer-capture stubs | *(delete)* |

`rerender` **merges** rather than replacing — confirmed in source
(`rerender: async props => { await wrapper.setProps(props) }`) and behaviourally. So chained
`setProps` calls port one-for-one.

Two rows there are less mechanical than they look.

**There is no `.html()`.** The browser helper returns `container`, a locator, `emitted`,
`rerender` and `unmount` — no VTU wrapper, so nothing to call `.html()` on. If you are coming
from `@testing-library/vue` rather than VTU, note its `html()` is literally
`() => wrapper.html()`, i.e. the *component root's* `outerHTML`, so
`container.firstElementChild.outerHTML` is an exact translation and your expected strings port
unchanged. Resist swapping an exact-HTML assertion for `toHaveAttribute`: the original pins the
entire rendered output, and the attribute matcher lets extra attributes through. That is a
weakened test, and it is the failure mode section 8 exists to catch.

**`.click()` is not a click.** `HTMLElement.click()` and VTU's `trigger('click')` dispatch a
`click` event and nothing else — no `pointerdown`, no `mousedown`, no focus, no `mouseup`. A
real click dispatches all of them. So **any `mousedown` / `pointerdown` / focus handler in your
components is invisible to a jsdom test that clicks**, and it stays invisible no matter how many
click tests you write. This is one of the strongest arguments for migrating files that look
boring; see [section 7](#7-some-of-your-jsdom-tests-are-lying).

---

## 3. Dependencies that assume Node

Your test-support libraries were written for a Node runner. Some of them will not load in a
browser at all, and the failure arrives as an import error before a single test runs.

**The pattern to look for is a CommonJS hop.** Example, from `vitest-axe`:

```js
// dist/index.js
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const axeCore = require('axe-core')   // ← fatal in a browser
```

Vite externalises `node:module`, so `createRequire` is undefined and the module throws on
import. A second copy of the same problem: the package's matchers imported `chalk`, which
drags in `process` and `tty`.

**Do not read the manifest and conclude it is fine** — we did exactly that, wrote down "this
works in the browser", and were wrong. The dependency list said `lodash-es`; the *shipped
dist* said `createRequire`. Read the built file you will actually load.

### The fix: alias a browser-safe shim, per project

The irony in the example above is that `axe-core` is browser-native — running in a real
browser is what axe is *for*. Only the CommonJS hop was hostile. So reimplement the thin
wrapper and alias it **in the browser project only**:

```ts
resolve: {
  alias: {
    // longest specifier first
    'vitest-axe/matchers': resolve(__dirname, 'shims/vitest-axe/matchers.ts'),
    'vitest-axe': resolve(__dirname, 'shims/vitest-axe/index.ts'),
  },
},
```

Aliasing beats editing imports in every migrated file: the ported tests keep the *exact*
imports of their jsdom originals, so the two stay diffable and there is nothing per-file to
get wrong.

### pnpm hoisting is load-bearing, and adding a browser dep can break it

Adding `@vitest/browser-playwright` introduced a new peer variant of `vitest`, which changed
which copy got hoisted into `.pnpm/node_modules/`. `@testing-library/jest-dom` does a bare
`import 'vitest'` while declaring **no peer dependency on it** — it had only ever resolved by
accident of hoisting. Every one of the 97 *jsdom* files died at import time with
`Cannot find package 'vitest'`.

The fix is a `packageExtensions` entry declaring the missing optional peer:

```yaml
# pnpm-workspace.yaml
packageExtensions:
  '@testing-library/jest-dom':
    peerDependencies:
      vitest: '*'
    peerDependenciesMeta:
      vitest:
        optional: true
```

Both halves are needed: `peerDependencies` is what makes pnpm link `vitest` into the package,
and `peerDependenciesMeta.optional` stops it warning for consumers that legitimately do not
have it.

If your untouched jsdom suite explodes at import time right after you add a browser
dependency, this is why. It is not your migration.

---

## 4. Coverage

### Match your coverage provider to your Vitest major

`@vitest/coverage-istanbul@3.x` installs happily alongside `vitest@4.x` and then silently
instruments **nothing with a `.vue` extension**. The mechanism is worth knowing because the
same shape of bug can hide elsewhere:

- The 3.x provider filters candidate files through `test-exclude`, passing
  `extension: this.options.extension`.
- Vitest 4 **removed `coverage.extension` from the config schema**.
- So it is `undefined`, `test-exclude` falls back to its own default
  (`.js .cjs .mjs .ts .tsx .jsx` — no `.vue`, no `.svelte`), and `shouldInstrument` rejects
  every component file without a word.

The 4.x provider dropped `test-exclude` for a glob-based check defaulting to `'**'`, with no
extension filter at all. Bumping the provider took this suite from **0 instrumented `.vue`
files to 13**.

Check this before you trust any coverage number, in either environment:

```bash
vitest run --coverage --coverage.reporter=json
node -e "const m=require('./coverage/coverage-final.json');
  const k=Object.keys(m); console.log('total:',k.length,'sfc:',k.filter(x=>x.includes('.vue')).length)"
```

If the second number is 0, your coverage has been excluding every component — probably for as
long as the project has existed.

### Coverage diffing is the best migration oracle you have

See [section 8](#8-proving-the-port-didnt-lose-anything).

---

## 5. There is no CSS, and it silently breaks clicking

Component fixtures are usually styled by a framework (Tailwind, CSS modules, a design system)
that only the app or the storybook build ever compiles. **Nothing compiles it for tests.**

Under jsdom this is invisible, because every rect is 0×0 regardless. In a real browser the
component renders at **exactly 0×0** — measured, not approximately — and:

> **Playwright refuses to click a zero-size element.**

So every geometry-dependent test fails with an actionability timeout that looks nothing like
its actual cause. Attribute-only assertions are unaffected; `getByRole` resolves fine at zero
size. That asymmetry is what makes it confusing: half your suite works.

**Fix: compile the CSS for the browser project.** Do not hand-write a shim — this suite had
641 distinct utility classes across 97 fixtures, and a hand-maintained subset rots instantly.
Point the real compiler at the fixtures and wire it through the browser project's
`css.postcss`, then import the stylesheet from the browser setup file.

Two adjustments worth making to the config you copy from your app build:

- **Strip animations.** Playwright's actionability checks wait for an element to stop moving,
  so animation utilities buy you flake for no test value. Dropping them also matches how the
  tests behaved under jsdom, which keeps ported tests comparable.
- **Keep colours.** They cost nothing, and axe's `color-contrast` rule — inert under jsdom,
  very much alive in Chromium — needs real computed colours to return a meaningful answer.

**Add a guard test.** One assertion that a known fixture has non-zero dimensions and can be
clicked. When the CSS pipeline breaks, this fails with an obvious message instead of
scattering timeouts across the suite:

```ts
it('compiles the fixtures styles', async () => {
  const screen = await render(Fixture)
  const el = screen.getByRole('slider').element()
  expect(el.getBoundingClientRect()).toMatchObject({ width: 20, height: 20 })
  await screen.getByRole('slider').click() // throws if it has no box
})
```

### It is not only a CSS problem — empty elements are zero-size too

The stylesheet is the big cause, but the same timeout shows up in suites with no CSS at all,
and the guard test above will not catch it. **An element with no content has no box.** An empty
`<label>` measures `0x18` in Chromium: full line-height, and zero *width*. Playwright will not
click it.

Which means a jsdom test can be asserting about a gesture that cannot physically occur.
`HTMLElement.click()` dispatches on any node regardless of layout — jsdom has no layout to
consult — so the test passes, and reads as though a user clicked something. Nobody can click a
zero-width element.

When a port hangs on a click, **measure the target before you doubt the locator**:

```ts
console.log(el.getBoundingClientRect()) // 0 × 18 → nothing is wrong with your selector
```

Giving the element real content is a legitimate fix. It is a change to the test body rather
than a translation, so write it down — see [section 9](#9-quarantining-bugs-the-migration-finds)
for why deviations have to cost you something.

---

## 6. Real input behaves like real input

### Keyboard goes to whatever has focus

jsdom fires `keydown` straight at an element. Playwright does not — it types into the document
and the event lands on the active element. Focus first:

```ts
screen.getByRole('slider').element().focus()
await userEvent.keyboard('{ArrowRight}')
```

The event then bubbles to the component's handler exactly as it does in production, which is
the point. If the element is not focusable in real life, the original test was asserting
something a user cannot do.

### You cannot fake a `pointerId`

This looks like a faithful port and is not:

```ts
el.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1 })) // ✗
```

Chrome throws `NotFoundError` from `setPointerCapture(1)` for a pointer that was never real,
and `hasPointerCapture` returns false, so the handler short-circuits. **This is precisely what
the jsdom pointer-capture mocks were hiding.** Use real input:

```ts
await locator.click({ position: { x: 10, y: 5 } })
await locator.dropTo(target)
```

Both go through Playwright's `FrameLocator`, which handles iframe coordinate translation for
you.

### Tests run inside an iframe

Raw `page.mouse` and `cdp()` take **page-level** coordinates, so you would have to offset by
the iframe rect yourself. Prefer locator methods. Custom commands are the escape hatch when
you genuinely need page-level control.

### Drag primitives are atomic; hooks are not

`dropTo()` / `userEvent.dragAndDrop()` press, move and release in a single call. That is
usually what you want — and it is a problem exactly once: when the original test nests its
`describe`s around the *steps* of a gesture, with a `beforeEach` per step.

```ts
describe('after pointerdown', () => {          // beforeEach: pointerdown
  describe('after pointermove', () => {        // beforeEach: pointermove
    describe('after pointerup', () => {        // beforeEach: pointerup
```

You cannot split `dropTo()` across those three hooks. Collapsing the gesture into one hook
works, but then two of those names describe nothing. Playwright's `page.mouse` *is* stateful
across calls, so the fix is a custom command per step — and the command is also the natural
place to do the iframe coordinate translation from the previous section, once, instead of in
every test:

```ts
// vitest.browser.commands.ts
export const mouseDown: BrowserCommand<[x: number, y: number]> = async (context, x, y) => {
  const box = await context.iframe.owner().boundingBox()   // tester iframe, in page coords
  await context.page.mouse.move(box.x + x, box.y + y)
  await context.page.mouse.down()
}
// …plus mouseMove and mouseUp, registered under `browser.commands` in the config
```

Tests then pass coordinates straight out of `getBoundingClientRect()` — iframe-viewport
coordinates — and never think about the offset. Roughly 40 lines, and it is what let the
pointer-capture mutation above be measured at all.

### Hidden elements need an explicit opt-in

CSS-selector assertions have no locator equivalent, and the closest role query will not find a
visually-hidden or `aria-hidden` element by default:

```ts
wrapper.find('[type="number"]').exists()                            // jsdom
screen.getByRole('spinbutton', { includeHidden: true })             // browser mode
```

This is a real improvement disguised as friction: the port has to state that it is looking for
something deliberately hidden from the accessibility tree, which the CSS selector never made
you say.

### The render helper unmounts after every test

Testing-library-style `render` registers an automatic cleanup, so a component mounted once at
`describe`-body level — a common jsdom pattern for form fixtures — is gone by the second test.
Move it into `beforeEach`. Module-level spies are *not* reset by that, so an original that
depends on a call count accumulating across tests (`toHaveBeenCalledTimes(1)`, then `(2)`)
still ports unchanged.

That cleanup has a second effect nobody asks for and everybody benefits from: **your ported
tests exercise teardown, and your jsdom tests probably never did.** `mount()` in
`@vue/test-utils` (and its equivalents elsewhere) only unmounts if you call `unmount()`
yourself, and most suites never do — there is no reason to, and no visible penalty. The
browser helper does it for you in a `beforeEach`, so every port covers the unmount path for
free: released refs, cleared observers, removed listeners, `onScopeDispose`.

Measured here: a composable's ref-detach branch (`if (!ref) return`, reached only when Vue
releases a template ref at unmount) was covered by the port and not by the original, in a file
whose ten tests mount ten times and unmount zero.

**But be careful how you score it** — this is the one way the coverage oracle in
[section 8](#coverage-parity) will lie to you in your favour. A gained line is *not*
automatically evidence that the real browser earned something. Here the environment
contributed nothing: adding a single `wrapper.unmount()` to a jsdom test covers the exact same
line, verified by writing that test and reading the istanbul hit count. Before you write a
gained line into your results, ask whether the *harness* or the *environment* produced it. If
a `mount()` + `unmount()` in jsdom reproduces it, it belongs in the "we should have been doing
this all along" column, not in the case for browser mode.

### Form submission is a real form submission

Worth checking your assumptions. Three approaches, all tested in Chromium on a slider inside
a form:

| Approach | Result |
|---|---|
| `form.requestSubmit()` | works, but needs a raw `querySelector` escape hatch |
| real `<button type="submit">` + `.click()` | works; `FormData` yields the expected entries |
| implicit submission (Enter on the focused control) | **does not submit** — 0 calls |

The third row is the interesting one. A user pressing Enter on that component never submits
the form — and *neither* the jsdom test nor a naive port would have caught it, because the
original fired a synthetic `submit` event and never exercised the path a user takes.

### Async: `expect.element` retries, `.element()` does not

`expect.element(…)` polls. `.element()` is a synchronous escape hatch that does not. When a
test computes a delta across an interaction, put the awaited assertion **before** reading the
new value, or you race the framework's flush.

---

## 7. Some of your jsdom tests are lying

This is the finding we did not expect, and it is the one most likely to apply to your suite
too.

A test can be green in jsdom because **it never reached the component at all**. Ours:

```ts
const wrapper = mount(Slider)
expect(await axe(wrapper.element)).toHaveNoViolations()  // green for years
```

`axe()` is called synchronously after `mount()`, before the framework flushes. At that instant
the interactive element still carries `display: none` from an SSR anti-jank branch. **axe skips
hidden elements.** So the rule that mattered came back `inapplicable`, the only interactive
element in the component was never audited, and the test passed while asserting nothing about
it.

`await render()` flushes. The browser port audited the real thing and immediately found a
genuine accessibility violation.

The generalisable lessons:

1. **A missing `await` is invisible in a green test.** Porting to an API that forces you to
   await is how you find them.
2. **For any tool that filters by visibility or reachability — axe, testing-library queries,
   actionability checks — check what it *skipped*, not just what it passed.** `results.inapplicable`
   told us in one line what code review had missed for years.
3. This particular bug is **not** jsdom's fault. jsdom reports the same violation once flushed
   — we verified that experimentally rather than assuming. Browser mode did not have better
   detection; it had an API that made the mistake impossible to keep making. **Resist the urge
   to blame the environment before you have run the experiment.**

### The handler your click tests never call

Here is one that *is* the environment's doing, and it is worth checking for before you write off
a whole tier of "boring" files.

`HTMLElement.click()` — and VTU's `trigger('click')` — dispatch a `click` event and **nothing
else**. No `pointerdown`, no `mousedown`, no focus, no `mouseup`. A real click dispatches the
whole sequence. So a component like this:

```vue
<label @mousedown="e => { if (e.detail > 1) e.preventDefault() }">
```

has a handler that **no jsdom click test can reach, in any environment, no matter how many you
write.** Measured on exactly that component: the browser port covers the handler line and the
jsdom original does not, performing the identical gesture on the identical element. The coverage
oracle from [section 8](#coverage-parity) reports it as a gained line without being asked.

This generalises to every `mousedown` / `pointerdown` / focus handler in a component library,
and it is the strongest argument we found for migrating files that look mechanical. A file with
no stubs to delete and no geometry can still be systematically blind to a whole class of
handler.

**Then read the branch map, not the line count.** That same handler's `if (e.detail > 1)` came
back `[0, 2]` — never taken — because nothing in either suite double-clicks. The line went
green; the behaviour it guards is still tested by nobody, in either environment. A covered line
is not a tested behaviour, and a migration that reports gained lines will happily let you
believe otherwise.

---

## 8. Proving the port didn't lose anything

Here is the trap, and it is the whole reason a migration like this needs tooling:

> **A ported test that goes green proves nothing. It may be green because it asserts nothing.**

That is not a hypothetical — it is the *default* failure mode. Faced with an awkward test, the
path of least resistance is to drop an assertion, soften `toHaveAttribute` into
`toBeInTheDocument`, or rename the test to something satisfiable. All of those go green. Do
that across a large suite and you get a fully migrated suite carrying zero information.

If you are handing this work to agents, the danger is acute, but humans under deadline do the
same thing.

Two cheap automated checks close most of the gap. Both are worth building before you migrate
in bulk.

### Structural parity

Parse both files (use the TypeScript compiler API, not regex — `it.each`, template-literal
names and nested describes all defeat regex) and compare the `describe`/`it` name tree plus
the per-test `expect` count. Fail on:

| Check | Catches |
|---|---|
| `INVENTED` | a test in the port whose name is not in the original — renamed, or invented to replace one that would not port |
| `WEAKENED` | a matched test that now runs fewer `expect`s |
| `SKIPPED` | quarantined in the port but not the original, with no recorded justification |

Tests *missing* from the port are progress, not failure, while the migration is incremental.

This is why the convention "**`describe`/`it` names must match the original verbatim**" is
worth enforcing: it costs nothing and it is what makes the check possible at all. If a name
turns out to be a lie, fix the *test* so the name becomes true — do not rename it.

One blind spot to know about, because the natural implementation has it: if you key each test
by its full `describe` path — the obvious design — then **you never actually check the
`describe`s.** They are only compared as substrings of a test's key. A suite that contains no
tests of its own (every one commented out, which real suites do) can disappear from the port
without the checker noticing, and an invented suite goes unnoticed until it acquires a test. We
verified this against a synthetic pair: the parity checker reported neither the dropped empty
`describe` nor the invented one.

Cheap fix, and it doubles as the most useful view during the work: a second pass that prints
the **original's whole tree in source order**, every `describe` and `it` marked present or
missing.

```
✓ Slider.browser.test.ts   39/39 its, 15/15 describes

    ✓ given default Slider
      ✓ it should pass axe accessibility tests   .fails → Slider#axe
      ✗ when disabled   ← L40 not ported
```

The flat "5 missing, … 34 more" output of a parity check tells you the number. This tells you
where you are.

### Coverage parity

Run both projects under coverage, diff the set of covered lines, and fail if the port reaches
**fewer** lines than the original did. Stronger than name parity: names prove the port kept
its shape, coverage proves it still reaches the same code.

It also reports lines **gained**, which is where you find out whether the migration was worth
it. That is how the `useSize` number in [section 0](#0-the-short-version) was measured.

*(Both require your coverage provider to actually instrument component files — see
[section 4](#4-coverage). We ran this oracle for a while against a provider that was silently
skipping every `.vue` file.)*

#### Lost coverage is not automatically a regression — but argue it line by line

The first file we migrated completely ended with **16 lines gained and exactly 1 lost**, and
the lost one turned out to be the best finding in the file:

```ts
export function linearScale(input, output) {
  return (value) => {
    if (input[0] === input[1] || output[0] === output[1])
      return output[0]          // ← covered under jsdom, on every single test
    const ratio = (output[1] - output[0]) / (input[1] - input[0])
    return output[0] + ratio * (value - input[0])   // ← covered only in the browser
  }
}
```

The input range is `sliderWidth - thumbWidth`. Under jsdom every rect is 0×0, so the two ends
are equal and the degenerate branch fires every time; the arithmetic the component actually
ships never ran. A line the jsdom suite reported as covered was covered **by the absence of
layout**.

So "the browser covers less" is sometimes correct — and it is also precisely what a gutted
port looks like. Do not soften the check. Make the exemption explicit, per line, and machine-
checked against the same findings file the quarantine tag uses:

```
component  file             line  finding                          why
Slider     Slider/utils.ts  109   Slider/Slider.test.ts#degenerate  jsdom-only zero-geometry branch
```

An allowance naming a key that does not exist in the findings file fails the run, same as a
quarantine tag would. The point is that arguing your way past an oracle should cost you a
written finding every time.

### Mutation, for the files where the mocks were the whole problem

Name parity and coverage parity both compare the port to the *original*. Neither can tell you
the original was worth preserving. For the heavily-mocked files — the ones you migrated
*because* of the mocks — spend one extra step: break the component in the way the mock papered
over, and check that **the browser test fails while the jsdom test still passes.**

That divergence is the finding. It takes about two minutes per file (edit, run one test in each
project, revert) and it converts "browser mode should be better here" into a result. Don't
bother for the mechanical files; there is nothing to show.

---

## 9. Quarantining bugs the migration finds

You will find real bugs. If you leave those tests red, the suite stops being a usable baseline:
the next batch cannot distinguish its own breakage from inherited noise, and coverage runs get
dragged down with it. If you *fix* them, you have quietly widened a migration into a
refactor.

So quarantine, with a receipt:

```ts
// @finding Slider/Slider.test.ts#axe
it.fails('should pass axe accessibility tests', async () => {
```

**Use `.fails`, not `.skip`.** `it.fails` asserts that the test fails, so:

- the body still **runs**, and still contributes coverage — `.skip` throws that away
  (measured: 257 → 260 covered lines in our case, purely from choosing `.fails`);
- it turns **red the moment someone fixes the bug**, telling you the note is stale.

Reserve `.skip` for tests that crash or hang the runner.

**Make the annotation mandatory and machine-checked.** Ours requires `@finding <key>` naming a
row in a findings file, and the parity checker fails the file if the tag is missing or names a
key that does not exist. Without that, quarantine is indistinguishable from giving up — and it
becomes the path of least resistance for every hard test. Make the escape hatch always cost you
a written finding.

Keep the assertion **exactly as strong as it was**. `it.fails` is what makes the suite green,
never a softer expectation.

---

## 10. What not to migrate

**First decide which migration you are doing**, because it changes this section completely:

- **Browser mode as a second tier**, kept alongside jsdom for the components that need layout
  and real input. Then triage hard, migrate only what pays, and leave the rest alone.
- **Browser mode as a replacement**, with jsdom deleted at the end. Then triage only to
  *sequence* the work. "This file gains nothing" stops being a reason to skip it, because the
  deliverable is removing an environment, not improving a file.

We started on the first and switched to the second, which is why the measurements below argue
one way and the recommendation goes the other. **The switch is worth considering on its own
merits**: two DOM implementations in one repo means two sets of quirks, two setup files, and a
standing question of which environment any given test belongs in. Deleting one is worth real
money even where an individual port is not.

If you are replacing jsdom, exactly one category is exempt, and it is not a judgement call:

**Files that need no DOM at all — send them to a plain `node` project, not to a browser.**
Not "pure logic" as a vibe: run them in `environment: 'node'` with no setup file and see. We
scanned all 97 files for DOM signals (test-utils/testing-library/axe imports, `document`,
`window`, `HTMLElement`, DOM event constructors, `navigator`) and found 10, then confirmed by
running them — **571 tests, 28% of the whole suite, green with no DOM whatsoever.** Those
files never needed jsdom in the first place, and a browser would be an even worse fit than the
jsdom they had. Cumulative cost that vanished for those 10 files alone: 2.71s of setup-file
execution and 2.92s of environment construction, down to 0ms and 2ms.

This is the cheapest step in the whole migration and it is worth doing first, whichever
strategy you picked — a fifth to a third of a typical component-library suite is often pure
data transformation wearing a DOM-shaped test harness.

> A useful side effect: the scan tells you your real ratio before you commit. 87/10 here.
> If yours comes back 30/70, you are not doing a browser-mode migration, you are doing a
> `node` migration with a browser-mode tail.

**Pure logic, if you are keeping jsdom — don't migrate it.** Composables, date maths, colour
utilities: anything with no DOM *layout* even if it touches the DOM. Migrate one or two to
confirm with numbers, then stop.

Our confirmation, since a hypothesis with an obvious mechanism is still a hypothesis. One
composable test file (ten tests, no stubs, no fixture, assertions purely about the framework's
ref forwarding) ported cleanly on the first try — full name and assertion parity, no coverage
lost — and gained nothing for it. Nothing was deleted, because a file that mocks nothing
has nothing to delete, and the port ended up near character-identical to the original. Cost,
steady state over three runs each:

| | jsdom | browser | ratio |
|---|---|---|---|
| total wall clock | 1.11s | 1.72s | 1.5× |
| Vitest-reported duration | 539ms | 1.17s | 2.2× |
| test execution | 17ms | 45ms | 2.7× |

The absolute numbers are the surprise, and they cut against the folklore: a cold Chromium
launch cost about **0.6s**, not the multi-second tax the tiering assumed. So the argument for
leaving pure logic in jsdom is not that browser mode is slow — at this size it is barely
slower. It is that **the port buys nothing**, and a test suite you changed for no gain is
worse than one you left alone.

That same number is what makes the *other* strategy viable, which is the direction we
eventually went. If a boring port costs 1.5× on a file that gains nothing, an all-browser
suite is affordable, and "buys nothing" stops being decisive once the deliverable is deleting
an environment rather than improving a file. **Measure this early either way** — it is the
number that tells you whether replacing jsdom is even on the table.

The one coverage line the port did gain came from the harness, not the browser — see
[the render helper unmounts after every test](#the-render-helper-unmounts-after-every-test),
which is exactly the trap this measurement exists to avoid falling into.

**Audit the tier before you trust it, though.** "Pure" usually gets assigned by "installs no
stubs", which is not the same property. Four of our thirteen touched focus, keyboard, pointer
or axe, and each needed checking against the specific way its jsdom test could be green for
the wrong reason. All four came back negative, and the most interesting one is worth repeating
because it cuts *against* the migration:

> `getActiveElement` is nothing but a shadow-DOM retargeting loop — walk `shadowRoot.activeElement`
> down from `document.activeElement` until you reach the deepest focused node. If jsdom did not
> retarget, that loop would be dead code and its test would be asserting nothing. We fully
> expected that. Probing both environments against the test's own nested-shadow fixture gave
> **identical** results: `document.activeElement` is the outer host and the loop runs exactly
> twice, in jsdom and in Chromium alike.

jsdom's reputation for a weak focus model is real in places, but it is not a licence to assume
any focus-touching test is vacuous. Check the specific mechanism. A negative result costs one
throwaway probe, and it is worth having under either strategy: if you are triaging, it saves
you a port; if you are replacing jsdom anyway, it tells you to expect that port to be boring,
so nobody goes hunting for a finding that was never there.

**Mechanical — cheap, low value.** Attribute and role assertions, no stubs, no geometry. The
translation table handles these almost literally. This is the bulk of the work and the least
interesting part of it.

**Stub-installing or geometry-dependent — this is the point.** Every file that mocks
`ResizeObserver`, pointer capture, `getBoundingClientRect`, `scrollIntoView`, or
`getComputedStyle`. Migrate these first after a trial run; each one should produce a finding.

**Hostile — rewrites, not ports. Do last, by hand.**

- **Snapshots.** A snapshot taken in jsdom will not match a real browser's DOM. Expect to
  regenerate or abandon them.
- **`vi.mock` of a module.** Works in browser mode, but frequently mocks the very thing the
  browser would now do for real, which makes the port pointless as written.
- **Fake timers.** Interact badly with real event loops and Playwright's waiting.

Note that `vi.spyOn` is **not** hostile — it works unchanged.

---

## 11. Open questions

Honest gaps. Do not read past silence here as endorsement.

- **Performance. [unverified]** Deliberately deferred until the migration is complete —
  measuring one ported file tells you about browser startup, not about a suite. The question we
  intend to answer: is browser mode fast enough to be the default, or does it stay a second
  tier for the components that genuinely need layout and real input?
- ~~**Is "pure logic stays in jsdom" actually true? [unverified]**~~ **Answered — see
  [section 10](#10-what-not-to-migrate).** Measured on one composable file: the port is clean
  and gains nothing, at 1.5× the wall clock. The verdict held, but the *reason* it held was
  not the predicted one — browser startup turned out to be cheap (~0.6s), so "too slow" is the
  wrong argument against porting pure logic. "Buys nothing" is the right one. Still
  `[unverified]` for date/colour utilities specifically; only the composable case was measured.
- **Visual regression.** `toMatchScreenshot` exists, but the Vitest docs are blunt that
  screenshots are unstable across environments (font rendering, GPU drivers, headless vs
  headed) and recommend Docker or a cloud service for stable baselines. For a *headless*
  component library with no styling of its own, the thing under test would be the CSS shim
  written for the tests rather than the library. Probably not worth it; revisit if a styled
  fixture tree appears.

---

## Adding to this guide

Every non-obvious thing this migration teaches belongs here, including the negative results —
"we tried X and jsdom was the right call" is a real finding and more useful to a reader than
another success story.

When you add something:

1. **Say how you know.** A number, a snippet, or the experiment you ran. This guide's value is
   that everything in it was hit for real; keep that true.
2. **Mark unproven claims `[unverified]`** rather than softening the language. Readers cannot
   tell "I measured this" from "this seems right" once it is in prose.
3. **Correct entries that turn out to be wrong, in place, and say so.** Section 3 exists in its
   current form because an earlier version of our notes confidently claimed the opposite. A
   guide that quietly edits its mistakes teaches the next reader nothing about how to avoid
   them.
4. **Generalise past our stack where you can.** The Vue and Tailwind specifics are examples;
   the failure modes are not Vue-specific.
