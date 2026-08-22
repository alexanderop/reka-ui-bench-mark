# Migrating a component test suite from jsdom to Vitest Browser Mode

A field guide, written while giving every test in a real Vue component library's 97-file /
2,015-test suite a non-jsdom destination. Everything here was hit in practice and verified in
a browser — no advice from first principles, no "should work". This project retained the original
jsdom files as a runnable comparison corpus after all browser and node destinations were complete.

**Status:** migration complete; the guide remains open to corrections. See
[Adding to this guide](#adding-to-this-guide). Items still unproven are marked **[unverified]**
rather than quietly asserted.

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
the first, ported every DOM-dependent file under the discipline of the second, and ultimately
retained the originals as a runnable comparison corpus. That third operational outcome still
uses browser-counterpart inventory—not jsdom deletion—as its completion measure. Two things
carry over regardless:

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

Install the runner, Playwright provider, Vue renderer, and the browser binary explicitly. The
versions below are the ones measured by this guide; this repository's frozen lockfile is the
reproducibility source.

```bash
pnpm add -D vitest@4.1.10 @vitest/browser-playwright@4.1.10 \
  playwright@1.62.1 vitest-browser-vue@2.1.0 @vitejs/plugin-vue@6.0.8
pnpm exec playwright install chromium
```

On a fresh Linux CI runner use `pnpm exec playwright install --with-deps chromium` so the system
libraries are installed as well.

### Run both environments side by side

Do not flip the suite over in one commit. Run two Vitest **projects** against the same source
tree so you can migrate file by file and diff the two approaches:

```ts
// vite.config.ts
import vue from '@vitejs/plugin-vue'
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
| `userEvent.keyboard('{19}')` (multi-character brace) | type the real keys — a brace that is not a key name fires **no key events** |
| `fireEvent.keyDown(el, { key })` where the code also reads `keyup` | `{Key>}` / `await sleep(0)` / `{/Key}` |
| `el.trigger('click')` on a **disabled** element | `loc.click({ force: true })` |
| `wrapper.findAllComponents(X)[n].emitted('e')` | **no equivalent** — observe the DOM event that drives the emit |
| ResizeObserver / pointer-capture stubs | *(delete)* |

A forced click on a disabled control skips Playwright's enabled-state wait but still asks Chromium
to perform the gesture. Chromium suppresses the button's normal click sequence and may move focus:
to the nearest mouse-focusable ancestor, or to `BODY` when none exists. We measured the latter in
a stepper. Consequently `activeElement !== disabledTarget` can pass while valid focus and selection
were lost. Keep the forced gesture when it is the faithful translation, but assert the current or
selected state that must survive it as well.

Held-key syntax is stateful across browser commands. A helper that returns `{Shift>}{Tab}` without
`{/Shift}` leaves Shift physically held for later interactions and even later tests. We reproduced
this with a time-range test whose later label click stopped activating its input until the modifier
was released. Treat every held chord as a press/release pair unless persistent state is explicitly
the subject.

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

**The child-component `emitted` row has no fix, only a substitute.** The browser helper binds
`emitted` to the root wrapper and never exposes the underlying VTU wrapper, so an assertion about
what the *n*th child emitted cannot be translated directly. If the emit is driven by a DOM event —
many component libraries dispatch a `CustomEvent` and emit from its handler — listen for that event
instead; you also get to pin the target, which the array index gave you for free. One catch worth
knowing: such events are often dispatched with `bubbles: false`, and a **capture** listener on an
ancestor still receives them.

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

### Module mocking (`vi.mock`) works in the browser, unchanged

Worth stating plainly because it is the thing people assume browser mode cannot do. On
Vitest 4, a hoisted `vi.mock('some-package', async factory)` with `vi.importActual`, per-test
`vi.mocked(fn).mockImplementation(...)` swaps, and a mid-test restore of the real
implementation all behave exactly as under jsdom — and the component under test receives the
same mocked module instance the test file sees (we probed that before trusting it: render the
component, assert the mock's call count grew). No configuration, no `{ spy: true }` needed for
a factory mock. Files that were tiered "hostile" purely for `vi.mock` are more portable than
their tier suggests.

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

### A braced key that is not a real key name is not a keystroke

`userEvent.keyboard('{19}')` reads like "type 19". It is a request for a single key whose name is
`19`, which no keyboard has. Vitest's Playwright provider parses the braces, checks the result
against a set of real Playwright key names, and silently falls back to `page.keyboard.insertText()`
for anything else — **and `insertText` fires no key events at all**.

Nothing errors. The test just stops doing the thing it says it does: measured on a date-field port,
the segment never filled, focus never advanced, and 7 of 8 tests still passed. The symptom reads
like a focus bug, which is the expensive part. Type the real characters instead.

Grep your suite for `{` followed by anything that is not a key name — the pattern clusters in
numeric-input tests, where `{1980}` and `{45}` look natural. Watch out for the ones that are not a
one-for-one fix: four digits go through a different accumulation path than one key, so verify per
site rather than rewriting in bulk.

### A synthetic keypress has no duration, and real code races it

This is the subtler half of the same problem. A real key is held for ~80ms; a synthetic one is
pressed and released in the same tick. Browsers service input tasks before timer tasks, so
`userEvent.keyboard('{ArrowDown}')` delivers **keyup before a `setTimeout(…, 0)` scheduled from the
keydown**. Any component that latches state on keydown, clears it on keyup, and defers work by a
zero-delay timer will observe the flag already cleared.

Measured on a radio group built that way, over 15 isolated renders each:

| Gesture | Selections |
|---|---|
| `userEvent.keyboard('{ArrowDown}')` | **1 / 15** |
| `{ArrowDown>}` + `await sleep(0)` + `{/ArrowDown}` | **15 / 15** |

The keyboard API takes no delay option, so the hold syntax is the only lever. It is also the
*faithful* translation, not a workaround: `fireEvent.keyDown` dispatches a keydown and **never a
keyup**, so the jsdom original left that flag stuck `true` for the rest of the file — the keyup
handler had a hit count of zero across the entire suite. And it is the *realistic* one, because a
human always wins this race.

### A held modifier survives the test unless you release it

Keyboard descriptors such as `{Shift>}{Tab}` intentionally leave Shift pressed. Browser keyboard
state is shared beyond the current component render, so later files can inherit it. This can hide
for many green focused runs and surface only under a different full-suite order. Measured example:
a date-field loop left Shift down, then six unrelated ToggleGroup ArrowLeft/ArrowRight focus tests
failed; ToggleGroup alone stayed 15/15 green. End every chord with its release token—e.g.
`{Shift>}{Tab}{/Shift}`—unless persistent modifier state is the contract.

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

### Gestures Playwright has no API for: reach through CDP

Playwright has no IME and no multi-step touch API, so a port that needs `compositionstart` or a
`pointerType: 'touch'` swipe is tempted to keep the jsdom-era synthetic dispatch. On Chromium you
do not have to: `import { cdp } from 'vitest/browser'` hands you the page's DevTools session
(gated by `browser.api.allowWrite` / `allowExec`, both default `true` on localhost). Measured, in
a throwaway test inside our browser project:

```ts
const s = cdp()
// IME: two composition updates, then a commit
await s.send('Input.imeSetComposition', { text: 'x', selectionStart: 1, selectionEnd: 1 })
await s.send('Input.imeSetComposition', { text: 'xiang', selectionStart: 5, selectionEnd: 5 })
await s.send('Input.insertText', { text: '想' })
// → compositionstart, compositionupdate:x, beforeinput/input (isComposing: true), …,
//   compositionend:想; input.value was 'xiang' mid-composition and '想' after

// Touch: page-level coordinates, so offset AND scale by the tester iframe (next section)
await s.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] })
await s.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y1 }] })
await s.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
// → pointerdown/move/up with pointerType 'touch' (pointerId 2) + touchstart/move/end,
//   without hasTouch; navigator.maxTouchPoints stayed 0
```

Same session, same idea for accessibility: `Page.getFrameTree` → the tester iframe's `frame.id` →
`Accessibility.getFullAXTree({ frameId })` returns **the engine's** tree, which is a different
thing from the ivya model the locators and ARIA snapshots use (section 12). Chromium only — under
Firefox/WebKit `cdp()` is undefined, so guard with `it.skipIf(server.browser !== 'chromium')`
in any file that runs on several engines.

### Tests run inside an iframe — and the iframe may be scaled

Raw `page.mouse` and `cdp()` take **page-level** coordinates, so you would have to offset by
the iframe rect yourself. Prefer locator methods. Custom commands are the escape hatch when
you genuinely need page-level control.

The offset is the obvious half. The half that bit us for the entire migration: with the browser UI
off, the Vitest 4.1 Playwright provider does not copy `browser.instances[].viewport` to the outer
context, so a 414×896 tester iframe inside Playwright's 1280×720 default page is CSS-scaled to fit
— 333×720, scale 0.80, readable from inside the test because the frame is same-origin:
`window.frameElement.getBoundingClientRect().width / window.innerWidth`. Locator actions compensate
for that; our custom mouse commands, which added iframe-CSS offsets to `iframe.owner().boundingBox()`,
did not, and `mouseDown(100, 200)` was landing at client (124, 249) — **1.24× off** — in every test
that used them. They all passed, because their assertions tolerated it; one passed *because* of it
(a "move the pointer outside the component" step was actually moving it outside the iframe). The
fix is one line and the same one that un-scales screenshots: give `playwright()` a
`contextOptions.viewport` equal to the instance viewport. Then audit every test that computes page
coordinates by hand; ours had one that only worked wrong.

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

### Locator text — and role *name* — matching is substring by default

`@testing-library`'s `getByText('checked')` is a whole-string match; the vitest locator of the
same name is a **substring, case-insensitive** match, and so is the `name` option of `getByRole`.
Both bite hardest when your domain strings are prefixes of each other:

- `getByText('checked')` happily matches an element whose text is `unchecked` — measured; a
  toggle test written this way passes against a switch that never toggles.
- `getByRole('option', { name: 'Apple' })` matches Pine**apple** too — measured; with two matches
  it fails loudly as a strict-mode violation, but with one match today it silently widens the
  query until the day a colliding item is added.

Pass `{ exact: true }` whenever the string is data rather than a label you control. The loud
strict-mode failure is the lucky case; budget an audit for the quiet ones, because name parity
tooling cannot see a query that merely got wider.

Better: turn the default off. **Vitest 4.1.3 added `browser.locators.exact`** (the v5 default,
available now), which makes every text locator and role `name` whole-string unless a call opts
out with `{ exact: false }`. Flipping it on our finished 97-file corpus failed **2 tests of 1526**,
both one locator: `getByRole('menuitem', { name: 'New Tab' })` had been silently matching an item
whose accessible name is `New Tab ⌘ T`. That is the audit the previous paragraph asks for, run by
the engine in 20 seconds — do it before the port is "done", not after.

Matcher text can be equally permissive. `toHaveTextContent('1')` passes for initial values such as
`12` and `1980`, and `toHaveTextContent('5')` accepts a broken accumulated value like `20245`.
For date/time segments and other finite rendered values, compare trimmed text exactly—including
visible padding such as `00`, `01` and `07`—so the assertion distinguishes overwrite, reset and
formatting behavior.

### An open modal makes the rest of the page *really* inert

Overlay libraries implement modality by setting `pointer-events: none` on `<body>` and re-enabling
it on the overlay content. jsdom does not hit-test, so its synthetic clicks sail through — your
jsdom suite can "click" the trigger of an open modal, or a button behind it, and the component
answers. A real browser refuses: the click times out on actionability, and even a forced click
does not help, because forcing skips the *wait*, not the routing — the trusted input lands on
`<html>` (the one element above the inherited `none`) and becomes an **outside press**, which
*dismisses* the overlay instead of reaching the element.

Three consequences for a port, all measured on a modal select:

1. A jsdom test that interacts through an open modal is performing a gesture no user can make.
   The honest translation is whatever a user actually has: Escape, selection, or a deliberate
   outside press — not `force: true`.
2. The **keyboard is exempt.** `pointer-events` gates pointers only; focus movement and keydown
   still work behind a modal. When a fixture's control is pointer-unreachable, keyboard
   activation is a legitimate real gesture — but see the next subsection for how it can lose a
   race.
3. If your jsdom suite appeared to cover the outside-press dismiss path anyway, check *which
   instance* covered it before trusting the port to match — see the zombie-listener entry in
   [section 8](#coverage-parity).

### Fake timers work in the browser — and freeze `requestAnimationFrame`

`vi.useFakeTimers()` in browser mode is real: the fake clock installs on the tester-iframe
window, `vi.getTimerCount()` sees the component's pending timeouts, and a spy on
`window.clearTimeout` observes unmount cleanup. Crucially, Playwright actions and retrying
matchers run on **real time outside the page**, so you can still click, type, and poll while the
page's clock is frozen — a test that freezes time and then performs real input is a coherent
thing to write.

The trap is the default `toFake` set, which includes `requestAnimationFrame` and `performance`:

- Anything positioning-dependent (floating-ui, measurement loops) freezes until *something* lets
  a frame through — at which point deferred callbacks fire at an arbitrary later moment, such as
  the middle of your next `userEvent` call. Measured: a popover's deferred auto-focus fired
  mid-keystroke and stole focus, turning "press Enter on the Close button" into "select the
  first item" — with every assertion still passing.
- A hand-rolled wait built on `performance.now()` deadlocks, because the faked clock never
  advances on its own.

Under browser fake timers, drive state through microtask-only paths (direct events, Escape) and
never wait on anything rAF-dependent. `[unverified]` whether adding `toFake` exclusions for
`requestAnimationFrame`/`performance` is safe for components that *read* the faked clock — we
kept the default and routed around it instead.

The freeze also reaches **measurement-driven rendering**. A second component sized its popup
with a CSS variable set from a ResizeObserver callback; under fake timers the measurement never
landed, the `overflow: hidden` container computed 0px tall, and every element inside the open
menu hit-tested to the content *behind* it — so a real hover of the popup's contents was
impossible (the driver burns its full timeout on "element intercepts pointer events"). In that
situation the jsdom original's synthetic boundary-event dispatch is the *correct* port, not a
compromise: it is the only gesture that exists while the clock is frozen, and it still runs the
real framework-bound handler.

### A real click hovers first

The click driver moves the pointer onto the element before pressing, so every
`pointerenter` / `pointermove` handler fires before `mousedown` does — the inverse of jsdom,
where a click was only ever a click. On hover-triggered components this rewrites what your
click tests mean:

- "opens on click" still passes, but through the hover-open path (our menu ignores a click that
  follows its own hover-open within 300ms — so the click branch was never what passed).
- "must NOT open on click when the click trigger is disabled" cannot be expressed with real
  input at all if hover remains enabled — and `HTMLElement.click()` is not the answer either,
  because Chromium dispatches it as `PointerEvent { pointerType: '' }`, which mouse-only guards
  deliberately let through for keyboard and assistive tech. The faithful port is the original's
  own explicit synthetic event with `pointerType: 'mouse'`.
- The clean way to cover the true click-open branch is the configuration that disables hover —
  if the suite has such a test, the branch keeps its coverage there.

And mind real `href`s: a real click on a link with a live URL navigates the tester iframe away
mid-suite. Cancel the navigation with a **bubble-phase** `document` click listener added for
that one click — bubble, not capture, so the component's own click logic has already run.

### Not every mock is yours to delete

The migration thesis is "browser mode lets you delete mocks" — but only the **compensating**
ones, the stubs that fake what the browser would have done (rects, pointer capture,
ResizeObserver-as-no-op). A stub that **constructs the test's scenario** ports *with* the test.
Our example: a describe that mocks ResizeObserver to fire its callback twice, synchronously, on
`observe` — because the subject is how many times a slot re-renders under RO-driven position
updates. A real RO delivers on frame timing and cannot anchor exact-count assertions; deleting
that mock doesn't make the test more real, it makes it flaky. Keep it, scope it to the
describe, restore the native implementation afterwards, and record it as a deliberately kept
stub. Ask of every stub before deleting: is this faking the environment, or is it the input?

Corollary, for the numbers such choreography asserts: when the real environment shifts a
mock-era expectation (our slot-render ladder went from jsdom's 3-then-4 to the browser's
4-then-4, because real positioning happens at open instead of a tick later), **measure for
determinism before deciding**. Repeated isolated runs plus a settle-window probe showed the
browser numbers stable — and actually a stronger form of the test's claim ("the count does not
keep growing") — so we pinned the new values with a written finding. If the numbers had
wobbled, quarantine would have been the answer, never a loosened matcher.

### DOM snapshots become real — and inherit screenshot problems

An HTML snapshot of a component whose geometry was stubbed is stable by vacuity: every thumb
ratio, every size variable is the same fiction. Migrate it and the snapshot starts carrying
*measured* values — ours gained a computed `--thumb-height: 18px` and a post-scroll
`translate3d(0px, 0.79476px, 0px)`. Three practical rules:

1. The browser test file writes its **own** snapshot file, so the old baselines survive — diff
   them; the delta is a compact record of everything the stubs were inventing.
2. Those measured values come from layout, and layout comes from fonts. A sub-pixel transform
   derived from how text wraps is deterministic on one machine image and different on another —
   HTML snapshots of real layout are machine-class-dependent the way screenshots are. Verify
   local determinism (run it three times), and if cross-machine CI matters, normalize computed
   values with a snapshot serializer rather than re-stubbing the geometry.
3. Watch for stubs that were silently *authoring the fixture*. Our scrollbars are headless —
   they have no intrinsic thickness, and unstyled they measure zero, so the corner component
   that sizes itself from them could never render. The jsdom prototype stub
   (`offsetWidth = 10`) wasn't compensating for missing layout there; it was designing a 10px
   scrollbar nobody had written. The port moves those 10px into real CSS on the fixture, where
   they are visible and reviewable.

Related: `el.scrollTop = 40` in a real browser *scrolls* — the browser fires the scroll event
itself, asynchronously. Delete the hand-dispatched event along with the property stub, and give
the assertion a poll to absorb the frame delay.

### Virtualized lists settle late — and start by rendering everything

jsdom migrations of virtualized components usually carry a `getBoundingClientRect` stub so the
virtualizer sees a non-zero viewport. Delete it — the inline `height: 200px` your test always
declared is real layout now — but know what the stub was hiding: under a real ResizeObserver
the virtualizer's first render mounted **all** rows, and only trimmed to visible+overscan once
the measurement landed a beat later. Any fixed flush choreography from the jsdom test is
calibrated to the stub's synchronous timing, not the component. Let the assertion own the wait:
`await expect.poll(() => options().length).toBeLessThan(total)`.

Keep layout ownership coherent when driving the observer. Directly mutating an inline style that
Vue owns can make the ResizeObserver callback trigger a render that restores Vue's old style,
creating a real `ResizeObserver loop completed with undelivered notifications`. Put test dimensions
in reactive fixture state and change them through the fixture's control so Vue and the native
observer agree on the transition.

The same rule applies to initial geometry: if an observer callback writes a corner or gutter size
that immediately resizes another observed track, declare the fixture's settled track length up
front when that transition is not the subject. That removed the warning on all three engines in
the functional ScrollArea regression. If an integration sheet deliberately exercises the natural
multi-element mount, filter only the browser's complete known deferral message and keep every
other error fatal. Measured on Vitest 4.1.10: `onUnhandledError` can accept that event so the test
passes, but the Vite client still prints its own diagnostic; a broad substring or blanket browser
error listener would hide unrelated failures.

### Rituals that reconstruct the event sequence just evaporate

A jsdom suite that needed a browser-compat sequence has to hand-assemble it — `pointerdown`,
then synthetic `mousedown`/`mouseup`/`click` — and then work around the side effects of its own
assembly. Ours needed **two** `pointerup`s per menu selection, with a comment explaining that the
component "prevents accidental pointerups": the component's capture guard was armed by the
opening gesture and swallowed the first one. A real click *is* the accidental pointerup that
guard exists for — it arrives at the unmoved press position, the guard consumes it and disarms,
and the next real click selects on the first try. The double-dispatch does not port because the
thing it worked around does not happen to a real pointer. When an original fires the same event
twice with an explanatory comment, the comment is usually describing the gesture's
incompleteness, not the component.

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

### …but a container you created yourself is never cleaned up

The cleanup only removes containers the render helper made. A test that builds its own — the usual
shape for a server-rendering/hydration test — leaves it, and everything mounted into it, attached
for the **rest of the file**:

```ts
const container = document.createElement('div')
container.innerHTML = await renderToString(serverApp)
document.body.append(container)
clientApp.mount(container)                    // still live in every later test
```

Measured: in the next test, a document-scoped `getByRole('tab')` returned **4** elements where the
component under test has 2. This matters because the testing-library-style `getBy*` helpers are
document-scoped by default (see [section 2](#2-the-translation-table)) — so a role-query translation
of `wrapper.findAll('button')[1]` quietly indexes into the leftovers. Container-scope every query in
a file that contains a self-mounted test, and expect the same hazard from any manual `unmount()`.

### Server-rendering works in the browser, if the package lets it

Worth checking rather than assuming, because the plausible fear — "the `browser` export condition
gives you the runtime-only build, so SSR is impossible" — turns out to be wrong for the obvious
reason: the SSR package has no `browser` condition at all. Vue's server renderer resolves to its
esm-bundler build, a pure string builder with no Node imports, so `createSSRApp` → `renderToString`
→ hydrate runs unchanged inside the tester iframe, and spies on `console.warn` / `console.error`
observe hydration warnings exactly as they did under jsdom.

Check your framework's `exports` map before rewriting an SSR test. And when the port goes green,
remember a hydration test's assertions are usually *negative* ("no mismatch warning") — construct
the mismatch deliberately once, confirm the spy catches it, and you have proof the test can fail.

Warnings need causal isolation too. In one migrated suite a helper dropped the Promise from the
click that should have mounted a nested dialog, so a count-only assertion passed on a warning from
the still-open outer instance. Await the action, clear the targeted spy after unrelated teardown,
filter known compiler noise if necessary, and assert the exact warning message—not merely that one
warning occurred.

Browser mode also cannot recover production behavior that source code disables under test mode.
If a hook returns for `MODE === 'test'`, the same assertion in Chromium still exercises nothing.
Testing that contract requires a production-mode seam or build and a concrete observable target;
otherwise document the gap rather than presenting browser execution as proof.

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

### Shared helpers should fail at the call site — `vi.defineHelper`

A migration grows helpers: a VTU-shaped compat adapter so large ports keep their
`find(sel).trigger(…)` phrasing, a story-sheet helper with scoped `cell.get(sel)` queries,
file-local `expectSelectedRange(…)` functions. Every one of them moves the failing frame out of
the test and into the helper, and the test line becomes frame 2 — if the reporter shows it at
all. Vitest 4.1.0 added `vi.defineHelper(fn)` for exactly this. From source it is tiny: the
wrapper is a function literally named `__VITEST_HELPER__` (`vitest/src/integrations/vi.ts:614`),
and the stack parser does `findLastIndex(frame => method.includes('__VITEST_HELPER__'))` and
slices everything above it away (`@vitest/utils/src/source-map.ts:235`). Browser mode is
covered because the tester ships the raw error up and the server parses it through the same
function (`browser/src/node/rpc.ts:177`). We measured six shapes in Chromium on 4.1.10:

| helper shape | where the `❯` frame lands |
|---|---|
| unwrapped `function h() { expect(a).toBe(b) }` | inside the helper; the test line is frame 2 |
| `vi.defineHelper(() => { expect(a).toBe(b) })` | **the test line** |
| wrapped `async` around `expect.element(…).toHaveAttribute` | the test line; the `Caused by: Matcher did not succeed in time` too |
| wrapped `rect` → wrapped `get` → `throw new Error('no element matching …')` | the **`rect(…)` call** in the test — nesting collapses to the outermost helper |
| `find(sel)!` then `.attributes()`, unwrapped | `TypeError: Cannot read properties of null (reading 'getAttribute')` at the adapter's `attributes` |
| the same, both wrapped | the test line — **same useless message** |

Three things the docs example does not tell you, all visible in that table:

1. **It trims any error, not only assertion errors.** A plain `throw new Error` inside a helper
   lands at the call site too, so a `cell.get(sel)` that throws "no element matching" is a full
   citizen.
2. **Nested helpers resolve to the outermost call.** `findLastIndex` means the frame closest to
   the test wins, which is what you want for `rect → get`.
3. **It trims the stack, not the message.** The last two rows are the trap: a compat adapter
   built on `querySelector(sel)!` keeps saying "Cannot read properties of null" no matter how you
   wrap it. Pair the wrapper with a guard that names what was asked for — and put the guard on the
   *consuming* method, not on `find`, because `find(sel).exists()` is how ports assert absence.
   (That is VTU's own design: `find` returns an `ErrorWrapper` whose methods throw "Cannot call
   attributes on an empty DOMWrapper".) With both, the same stale selector fails as
   `cannot call attributes() on an empty BrowserElement (no element matching "[role="nope"]")`
   with the caret on the test line (measured in the then-present compatibility adapter, which the
   final native-interaction audit later deleted).

Where it pays, in our tree: the compat adapter's methods (`find`, `findAll`, `attributes`,
`trigger`, `setValue`, `text`, `html`); the sheet helper's `cell(name)`, `cell.get`, `cell.getAll`,
`cell.rect` — `cell('Nope')` now reports at `:7:55` in the sheet file instead of
`defineHistoireStory.ts`; and file-local assertion helpers with several `expect`s inside. Where it
does not: custom matchers registered with `expect.extend` (they already report at the call site),
`setup()` factories (they fail once, at the one `await setup(…)` line anyway), and helpers called
in a loop, where the call-site line is ambiguous across iterations — keep a `message:` that names
the iteration. One cost: the helper's own frames vanish entirely, so while you are *writing* a
helper, a bug inside it points at its caller. Wrap helpers once they are stable.

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

A second axe shape, from a different component: **the rule runs and abstains, and the matcher
calls that a pass.** An element that is `aria-hidden="true"` *and* `tabindex="0"` (a focus-proxy
pattern several headless libraries use) is a straight `aria-hidden-focus` violation in a real
browser — but jsdom has no layout, axe cannot decide whether the element is focusable, and it
files the node under `incomplete`. `toHaveNoViolations` reads only `violations`, so the jsdom
test had been green over a real WAI-ARIA violation the whole time. When you port an axe test,
diff the `incomplete` bucket between environments, not just the violations.

### Valid is not the same as correct

Even a complete, real-browser axe audit cannot know your product's intended state. We measured a
deliberately broken tab widget in Chromium: it displayed Password content, but Account retained
`aria-selected="true"` and the visible panel's `aria-labelledby` still referenced the Account tab.
axe-core 4.9.1 ran its relevant ARIA relationship, value, role and naming rules and returned
**zero component violations**. The browser exposed exactly what the attributes said: Account was
selected and the panel's accessible name was Account.

That is not an axe false negative. Each attribute is valid and each reference resolves; only the
application knows that the user just selected Password. Test that second layer with an accessibility-
tree assertion such as Vitest Browser Mode's `toMatchAriaInlineSnapshot`: assert the tab list, the
selected Password tab and the panel named Password as one semantic state. Keep the axe test beside
it. The two assertions answer different questions: **axe checks general accessibility rules; an
ARIA snapshot checks product-specific meaning.**

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

### The test that only passes because its sibling ran first

Port a suite mechanically and you inherit its **execution-order coupling** along with everything
else. The shape to look for is a shared module-level spy asserted cumulatively:

```ts
// block 1
it('should trigger submit once', () => {
  expect(handleSubmit).toHaveBeenCalledTimes(1)
  expect(handleSubmit.mock.results[0].value).toStrictEqual({ test: 'true' })
})

// block 2 — submits once more, and counts on block 1's history
it('should trigger submit once', () => {
  expect(handleSubmit).toHaveBeenCalledTimes(2)   // ← passes only in order
  expect(handleSubmit.mock.results[1].value).toStrictEqual({ })
})
```

Both blocks are named *"should trigger submit once"* and the second one asserts two. Run it
alone, or with `--shard`, or after a `.only` upstream, and it fails. Nothing in a port flags
this: the names match the original verbatim, the assertion count is unchanged, and both suites
are green — so a name-and-count parity oracle passes it.

We had eight such files and assumed all eight were coupled. **Seven were.** The eighth performed
both submits inside its own hook and was already self-contained — which is also the fix for the
other seven: clear the shared spy in the block's `beforeEach`, and let each test assert its own
`times(1)` + `results[0]`. Same number of assertions, no coupling, and the test names stop being
false.

Two things make this worth doing during a migration rather than after. Per-test unmounting
already forces you to rebuild *component* state in each block, so you are editing these hooks
anyway — rebuilding the *spy* state is the same thought, one line away, and easy to miss because
the tests stay green when you don't. And a cheap oracle exists: **set `clearMocks: true` and run
the suite.** Every order-coupled cumulative assertion turns red at once, and you get the exact
list instead of a guess. (Vitest 5 makes `clearMocks: true` the default, so this stops being
optional. Its clear runs *before* `beforeEach`, so a hook that records its own calls is safe.)

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

The most deceptive version is a truthful-sounding name with an unconstructed premise. We found an
ordering test where registration and DOM order were identical, so deleting the sort stayed green,
and snap-release tests whose "clamp" and "fast swipe" outcomes were already produced by fallback
branches. Repair the existing case by making the two orders differ or choosing inputs on opposite
sides of the branch boundary, then mutate the named branch. Name parity cannot detect a fixture
that never reaches the condition its name describes.

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

#### Exclude compatibility adapters from the coverage comparison

A migration may introduce a small browser-only wrapper that preserves convenient test APIs while
delegating to the browser renderer. If that helper lives under the instrumented source tree, every
port that imports it appears to gain the helper's lines. That is harness coverage, not product
coverage. Exclude the exact adapter path in the coverage collector (as you already exclude test
files), then rerun the comparison. In one measured batch this changed an apparent +49 to +25 and
an apparent +29 to +1 without changing any product test.

The second legitimate class of lost line, and the harder one to spot: **coverage produced by
zombie instances.** A jsdom suite that never unmounts (and few do — `mount()` without an
explicit `unmount()` leaks the app) accumulates live document-level listeners from every overlay
any previous test opened; wiping `document.body.innerHTML` removes the elements but not the
listeners. Later tests' events are then processed by dead components, and the lines they execute
show up as covered. We bisected one file's entire outside-press dismiss path this way: no test
covers it in isolation, the full file covers all of it — and the mechanism was exquisite, because
the listener registration is deferred by `setTimeout(0)`, which a single test's microtask-only
hook chain never fires, so **the listener only ever attached between tests, on instances that
were already dead.** A browser port cleans up per test and loses those lines; what it actually
lost is the illusion. The bisect — run 1 test, run 2, diff the coverage — is cheap and settles
it either way.

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

- the body still **runs up to its first failure**, and contributes that coverage — `.skip` throws that away
  (measured: 257 → 260 covered lines in our case, purely from choosing `.fails`);
- it turns **red the moment the whole body passes**, telling you the note is stale.

Reserve `.skip` for tests that crash or hang the runner.

**Make the annotation mandatory and machine-checked.** Ours requires `@finding <key>` naming a
row in a findings file, and the parity checker fails the file if the tag is missing or names a
key that does not exist. Without that, quarantine is indistinguishable from giving up — and it
becomes the path of least resistance for every hard test. Make the escape hatch always cost you
a written finding.

Keep the assertion **exactly as strong as it was**. `it.fails` is what makes the suite green,
never a softer expectation.

There is a sharp limit: `.fails` marks the **whole test**, not one expected assertion. Any thrown
assertion, hook error, or timeout satisfies it; assertions after the first throw do not execute.
We measured this with a three-assertion test whose middle browser-only mismatch made regressions in
the first and third assertions invisible. Reordering, soft assertions, `afterEach`, and
`onTestFinished` did not help. Move independent contracts to setup shared with at least one
non-quarantined sibling, or to an existing non-quarantined test. Before quarantining, count the
assertions and ask which one is expected to fail.

### Preserve what a query means, not just what it matches today

A tag selector and a role locator can return the same node in the current fixture without being
equivalent assertions. We mutated a rendering primitive to serve `as="button"` as
`<div role="button">`: the original tag query failed, while the role-only browser port passed all
15 tests. When the component chooses the element and the tag is the contract, preserve the CSS tag
query with the render container. Use a role locator when accessible semantics are the subject.

Matcher semantics can hide the same class of weakening. Distinct DOM elements with identical
markup can compare equal under structural equality. We measured three navigation assertions where
the expected sibling was wrong—one loop case and reversed Home/End targets—and `toStrictEqual`
still passed because every fixture node was the same empty `<div>`. When the contract is *which
node* was returned or focused, use reference identity (`toBe`) and start from a node that makes the
requested movement observable.

Query semantics can make an assertion self-fulfilling. We reviewed a test that discovered items
with `getByRole('option').elements()` and then asserted that every returned node had
`role="option"`. Removing a role merely removes that item from the returned subset; the loop can
stay green. Discover the complete fixture through an independent stable marker, then assert the
role. The same independence rule applies to expected values: do not calculate an expected public
label with the same production helper the component calls. Use literal expectations for a finite
fixture so a helper regression cannot move both sides together.

Counts do not establish the identity of stateful items. We mutation-tested two range pickers by
shifting their selection predicate one period: the original count-only assertions stayed green
while the selected years/months were all wrong. For a named range contract, assert the complete
literal ordered labels and the exact start/end nodes. A count, one interior member, or merely the
existence of generic endpoint markers cannot distinguish the intended range from an offset one.

Real input helpers can also bundle an event you meant to test with another event that satisfies
the same assertion first. We measured Chromium emitting a `pointermove` for
`page.mouse.move(x, y)` even when the pointer was already at exactly `(x, y)`. A helper that
implements mouse-down as “move, then press” therefore cannot isolate a down handler when move and
down share the callback. Pre-position first, then call a press-only `page.mouse.down()` command
when the event type itself is the contract.

Wrapper scope matters too. Vue Test Utils' component-wrapper `find`/`findAll` includes component
root nodes, while a DOM-wrapper `findAll` excludes the wrapped node itself. In the browser render
helper, roots are direct children of the container, so a container query preserves the first
semantics and `element.querySelectorAll` preserves the second. Translating both to one locator can
produce the same count on today's fixture while testing a different tree.

### Synchronize on outcomes, not framework ticks

Framework flush helpers are usually an implementation detail in a browser test. In Vitest 4.1.10,
`expect.element(locator)` is implemented as `expect.poll(...)`: it re-queries the locator and
re-runs the matcher every 50ms for up to 1000ms by default. The official component examples pair
an awaited real interaction directly with a retrying DOM assertion:

```ts
await button.click()
await expect.element(screen.getByText('Saved')).toBeInTheDocument()
```

An audit of 14 `nextTick()` calls across completed Vue browser ports produced three translations:

- **A tick immediately before `expect.element`: delete the tick.** The assertion already owns the
  wait for the condition it names.
- **A tick after mount, used only before locating eventual content: wait on the locator instead.**
  Once it exists, take a raw node only if a structural API such as `Node.contains` requires one.
- **A tick after an awaited real click whose handler performs a synchronous Vue update: delete the
  tick and keep the immediate assertion.** The browser command returns after the event task and its
  microtask checkpoint. We measured this first on an attribute toggle and then mutation-verified it
  on an unmount path: delaying unmount by 500ms still made both exact assertions fail.

Two source details prevent this from becoming a slogan. `await render()` does not itself call the
framework's tick; in `vitest-browser-vue` its thenable records a trace mark around a synchronous VTU
mount. `await rerender(props)` does await VTU `setProps()`, and that method already returns Vue's
`nextTick()`. Do not add another tick after rerender.

Keep a framework tick when the contract really is "after exactly one render flush", when a test
mutates reactive state without an awaited browser interaction, or when a low-level lifecycle test
needs that boundary. Timers, animations, network work, and async watchers need synchronization on
their own observable outcome; a tick cannot make them complete.

### A mounted overlay is not yet a positioned overlay

Portal content can exist before a positioning engine has made it user-visible. In one measured
popover, the floating wrapper was inserted immediately with `transform: translate(0, -200%)` and
only moved on-page after Floating UI finished measuring. An eager role count therefore proved DOM
insertion, not the premise named by an "after opening" accessibility test. Wait for independent
public state such as the trigger's expanded attribute and visible content; if layout is relevant,
also require the wrapper to leave its explicit measuring sentinel before auditing.

Use the settled browser state to reassess copied axe exceptions too. That popover's DOM-emulator
test disabled the dialog-name rule, but the live dialog was already labelled by its trigger and
Chromium passed the rule. Carrying the exception forward would have silently reduced the audit for
no current reason. This was established by running the full rule set after the positioned-state
precondition and observing the dialog-name rule pass on the live dialog.

### Do not use a retry to pre-settle the assertion under test

A retrying matcher waits for its own condition, not for a generic framework flush. We verified the
failure mode by delaying an instant-unmount path by 500ms: the original synchronous tests failed,
while a browser port that first retried the same condition and then read it synchronously stayed
green. Synchronize on a distinct precondition before the interaction, then retain the original's
instantaneous assertion. For duration-named tests, never retry the timed condition itself; moving a
200ms fixture update to 900ms made the original fail and the retrying port pass within its budget.

### Expect the real platform to invalidate DOM-emulator assertions

Property reflection is one source. We bound `hidden="until-found"` through Vue in both
environments: jsdom modeled `hidden` as boolean and reflected the content attribute as `''`, while
Chromium modeled the enumerated platform value and reflected `'until-found'`. The browser matched
the component's comment and intended behavior; the preserved original assertion had to be
quarantined as a jsdom artifact. When an attribute assertion diverges, inspect the DOM property and
the framework's prop-vs-attribute patch path before changing the browser test.

CSS lifecycle is another. A Presence suite injected real keyframes, but jsdom returned an empty
`animationName` for every element and therefore exercised only instant unmount. Chromium reported
the real name, started the exit path, kept the node mounted, and covered six animation-specific
lines that jsdom never reached. The faithful browser test contradicted the old assertion because
the old assertion described the emulator. Keep the mismatch as a finding, and replace synthetic
event-property patches with the browser's real `AnimationEvent` where possible.

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

- **Other engines — answered, see [section 13](#13-other-engines-a-chromium-green-suite-is-a-chromium-suite).**
  Firefox and WebKit run the whole corpus with 18 and 12 engine-specific failures, all recorded;
  headed mode is still unmeasured `[unverified]`.

- **Performance. Answered, and the aggregate number is the least useful one.** In the dated
  migration-close like-for-like benchmark, Chromium ran 89 files / 1446 runtime tests in
  **12.10s** wall clock against the retained
  jsdom project's 87 files / 1444 tests in **10.75s** — about **1.13×**, no sharding required.
  But three different numbers are all true at once, and quoting the wrong one leads to the wrong
  decision. A later reference-suite audit added unpaired behavior/accessibility contracts, so its
  larger current totals are deliberately not substituted into this paired comparison:

  | question | number |
  |---|---|
  | what does the full suite cost? | **1.13×** |
  | what does *one file* cost, watch-mode style? | **~1.9×** (single-file cold start; ~0.6s of it is an unamortized Chromium launch) |
  | what does one mouse click cost? | **26ms vs 0.03ms — ~800×** |

  The mechanism, measured: **there is no per-test tax.** A trivial test is 0.03ms in both
  environments; `render()` is 0.31ms against `mount()`'s 0.22ms; a locator query is 0.02ms and a
  *passing* `expect.element` is 0.08ms. The entire regression lives in real input, and mostly in
  one check — `locator.click()` costs 26ms, `click({ force: true })` costs 8ms, and the 18ms
  difference is Playwright's **stability** actionability requirement waiting two animation frames
  (measured at 16.65ms in headless Chromium). `fill` does *not* require stability and costs 2ms,
  which is the control. So the count of real-input calls in a file predicts that file's slowdown
  with **r = 0.95**, and across 87 file pairs 744 pointer actions accounted for **46%** of the
  total regression.

  The corollary is the part worth carrying away: **28 of our files make no real input at all, and
  26 of those are *faster* in Chromium** (mean −37ms), because a native DOM beats a JavaScript one
  and browser mode pays nothing for jsdom's per-file environment construction, transform step, or
  mock-heavy setup file. Browser mode is not slow. *Acting like a user* is slow, and it is slow
  because a user is slow.

  One asymmetry to budget for regardless of suite size — and **the one config change actually
  worth making**: a **failing** retrying matcher costs **~15s** against jsdom's ~8ms, measured
  twice on different matchers. That is not the matcher's own timeout (`expect.poll` defaults to
  1000ms). `processTimeoutOptions` hands a failing locator action or `expect.element` **the
  remaining test timeout minus 100ms**, and `testTimeout` defaults to **15000ms in browser mode**
  against 5000 elsewhere. Setting a provider action timeout makes that path return early:

  ```ts
  provider: playwright({ actionTimeout: 2000 })
  ```

  Measured: a failing assertion **14918ms → 1025ms** (it falls back to `expect.poll`'s own 1000ms,
  so that half is capped at 1s whatever you set), a failing action → ~2s, and the green suite
  unchanged. Pick your own number by walking it down until the suite breaks — ours failed 12 files
  at 300ms and 1 at 500ms, so 2000 leaves real headroom for slower CI. A red suite is otherwise
  much more expensive than a green one, and mutation-testing a focus-heavy file gets ~2000× slower
  per assertion.

  **What did *not* work, measured on the same suite**, so you can skip re-testing it: `isolate:
  false` (the obvious "reuse the iframe" win) turned a green suite into **400-600 non-deterministic
  failures** *and* got slower — module-level state and document-level listeners survive between
  files, which is precisely the cross-file bleed isolation exists to prevent; a raised or lowered
  worker count was worse in both directions than the default; a bigger viewport changed nothing and
  broke a pointer-leave test; `expect.poll`'s interval is irrelevant because assertions overwhelmingly
  pass first try; and Chromium frame-rate launch flags (`--disable-frame-rate-limit`,
  `--disable-gpu-vsync`) made a click **2× slower**. The stability wait itself is not configurable —
  it lives in Playwright's injected script, and `force: true` is the only per-call escape.
- ~~**Is "pure logic stays in jsdom" actually true? [unverified]**~~ **Answered — see
  [section 10](#10-what-not-to-migrate).** Measured on one composable file: the port is clean
  and gains nothing, at 1.5× the wall clock. The verdict held, but the *reason* it held was
  not the predicted one — browser startup turned out to be cheap (~0.6s), so "too slow" is the
  wrong argument against porting pure logic. "Buys nothing" is the right one. Still
  `[unverified]` for date/colour utilities specifically; only the composable case was measured.
- **Tracing is not free, and `retain-on-failure` is not "free when green".** Vitest 4.1 can record
  Playwright traces per test (`browser.trace`, with `page.mark()` markers). Measured on our green
  97-file Chromium corpus, back to back: baseline 24.3s; `retain-on-failure` 69.4s **and 13–15 new
  failures in 12 files** (the timing-shaped tests) plus a `tracing.stopChunk` error; serial 359.6s
  and still 5 failures. The mode starts and stops a chunk for every test and only deletes the
  passing zips afterwards, so a suite of real-input tests pays and flakes regardless. Record a
  trace for the one file you are debugging; do not put it in CI.
- **Visual regression.** A bounded pilot showed the useful shape: define stable variants as data,
  render them together below one neutral Vue host, retain exact geometry/state assertions, and
  capture the whole story sheet once with `toMatchScreenshot`. Do not manually call
  `page.screenshot`, encode base64, or reparent several independent `render()` containers; the
  native matcher owns stabilization, reference creation and diffs. The neutral host can also be
  semantically necessary: a component that forwards its public `$el` to an inner node may confuse
  a renderer that unwraps the wrapper's parent, removing a load-bearing outer element while DOM
  assertions still pass. Assert that wrapper's box before accepting the image. Keep visual files
  in an isolated fixed-viewport project and explicitly track only their references; ordinary
  browser failures may write diagnostic PNGs into the same `__screenshots__` convention. Verify
  the first PNG's pixel dimensions too: in Vitest 4.1.10 with browser UI disabled, an instance
  viewport can size the tester iframe without sizing Playwright's outer page, so the orchestrator
  CSS-scales the iframe and silently downsamples element screenshots. Set the same viewport in the
  Playwright provider's `contextOptions` to keep the scale at 1.
  References are still browser/platform-specific, and for a headless library the sheet should
  expose geometry and state with minimal deterministic CSS, not freeze a consumer skin. Pin the
  full Playwright container version for Linux comparison, commit its Linux reference, and put
  updates behind a manual, non-default-branch workflow; a plain `ubuntu-latest` label does not pin
  fonts and system libraries. Keep local-platform references for local review, but do not expect
  one platform's image to compare on another.

  When a generic story helper derives props from the component, remember that TypeScript's excess
  property check applies to fresh literals, not necessarily objects returned from `Array.map`.
  Validate inferred prop keys against `ComponentProps<C>` (extra keys can be intersected with
  `never`) and include visual test files in an explicit type-check project. Otherwise a typo can
  render as a harmless HTML attribute and become part of the approved image.

  Once there are more than a couple of sheets, move the repetition into the helper rather than
  the files. Measured across eight sheets here, every file was re-declaring the same six things:
  a `defineComponent({ props, setup })` wrapper whose only job was typed props for a composite
  scenario; `render` → `getByTestId` → `toBeVisible`; `querySelectorAll('[data-variant]')` plus
  a length check; `cells[index]` bookkeeping next to a parallel `variants` array; a hand-chosen
  screenshot name; and `TOLERANCE = 1.5` with a `Math.abs(a - b)` poll. A helper that accepts
  `render: (props: P) => VNode` as an alternative to `component:`, returns typed cells carrying
  the variant's own expectation data, derives the reference name from the title, and takes the
  screenshot *after* the callback removed ~30% of each file and changed no reference image —
  because the derived names matched the hand-written ones, which is the check to run first. Keep
  the typo check in both modes (the `never` intersection still applies, against the annotated
  render parameter instead of the component's props), and keep a plain `mount()` escape hatch
  for the one file that must install a spy before rendering. Two things not to hide in the
  helper: the per-variant *expected* values (literal, in the variant) and any tolerance wider
  than the default (explicit at the call site). Finally, narrow the tracked-reference ignore
  rule to the reference naming pattern (`*-<browser>-<platform>.png`): a failing visual test
  writes `<test name>-1.png` into the same folder, and an unignore on `*.png` commits captures
  as baselines — two were found here before the rule was tightened.

  **Reusing the stories you already have.** If the project runs Storybook, `composeStory` and the
  Vitest addon make a story a renderable and the visual sheet falls out. If it runs Histoire,
  there is no portable-stories API — measured on 0.17.17: the runtime `<Story>` only works inside
  Histoire's own mount, and `<Variant>` renders `null` with the slot mounted later by a separate
  sub-app — and the official visual path (`@histoire/plugin-screenshot`, or Lost Pixel over
  `histoire build`) is a second browser pipeline with no assertions beside the image. The
  workable route is that `.story.vue` files reference `Story`/`Variant` as *global components*:
  register stand-ins through `global.components` (a `Story` that renders your sheet host, a
  `Variant` that renders one cell, both declaring every prop the real components take so nothing
  leaks onto the DOM) and the story's own markup renders under your host unchanged. Check first
  whether any story uses `initState`/`{ state }` — here none of 176 did, so the stand-ins stay
  trivial. Mask what a story author never meant to be deterministic (a remote `<img>`) via
  `screenshotOptions.mask`, only where the layout is stable without it. The trade: cells are
  named by the story (`cell('Uncontrolled (RTL) ')`, trailing space and all) and carry no typed
  expectation data, so literal expected values move into the test body. Ten such sheets were added
  here in one pass; the ones that failed first time all failed on ResizeObserver settling (a thumb
  offset measured from the thumb's own size, `type="auto"` scrollbars), which `expect.poll` fixed.
  Having both kinds of sheet for the same component turned out not to be worth keeping: the
  hand-built sheets were removed afterwards and only the story sheets remain, on the grounds that
  the story files are fixtures the project already maintains, while a second, test-only set of
  variants is one more thing to keep in step with them. The helper that derived and type-checked
  variants from data (`render:`/`component:` modes, the `never`-intersection key check) is
  therefore historical here; the paragraphs above describe what it did and why, not a live API.
  The cost of that trade is coverage, not machinery: a component with no story file — `Popper`
  here — gets no visual test until someone writes the story.

  **Scaling the story sheets up found three more sources of non-determinism, none of them in the
  component.** Measured while adding fifteen more story sheets here. (1) *Icon libraries that
  fetch*: `@iconify/vue` renders an empty placeholder until the icon's data is in its storage, and
  by default fills that storage from the network after mount — so whether the reference has icons
  in it depends on a round trip. Preload the icon set (`addCollection`) in the visual setup and
  point the API at a dead host; then assert the icon count so a missing preload fails loudly
  rather than silently rendering blanks. (2) *Today*: a calendar with no value opens on the
  current month and dots the current day; a `now()` placeholder carries the current time. Fake
  **only `Date`** (`vi.useFakeTimers({ toFake: ['Date'], now, shouldAdvanceTime: true })`) — the
  default set freezes rAF and starves layout pipelines — and pick noon UTC so every zone agrees on
  the date; mask anything that still shows the host *hour*. (3) *Your host is narrower than the
  playground*: a two-column 760px sheet gives each variant ~356px where Histoire's `width: '50%'`
  gives far more, so wide controls clip at the sheet edge or wrap onto themselves, and an element
  mask sized to the cell misses the overflow. Give the helper a `columns` option and use one
  column for wide stories. A fourth lesson is about what the sheet is for: rendering the real
  story at rest surfaced `aria-controls=""` on every accordion trigger — the content fills in a
  non-reactive id after the trigger's first render — which axe passes (an empty idref list is
  valid) and no functional test asserts. The screenshot itself could never show it; the sheet's
  second, screenshot-less `it` can.

  **A sheet taller than the tester iframe screenshots as a full-height PNG that is white below the
  fold — no error.** Playwright can extend the outer page for an element capture but cannot paint
  iframe content below the iframe's box, and the first run accepts the half-blank image as the
  baseline. Measured: six of ten Histoire demo sheets (1224–1624px) at a 1000px viewport. Size
  the tester viewport *and* the Playwright context to the tallest sheet (height does not move a
  fixed-width sheet's layout; the existing references stayed byte-identical), and make the helper
  refuse to capture a sheet whose bottom edge is below `window.innerHeight`. Review every new
  reference by eye, including its bottom half.

---

## 12. Accessibility: three layers, and the one your suite is probably missing

Most component suites have exactly one accessibility test per component — an `axe()` audit — and
believe they are covered. Browser mode makes a second layer cheap, and it is the layer where the
interesting bugs live.

| Layer | Question it answers | Tool |
|---|---|---|
| **Rules** | Does this markup break a general accessibility rule? | `axe` |
| **Meaning** | Does the exposed state match what the product intended? | ARIA snapshots + role state filters |
| **Behaviour** | Can a keyboard or screen-reader user operate it? | real input, focus assertions |

A rules engine cannot know which tab your app meant to select, which panel that content belongs
to, or which option the user just chose. Every one of those can be wrong while every attribute
involved is legal — and legal-but-wrong is precisely what `axe` is designed to pass.

**`toMatchAriaSnapshot` / `toMatchAriaInlineSnapshot` (Vitest 4.1.4, experimental)** snapshot the
accessibility tree instead of the DOM: roles, computed accessible names, active states,
hierarchy. Unlike a DOM snapshot they carry no class names, generated ids or font metrics, so
they survive refactors and travel across machines.

Three things worth knowing before you write one:

1. **A template asserts only the states it lists.** *Measured:* a tabs template written as
   `- tab "Account" [selected]` / `- tab "Password"`, with `/children: equal` on the tablist,
   stayed green after the component was mutated to mark **every** tab selected. There is no
   `[selected=false]`, and `/children: equal` constrains child count and order, not attributes.
   The fix is not a better template — it is a second assertion using the **role state filter**,
   which most suites never touch:

   ```ts
   // the snapshot proves the state is on the right node…
   await expect.element(tablist).toMatchAriaInlineSnapshot(`…`)
   // …this proves it is on no other node
   expect(page.getByRole('tab', { selected: true }).elements()).toHaveLength(1)
   ```

   `getByRole` accepts `selected`, `checked`, `expanded`, `pressed`, `level`, `disabled` and
   `includeHidden`. They are the cheapest accessibility oracles available and they read like the
   contract: *exactly one expanded trigger*, *no option selected yet*, *`mixed` is neither
   checked nor unchecked*.

2. **Prefer computed matchers to wiring assertions.** `toHaveAccessibleName('Edit profile')`
   fails when `aria-labelledby` stops resolving; `toHaveAttribute('aria-labelledby', id)` passes
   over a dangling reference happily. *Measured, on a real library:* a popup's option group
   pointed `aria-labelledby` at an id that no element carried, because the label component only
   receives the group's id when nested inside it — and the library's own documentation example
   places it as a sibling. The group was unnamed and the label was announced as loose text.
   `axe` filed it under **`incomplete`**, which `toHaveNoViolations()` counts as a pass, so the
   conventional audit was green. The accessibility tree showed it on the first snapshot.

3. **In browser mode the matcher retries until the tree is stable**, so it inherits every rule
   about retrying matchers: do not use it to settle a condition whose timing is the subject, and
   budget the full locator timeout (~15s here) for a genuine failure.

One implementation note that explains both the strengths and the limits: in Vitest the tree, the
accessible-name computation and `getByRole` all come from **`ivya`** (Playwright's aria engine)
running as JS in the page — not from the browser's native accessibility tree. So results are
deterministic and consistent across the three APIs, but a snapshot shows what an AT *should* be
told from the DOM, not what a particular browser's AX tree ended up containing after its own
repairs.

When that difference matters — a finding you want to confirm against the engine before filing it —
the native tree is one CDP call away on Chromium (section 6, "reach through CDP"):
`Page.getFrameTree` gives the tester iframe's `frame.id`, and
`Accessibility.getFullAXTree({ frameId })` returns Chromium's nodes with their computed names.
Measured: a group whose `aria-labelledby` pointed at a missing id came back `name: ""`, its validly
labelled sibling `name: "Fruits"` — the same verdict ivya gave, which is the point: you now have two
independent oracles, and a disagreement between them is itself a finding.

And the tree models **nodes, not relations**. A node carries its role, its computed name and the
active states (`checked`, `disabled`, `expanded`, `level`, `pressed`, `selected`, `active`) plus
`/url` and `/placeholder`; it does not carry `aria-controls`, `aria-describedby`, `aria-owns` or
`aria-activedescendant`. *Measured, on a real library:* a disclosure trigger that renders
`aria-controls=""` until its first toggle (a non-reactive id written by the content *after* the
trigger's first render) produced a **byte-identical** ARIA snapshot before and after the click
repaired it — `- button "Trigger" [expanded]` / `- text: Content` both times. A relation that
feeds the accessible name, such as `aria-labelledby`, shows up as the *name*; a relation that is
pure wiring shows up nowhere. Assert those with `toHaveAttribute` next to the snapshot, and when
you pin a snapshot over a relation bug, keep a second test that proves the snapshot is blind to it
— so the day the tree starts carrying relations, something tells you.

### Aiming the snapshot: a census, transition pairs, family templates

The tree is only as useful as the states you point it at. Three shapes, ranked by what they found
on a real library in one afternoon:

1. **A census** — one `toMatchAriaSnapshot()` of `document.body` per at-rest fixture, over the
   whole fixture directory (`import.meta.glob`), with `Date` pinned so calendars stop drifting and
   anything network-dependent skipped. It is not a contract, it is an audit you can diff: 65
   trees, ~6s, and the smells are mechanical enough to grep — an interactive role with no name,
   a loose `- text: Label` beside an unnamed `group:`, a name that is really a placeholder
   (`textbox "#000000"`) or the control's own value (`progressbar "50%"`), the same name on every
   sibling, an unnamed `img` in an overlay. *Measured:* the first read found five product findings
   and four fixture bugs, every one ARIA-legal and axe-green. The best of them is the class the
   previous subsection said the tree *cannot* see — a relation — caught through the name it fails
   to produce: a date field whose `<label for>` reaches only a hidden `<input tabindex=-1>` reads
   `- text: Label` / `- group:` / `- spinbutton "month,": mm` (the segment's hardcoded label, a
   trailing comma left over from a convention that concatenates the field name — which this
   implementation does not); a calendar whose `role="application"` is on the `<table>` while the
   label is bound to a role-less root `<div>` reads `- application: - rowgroup: …`, an unnamed
   landmark, next to a sibling month picker that reads `- application "2026"`; a tags input whose
   delete button is `aria-labelledby` the tag text reads `- text: Test` / `- button "Test"`.
   Reading rule: **loose text immediately beside an unnamed role is a label that reaches nothing.**
2. **Transition pairs on overlays** — rest → open → Escape, an inline snapshot per state plus the
   role-state filter for every state the snapshot lists (`expanded: true` → 1, then 0). At rest an
   overlay is `- button "X"`; everything interesting exists only open. *Measured:* a select's open
   tree read `- listbox: - text: Fruits - group: - option "Apple"` — label loose, group unnamed —
   because the library's `Group` sets `aria-labelledby` to its own id and its `Label` takes that id
   only when nested inside the group, and the fixture (and **the docs demo**, so every consumer
   copying it) places the label as a sibling: `aria-labelledby="reka-select-group-v-26"` resolved to
   no element. The dropdown menu had the identical defect, and a trailing unnamed `- img` besides —
   the popper arrow `<svg>` with no `aria-hidden`. The combobox, whose fixture nests its label, read
   `- group "Fruits": - text: Fruits …` and is the shape the other two should have.
3. **Family conformance** — one template with regex for the data, applied to every sibling that
   should expose the same structure. `CalendarFamily.aria.browser.test.ts` now applies this to six
   calendar variants; it flags an unnamed `application` without anyone reading the whole tree.

Two mechanics that made the census cheap: `expect.element(document.body)` is accepted and the
matcher's stability polling replaces every sleep; and an `it.fails` per finding with a single
assertion is the quarantine — the green round trip pins today's tree, the red-when-fixed test holds
the intended relation via a name query (`getByRole('group', { name: 'People', exact: true })`).

Finally: **keep the axe audit.** Snapshots see no contrast ratios, no focusable-but-hidden
content, no invalid ARIA combinations. And read axe's `incomplete` bucket, not just
`violations` — a node-bearing `incomplete` means the rule ran and abstained, which your assertion
is probably scoring as a pass.

---

## 13. Other engines: a Chromium-green suite is a Chromium suite

Everything above was measured on headless Chromium, and so is almost every browser-mode suite in
the wild — `instances: [{ browser: 'chromium' }]` is the line every setup guide gives you. Vitest
makes the other two engines one config line away, and running the finished corpus on them is the
cheapest honest audit of the work. Here is what the 97 files said in the 2026-08-19
migration-close measurement; the later reference-quality suite reran the expanded 111-file
functional corpus on both engines.

**The historical numbers.** One engine per process, whole corpus, same machine. Chromium: 97/97, 16.3s.
Firefox: **18** failures, 87s. WebKit: **12** failures, 81s — and one `it.fails` quarantine that
*passes*. In the pinned Playwright Linux container: 16 and 9. Not one of the 30 is a flake once
the run is set up correctly, and not one is a Chromium bug. They sort into five piles, and the
piles are the lesson. The final expanded run covered 222 engine/file instances: 3092 passing,
56 documented expected failures and 16 documented skips in 180.20s.

1. **Configuration you did not know was inheritance.** Our date fixtures depend on `process.env.TZ`
   set in a global setup; Chromium and Firefox inherit it from the Vitest process, WebKit does not
   and reports the host zone. One `contextOptions.timezoneId` fixed three files. If your suite
   passes on one engine because of something the engine *happens* to inherit, the second engine
   is where you find out.
2. **Platform truths that look like bugs.** On macOS, WebKit does not focus a clicked `<button>` or
   `<a>`, and Tab skips both (Full Keyboard Access off); on Linux it does both, like everyone else.
   Four tests — "ArrowDown after clicking the trigger focuses the first item", "Tab lands on the
   trigger" — fail on darwin WebKit and pass in the container. These are the browser implementing
   the OS convention. They need a *platform* column in whatever records them, not an engine one.
3. **Synthetic input that is real on one engine by accident.** Firefox numbers the mouse pointer
   `0`; Chromium and WebKit number it `1`. A test that dispatches `new PointerEvent('pointerdown',
   { pointerId: 1 })` is therefore faking *the real mouse* on two engines and a nonexistent pointer
   on the third, where `setPointerCapture(1)` throws. Likewise a script-built `DataTransfer` inside a
   synthetic `ClipboardEvent` carries its text on Chromium and WebKit and arrives empty on Firefox —
   eight paste tests became tests of an empty paste. Neither is an engine bug; both are reminders
   that a synthetic event is a claim about one engine's implementation details. The final suite
   replaced these cases with native mouse and serialized keyboard copy/paste, removing their
   engine-specific expected failures.
4. **Assertions that encode an engine's tables.** `locale: 'en-UK'` is not a valid tag (GB is); V8
   and SpiderMonkey alias it, JavaScriptCore resolves it to plain `en` and renders month-first with a
   day period. Three locale tests had asserted V8's alias table since the jsdom days. Same family:
   `innerHTML` attribute order — Chromium writes `tabindex="0" style="…"`, Firefox `style="…"
   tabindex="0"`, and every DOM snapshot that contains a CSSOM-written `style` is a Chromium-only
   baseline with zero differing attributes.
5. **The tests that are actually interesting.** One quarantined bug (HoverCard's pending-focus
   reopen) does not reproduce on WebKit. One timing file (Drawer snap offsets) is red on WebKit and
   Firefox in a run-to-run-varying subset, green on Chromium, and green on all three when its
   sequence runs in a fresh page — the only pile that might be hiding a real regression, and the
   one that would never have surfaced without the other engines.

**Three setup facts, each measured the hard way.** (a) **Do not put three engines in one
`instances` array.** chromium + firefox + webkit in one process: 97s and 86 failures, 11 of them in
Chromium files that are 97/97 alone — CPU contention against the action timeout, not engine
differences. One engine per process; in CI, one engine per job. (b) **Firefox and WebKit need
`fileParallelism: false`.** They route keyboard and focus to the active tab, and Vitest runs files in
parallel tabs; Firefox went from 30 failures to 18 and WebKit from 13 to 12 serially, and every
failure that vanished was a focus or keyboard assertion that passed in isolation. Budget ~2.5× wall
clock for it. (c) **Measure the Linux column.** Pile 2 would have been recorded as engine rules had
we not repeated the run in the pinned Playwright container (`docker run … sleep infinity`, copy the
tree without `node_modules`, `pnpm i --frozen-lockfile`, same commands).

**Recording the verdicts without touching the tests.** The ports stay exactly as written for
Chromium. A table — `(engine, platform?, file, test name, fails | passes | skip, finding)` — is
applied from the cross-browser project's setup file: a `beforeEach` flips `task.fails` (the runner
reads it *after* the body, so this inverts the verdict exactly like `it.fails`, or un-inverts a
source-level `it.fails` for `passes`), `ctx.skip()` handles the measured-nondeterministic rows, every
finding key is validated against the raw-imported findings file, and an `afterAll` fails the file
if a row matched nothing — so a renamed test or a fixed bug shows up as a stale row rather than
silence. Net: the default project stays green on Chromium in 16s; the cross-browser job stays green
on Firefox and WebKit with the differences written down, and any *new* difference is a red test
with no row, which is exactly what you want from a second engine.

## 16. Audit the green ports after migration

A faithful port can still be a jsdom test wearing a Chromium badge. After name and coverage parity
are green, run a second audit whose question is not “did the translation preserve the original?”
but “does ordinary input now come from the browser?”

**Inventory interaction mechanisms, not just assertions.** Search for compatibility wrappers,
un-awaited render, `.trigger`/`.setValue`, direct value/scroll assignments, constructed keyboard /
pointer / clipboard events, raw focus, arbitrary sleeps and casts around custom commands. For every
site, classify the subject:

- ordinary user behavior → locator, `userEvent`, a typed browser command and a retrying outcome;
- exact event payload or unreachable guard → the narrowest constructed event, with the reason next
  to it;
- pinned API limitation → source/type citation plus runtime evidence, not a training-data guess.

This distinction deleted one shared synthetic adapter from five large ports. It also found a
false coverage path: a click-only adapter could stack two focus scopes in an order a trusted
pointerdown/focus/click sequence never does. The native sequence gained more product coverage while
losing three adapter-only lines; those losses were argued explicitly rather than recreated.

**Relations need a different accessibility oracle.** An ARIA snapshot can show roles, names and
states, but not whether an IDREF resolves. For `aria-controls`, `aria-labelledby`,
`aria-describedby` and `aria-activedescendant`, read the attribute and require
`document.getElementById(value)` to be the intended mounted node throughout the lifecycle. That
simple contract found inputs pointing at unmounted options and a menu filter whose active descendant
was the empty string; axe and the previous equality-to-an-empty-item-id assertion both passed.

**Use native constraint validation, not attribute presence.** Put each required component in a real
form, click a real submit button while empty, assert the actual bridge input/select has
`validity.valueMissing` and that submit did not fire, then populate through user input and prove
validity, FormData and submit together. Attribute-only tests missed a Toggle whose hidden checkbox
never synchronized `checked` and empty range controls whose native value was the non-empty string
`"undefined - undefined"`.

**Separate production coverage from migration parity.** A useful browser-only coverage command:

1. runs only the Browser Mode project;
2. includes unloaded production modules so zero-coverage files stay visible;
3. excludes tests, type-tests, stories/fixtures, helpers, shims, snapshots and visual machinery;
4. writes a separate report from unit/node coverage.

Use the report to name user-visible gaps—real overflow buttons, drag arbitration, geometry updates—
not to manufacture fixtures for a percentage. In this suite the first clean run named Select's
scroll-button behavior, advanced Drawer composition primitives and Splitter persistence/stacking;
only the first was the next high-value interaction contract.

**Touch is provider-specific in Vitest 4.1.10.** The pinned `UserEvent` surface has no touch
operation. Chromium's CDP `Input.dispatchTouchEvent` produces trusted touch and pointer events, so a
typed, iframe-scale-aware browser command is defensible for Chromium-only arbitration tests. Skip it
explicitly on Firefox/WebKit. A cross-engine constructed `pointerType: 'touch'` event remains valid
only when that payload guard—not a physical gesture—is the subject, and must say so.

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
