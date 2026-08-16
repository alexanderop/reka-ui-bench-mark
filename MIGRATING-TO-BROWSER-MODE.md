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

The cost is real too, and the honest framing is: **browser mode is not a strictly better
jsdom.** Some files get worse. A test for a pure function pays browser startup for nothing.
Decide per file, not per suite — see [What not to migrate](#10-what-not-to-migrate).

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
| ResizeObserver / pointer-capture stubs | *(delete)* |

`rerender` **merges** rather than replacing — confirmed in source
(`rerender: async props => { await wrapper.setProps(props) }`) and behaviourally. So chained
`setProps` calls port one-for-one.

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

### Coverage parity

Run both projects under coverage, diff the set of covered lines, and fail if the port reaches
**fewer** lines than the original did. Stronger than name parity: names prove the port kept
its shape, coverage proves it still reaches the same code.

It also reports lines **gained**, which is where you find out whether the migration was worth
it. That is how the `useSize` number in [section 0](#0-the-short-version) was measured.

*(Both require your coverage provider to actually instrument component files — see
[section 4](#4-coverage). We ran this oracle for a while against a provider that was silently
skipping every `.vue` file.)*

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

Browser mode is a second tier, not a replacement. Triage before you start; we sorted 97 files
into four buckets and the shape will likely match yours.

**Pure logic — don't.** Composables, date maths, colour utilities, anything with no DOM
layout. A pure-function test gains nothing from a real browser and pays browser startup for
it. Migrate one or two to confirm with numbers, then stop.

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
- **Is "pure logic stays in jsdom" actually true? [unverified]** It is a hypothesis with an
  obvious mechanism, not a measurement. Being wrong about it is a publishable result.
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
