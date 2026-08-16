# AGENTS.md — what this fork is for

This is a working fork of [reka-ui](https://github.com/unovue/reka-ui). It is **not** trying to
ship a feature. It exists for two reasons, in order:

1. **Learn Vitest Browser Mode properly** — by using it on a real, non-trivial component
   library rather than a toy app.
2. **Get rid of jsdom entirely.** All 97 test files move: the 87 that touch the DOM go to
   Vitest Browser Mode, and the 10 that touch none go to a plain `node` project. Nothing
   stays on jsdom. Started with `Slider`.

> **The second goal changed mid-effort.** It used to read "port the testing strategy from
> jsdom to browser mode", with browser mode as a second tier and `stay-jsdom` a legitimate
> per-file verdict. It is not one any more: "this port gains nothing" is now an observation
> about value, not a reason to leave a file on jsdom. The only exemption is *needs no DOM at
> all*, which is a property of the file rather than a judgement. Findings written under the
> old premise have been re-verdicted; their measurements are unchanged and still worth
> reading.

`CLAUDE.md` is a symlink to this file — one document, two names, so every agent reads the same
thing. Repo mechanics are at the bottom under [Repo reference](#repo-reference); everything
before it is the browser-mode effort.

## The three documents

| Document | Audience | Holds |
|---|---|---|
| **`AGENTS.md`** (this file) | agents working in this repo | what the fork is for, the translation table, the gotchas, conventions for ported tests |
| **`PORTING.md`** | whoever is running the migration | how the work is sequenced, the oracles, the tiers, the per-file loop |
| **`MIGRATING-TO-BROWSER-MODE.md`** | **the public** | the generalised field guide, written to be shared outside this repo |

**When you learn something non-obvious, it goes in two places**: the specific note here (or in
`PORTING.md`), *and* the generalised version in `MIGRATING-TO-BROWSER-MODE.md`. That last file
is a deliverable in its own right, not a by-product — including the negative results. Its
"Adding to this guide" section has the rules; the important one is **say how you know**, and
mark anything unmeasured `[unverified]`.

---

## The premise

reka-ui's suite runs on jsdom, and jsdom cannot do layout, focus, or pointer capture. The
tests pay for that in mocks. `packages/core/src/Slider/Slider.test.ts:10-18` is the clearest
example — before it can assert anything it has to fake four browser APIs:

```ts
globalThis.ResizeObserver = class ResizeObserver { observe() {} /* … */ }
window.HTMLElement.prototype.scrollIntoView = vi.fn()
window.HTMLElement.prototype.hasPointerCapture = vi.fn().mockImplementation(id => id)
window.HTMLElement.prototype.releasePointerCapture = vi.fn()
window.HTMLElement.prototype.setPointerCapture = vi.fn()
```

`hasPointerCapture` returning a truthy value is not a detail — it is the only reason
`SliderImpl.vue`'s `pointermove` handler emits `slideMove` at all. The test passes because the
mock says yes, not because the component works. In a real browser you delete all five lines and
the assertions start meaning something.

So the thesis being tested here is: **browser mode lets you delete mocks, and the tests that
survive are worth more.** Where that turns out to be false — where browser mode is slower,
flakier, or just more awkward — write that down too. A finding that "jsdom was the right call
for this file" is a real result.

---

## Reference material

`~/Projects/opensource/vitest` is a checkout of Vitest on branch **`pinned/4.1.10`** — the
exact version this repo depends on. **Read it instead of guessing or relying on training
data.** Vitest 4 moved a lot: the provider is now a function from a separate package
(`playwright()` from `@vitest/browser-playwright`, not the v3 string `provider: 'playwright'`),
and the context import moved from `@vitest/browser/context` to `vitest/browser`. Blog posts
and older docs will lead you wrong.

The docs tree in that clone is the versioned source of vitest.dev, so prefer it over the live
site (which tracks `main`). Line numbers are safe to cite while the pin holds.

Most useful paths:

| Path | For |
|---|---|
| `docs/guide/browser/index.md` | Setup, config, the `projects` split |
| `docs/guide/browser/component-testing.md` | Patterns, Testing Library interop |
| `docs/guide/browser/multiple-setups.md` | `browser.instances`, multi-browser |
| `docs/api/browser/vue.md` | `vitest-browser-vue` — `render`, `rerender`, `emitted` |
| `docs/api/browser/locators.md` | `getBy*`, `.element()`, `.click()`, `.dropTo()` |
| `docs/api/browser/interactivity.md` | `userEvent.*`, keyboard syntax, state persistence |
| `docs/api/browser/assertions.md` | The forked jest-dom matchers |
| `docs/api/browser/commands.md` | Custom commands + raw CDP escape hatch |
| `docs/guide/projects.md` | Project inheritance rules (`extends: true`) |
| `docs/guide/browser/visual-regression-testing.md` | `toMatchScreenshot`, later |

---

## Current state

Config lives in `packages/core/vite.config.ts`, split into three projects over the same source
tree:

- **`node`** — `environment: 'node'`, **no setup file**, an explicit list of the 10 files that
  touch no DOM (`NODE_TESTS` in the config). These never needed jsdom; they are the first
  files to leave it. 571 tests, 28% of the suite. `vitest.setup.ts` is deliberately not
  loaded — it exists entirely to paper over jsdom.
- **`unit`** — jsdom, `./**/*.test.{ts,js}`, excluding `**/*.browser.test.ts` *and* the
  `NODE_TESTS` list, setup file `vitest.setup.ts`. **This is the project being deleted.** It
  only ever shrinks; the migration is done when its include list matches nothing.
- **`browser`** — Playwright/Chromium headless, `./**/*.browser.test.ts`, setup file
  `vitest.browser.setup.ts`. That is a *separate* file, not the jsdom one: it loads the CSS shim
  and the axe matchers and nothing else. The project also carries its own `resolve.alias` (the
  `vitest-axe` shims) and its own `css.postcss` (Tailwind).

A project-level `resolve.alias` **merges with the inherited root one rather than replacing it** —
verified by deleting `@` from the browser project and watching a fixture that imports `@/shared`
still resolve. So a project only needs to declare the aliases it adds.

`extends: true` pulls in the root `plugins` and the `@` alias. It also merges root-level `test`
options, which is why anything environment-specific is declared per project rather than at the
root — the browser project must not inherit `vitest.setup.ts`, which loads
`vitest-canvas-mock`, `@testing-library/jest-dom/vitest` (browser mode ships its own fork of
those matchers), and a `getComputedStyle` patch for a jsdom bug that does not exist in Chrome.

The browser project also registers three custom commands — `mouseDown` / `mouseMove` /
`mouseUp`, from `vitest.browser.commands.ts`. They exist because the locator API's only drag
primitive (`dropTo`) is atomic and cannot be split across `beforeEach` hooks; see the gotcha
below.

Ported so far:

- `packages/core/src/smoke.browser.test.ts` — harness check, imports nothing.
- `packages/core/src/css-shim.browser.test.ts` — harness check, guards the Tailwind pipeline.
- `packages/core/src/Slider/Slider.browser.test.ts` — **complete, 39 of 39 tests.**
  `port:parity Slider --complete` and `port:coverage Slider` both exit 0; 1 test is quarantined
  under `it.fails` (the axe finding), 1 coverage line is allowed (the `linearScale` finding),
  and the pointer-capture claim is mutation-verified. Five findings in `FINDINGS.tsv`.
- `packages/core/src/shared/useForwardExpose.browser.test.ts` — **complete, 10 of 10.** A
  composable with no stubs to delete and no fixture, so the port is near character-identical to
  the original and gains no coverage, at ~1.5× the wall clock. Worth knowing as the honest
  price of a boring port; not a reason to skip one. Numbers in `FINDINGS.tsv`.
- `packages/core/src/Label/Label.browser.test.ts` — **complete, 7 of 7.** The T2 trial run, and
  the answer to whether a mechanical port is worth the trouble: all three oracles clean first
  try, and it still produced three findings — a click that cannot happen (`#empty-label-unclickable`),
  a `mousedown` handler jsdom structurally cannot reach (`#click-fires-no-mousedown`), and a
  behaviour neither suite ever asserts (`#no-positive-case`).

### Commands

```bash
pnpm --filter reka-ui exec vitest run                    # all three projects
pnpm --filter reka-ui exec vitest run --project=browser  # the destination
pnpm --filter reka-ui exec vitest run --project=unit     # jsdom — shrinking
pnpm --filter reka-ui exec vitest run --project=node     # no DOM at all

pnpm --filter reka-ui port:checklist Slider              # every describe/it, ✓ or ✗
pnpm --filter reka-ui port:parity Slider --complete      # nothing renamed or weakened
pnpm --filter reka-ui port:coverage Slider               # still reaches the same lines
```

`port:checklist` is the one to run *while* porting — it prints the original's whole tree in
source order with each node marked present or missing (`--missing-only` for just the gaps), and
it is the only check that compares `describe` blocks directly. Full rules in `PORTING.md` §2.

Baseline as of the last run: **102 files / 2072 passing + 1 expected fail.** Never leave the
`unit` project broken to make progress on `browser`; the two run side by side on purpose.

---

## Conventions for ported tests

- **Filename**: `<Component>.browser.test.ts`, next to the existing `<Component>.test.ts`.
- **Keep the original file.** The point is to diff the two approaches, not to replace one with
  the other. Deletion is a decision for later, per component.
- **`describe` and `it` names must match the jsdom original, verbatim.** If a name turns out to
  be a lie (see the form case below), fix the *test* so the name becomes true — don't rename.
- Render with `vitest-browser-vue`, mount the **story fixture** (`story/_<Component>.vue`), not
  the raw primitive — same house rule as the jsdom tests.
- Delete every mock the browser makes unnecessary. That deletion is the deliverable.

### Translation table

| jsdom | browser mode |
|---|---|
| `mount(C, { props })` | `await render(C, { props })` |
| `wrapper.setProps({…})` | `await screen.rerender({…})` |
| `wrapper.find('[role="x"]')` | `screen.getByRole('x')` |
| `wrapper.html()).toContain(…)` | `await expect.element(loc).toHaveAttribute(…)` |
| `wrapper.emitted('e')` | `screen.emitted('e')` |
| `el.trigger('keydown', { key })` | focus the element, then `await userEvent.keyboard('{Key}')` |
| `el.trigger('pointerdown', { clientX })` | real input: `loc.click({ position })` / `loc.dropTo()` |
| `wrapper.find('[type="number"]')` (hidden) | `screen.getByRole('spinbutton', { includeHidden: true })` |
| `wrapper.find('form').trigger('submit')` | click a real `<button type="submit">` |
| `mount(…)` once in the `describe` body | move into `beforeEach` — `render` auto-unmounts |
| `expect(wrapper.html()).toBe('<label>…')` | `screen.container.firstElementChild.outerHTML` — there is no `.html()` |
| `el.click()` / `el.trigger('click')` | `loc.click()` — and it fires `mousedown` too, which the originals never did |
| `beforeEach(() => document.body.innerHTML = '')` | *(delete)* — `render` removes its container |
| ResizeObserver / pointer-capture mocks | *(delete)* |

`vitest-browser-vue`'s `render` accepts all `@vue/test-utils` mount options, so most of this is
mechanical.

---

## Known gotchas (found the hard way — add to this list)

**Reading an attribute after an interaction needs a retry first.** `expect.element(…)` retries;
`.element()` is a synchronous escape hatch that does not. When a test computes a delta, put the
awaited `expect.element` assertion *before* reading the new value, or you race Vue's flush.

**Keyboard goes to whatever has focus.** jsdom fires `keydown` straight at an element. Playwright
does not. The slider thumb has `tabindex=0` (`SliderThumbImpl.vue:60`), so
`loc.element().focus()` in a `beforeEach` is enough. Keydown then bubbles from the thumb to
`SliderImpl`'s handler exactly as it does in production.

**You cannot fake a `pointerId`.** `el.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1 }))`
looks like a faithful port and is not: Chrome throws `NotFoundError` from
`setPointerCapture(1)` for a pointer that was never real, and `hasPointerCapture` returns false
so the handler short-circuits. This is precisely what the jsdom mocks were hiding. Use real
input — `locator.click({ position })`, `locator.dropTo(target)`. Both go through Playwright's
`FrameLocator`, which handles iframe coordinate translation for you.

**Tests run inside an iframe.** So raw `page.mouse` and `cdp()` take *page*-level coordinates
and you would have to offset by the iframe rect yourself. Prefer locator methods. Custom
commands (`docs/api/browser/commands.md`) are the escape hatch when you genuinely need
`page.mouse`.

**`dropTo` is atomic; three nested `beforeEach` hooks are not.** Several jsdom files nest their
describes around the *steps* of a gesture — `after pointerdown` → `after pointermove` →
`after pointerup`, one hook each. `dropTo()` / `userEvent.dragAndDrop()` press, move and release
in a single call, so they cannot be split that way, and collapsing the gesture into one hook
makes two of those describe names decorative.

`page.mouse` *is* stateful across calls, so `vitest.browser.commands.ts` exposes `mouseDown` /
`mouseMove` / `mouseUp` as custom commands, doing the iframe-rect translation once, server-side.
Tests pass coordinates straight out of `getBoundingClientRect()`:

```ts
const mouse = commands as unknown as { mouseDown: (x: number, y: number) => Promise<void> /* … */ }
const rect = (screen.container.firstElementChild as HTMLElement).getBoundingClientRect()
await mouse.mouseDown(rect.left + 10, rect.top + rect.height / 2)
```

Prefer `locator.click({ position })` / `dropTo()` when the gesture fits in one call. Reach for
these only when the original's hook structure demands the split.

**`getByRole` skips hidden elements unless you say otherwise.** `wrapper.find('[type="number"]')`
has no locator equivalent, and reka's `VisuallyHiddenInput` is `aria-hidden="true"` — so the
form-value input is invisible to every default query. Use
`getByRole('spinbutton', { includeHidden: true })`. Worth noticing rather than working around:
the port now has to *say* it is looking for something hidden from the accessibility tree.

**`render` unmounts after every test.** `vitest-browser-vue` registers cleanup, so the jsdom
habit of mounting once in the `describe` body (the form fixtures do this) leaves every test after
the first with nothing on screen. Move it into `beforeEach`. Module-level `vi.fn()` spies are
*not* cleared by that, so originals that depend on a call count accumulating across tests
(`toHaveBeenCalledTimes(1)`, then `(2)`) still port unchanged.

**…which means ports cover teardown, and the jsdom suite never did.** `cleanup()` calls
`wrapper.unmount()` (`vitest-browser-vue/dist/index.js` registers it in a `beforeEach`), so
every ported test tears its component down — released refs, disconnected observers, removed
listeners. VTU's `mount()` only unmounts if you ask, and essentially no jsdom file here does.
Measured: `useForwardExpose.ts:68` (`if (!ref) return`, the ref-detach path) is covered by the
port and by no jsdom test in the file.

**Do not book that as a browser-mode win.** It is the mirror image of the allowed-loss rule in
`PORTING.md` §2.2: a `GAINED` line needs arguing too. Adding one `wrapper.unmount()` to a jsdom
test covers that exact line (verified — probe written, istanbul hit count 1, probe deleted), so
the harness earned it, not Chromium. Ask which one it was before writing it into a finding.

**`.click()` fires only a click. A real click fires the whole sequence.** `HTMLElement.click()` —
and VTU's `trigger('click')` — dispatch a `click` event and nothing else: no `pointerdown`, no
`mousedown`, no focus, no `mouseup`. Playwright dispatches the lot. So **every `mousedown` /
`pointerdown` / focus handler in the library is invisible to a jsdom test that clicks**, and the
port picks them up for free. Measured on the smallest possible case: `Label.vue:24`'s inline
`@mousedown` handler is covered by the port and not by the jsdom original, which performs the
identical gesture on the identical element.

Check the branch map before celebrating, though. That same handler's `if (event.detail > 1)` is
`[0,2]` — never taken, because nothing in either suite double-clicks. The line went green; the
behaviour it guards is still tested by nobody. **A covered line is not a tested behaviour.**

**A zero-size element cannot be clicked, and plenty of them are zero-size.** An empty `<label>`
measures `0x18` in Chromium — zero *width* — so `locator.click()` retries and times out. jsdom's
`.click()` does not care, because there is no layout to consult. This is the CSS-shim failure in
miniature and it does not need Tailwind to bite: any element whose content is empty is a
candidate. If a port hangs on a click, measure the target with `getBoundingClientRect()` before
assuming the locator is wrong. Giving the element real content is a legitimate fix — it is a
deviation from the original body, so it costs you a `FINDINGS.tsv` row.

**Inline `template:` components still compile.** Worth stating because the opposite is plausible
— under Vite the `vue` package's browser condition resolves to the runtime-only build. Measured:
`render({ template: '<form>…</form>', components: { Slider } })` compiles and renders in the
browser project. No `h()` rewrite needed.

**There was no CSS — now there is.** Story fixtures are styled with Tailwind classes, but Tailwind
only ever lived in `.histoire/tailwind.config.js` and nothing compiled it for tests. Under jsdom
this was invisible because every rect is 0×0 anyway. In a real browser the component collapsed to
0×0 — measured, exactly zero, not "about zero" — and **Playwright refuses to click a zero-size
element**, so every geometry-dependent test failed with an error that looks nothing like its cause.

Fixed by compiling Tailwind for the `browser` project only: `tailwind.browser.config.js` (a trimmed
copy of the Histoire config) feeds `vitest.browser.css`, which `vitest.browser.setup.ts` imports,
wired through `css.postcss` in that project. The fixture now measures 200×20 and clicks.
`src/css-shim.browser.test.ts` guards it — if that file fails, fix the CSS pipeline before touching
any port.

Two deliberate differences from the Histoire config, both worth knowing before you debug a timing
bug that isn't one:

- **No keyframes/animation theme and no `tailwindcss-animate`.** `animate-*` classes compile to
  nothing, so elements settle instantly. That matches what jsdom did (ported tests keep behaving the
  same) and suits Playwright, whose actionability checks wait for an element to stop moving. Reka's
  `usePresence` already handles `animation-name: none`.
- **Colours are kept**, via `@radix-ui/colors`. They cost nothing and axe's `color-contrast` rule —
  inert under jsdom, very much alive in Chromium — needs real computed colours to mean anything.

`.histoire/style.css`'s `@layer components` block (`.accordion-*`) is mirrored into
`vitest.browser.css`, because several fixtures reference those class names instead of spelling the
utilities out inline.

**`vitest-axe` does *not* work in the browser — it is shimmed.** (This entry previously claimed
the opposite. Reading the manifest was not enough: `dist/index.js:9` does
`createRequire(import.meta.url)` and then `require("axe-core")`. Vite externalises `node:module`,
so `createRequire` is undefined and the import throws before a single test runs.
`vitest-axe/matchers` separately imports `chalk`.)

Both specifiers are aliased, in the `browser` project only, to browser-safe shims under
`packages/core/shims/vitest-axe/`. They talk to `axe-core` directly — which is browser-native, and
is what axe is *for* — and reimplement `configureAxe` / `axe` / `toHaveNoViolations` without
`createRequire`, `lodash-es` or `chalk`. Ported files keep the exact `import { axe } from 'vitest-axe'`
their jsdom originals use; the alias does the work, so there is nothing to change per file.

**axe in a real browser is much less forgiving, and that is the point.** `Slider.test.ts:27-33`
calls `axe(wrapper.element)` *synchronously* after `mount()`. Vue has not flushed yet, so the thumb
still carries `display: none` (`SliderThumbImpl.vue:80`, the SSR anti-jank branch that hides thumbs
while `value === undefined`). axe skips hidden elements, so the rule that matters comes back
`inapplicable` and the only interactive element in the component is never audited — a green test
asserting nothing. `await render()` flushes, so the browser port audits the real thing and found a
genuine violation. **When porting an axe test, check whether the original was actually reaching the
component** — `results.inapplicable` tells you. Note this is not jsdom's fault: jsdom reports the
same violation once flushed. Browser mode just made it impossible to miss.

That test is **quarantined with `it.fails`**, not fixed. The violation is real and lives in the
story fixture (`_Slider.vue` gives its single thumb no `aria-label`, and `getLabel` only auto-labels
2+ thumbs), and non-test source is off limits here — findings get reported, not patched.

This is the general pattern for a port that fails because it found something, and it is
machine-enforced. Full rules in `PORTING.md`; the short version:

```ts
// @finding Slider/Slider.test.ts#axe
it.fails('should pass axe accessibility tests', async () => {
```

**`.fails`, not `.skip`** — the body still runs, so the test keeps contributing coverage, and it
turns red the day someone fixes the bug, which tells you the finding is stale. The `@finding` tag
must name a row in `FINDINGS.tsv` or `port:parity` fails the file, so quarantine always costs you a
written finding. **Never make one of these green by disabling a rule or softening a matcher** —
keep the assertion exactly as strong as it was and let `it.fails` absorb the failure.

**Coverage the port loses can also be a finding — one line at a time.** `port:coverage` exits 1
when the browser reaches fewer lines than jsdom did, and that is usually right. Sometimes it is
not: jsdom covers `Slider/utils.ts:109` (`linearScale`'s `input[0] === input[1]` short-circuit)
on *every* test purely because the slider measures 0×0, while the browser covers L110-111, the
real interpolation, instead. Exempt such a line in `PORT-COVERAGE-ALLOW.tsv`
(`component / file / line / finding / why`). Same deal as `@finding`: the key must exist in
`FINDINGS.tsv` or the run still fails. Argue per line, never per file.

**pnpm hoisting is load-bearing, and it broke.** Adding `@vitest/browser-playwright` introduced
a new vitest peer variant, which changed which vitest got hoisted into `.pnpm/node_modules/`.
`@testing-library/jest-dom` does a bare `import 'vitest'` in `dist/vitest.mjs` while declaring
**no** peer dependency on it — it had only ever resolved by accident of hoisting. All 97 jsdom
files died with `Cannot find package 'vitest'`. Fixed with a `packageExtensions` entry in
`pnpm-workspace.yaml` declaring the missing optional peer. If you add another dependency with a
`vitest` peer and the jsdom suite explodes at import time, this is why.

---

## Settled questions

**`rerender` merges — it is a drop-in for `setProps`.** Confirmed from source
(`vitest-browser-vue/dist/pure-*.js`): `rerender: async props => { await wrapper.setProps(props) }`.
Confirmed behaviourally too — `rerender({ orientation: 'vertical' })` then `rerender({ inverted: true })`
makes ArrowUp go 50 → 49, which is only true if *both* props survive. Chained `setProps` calls in
the jsdom tests port one-for-one.

While reading that file: `render` is `@vue/test-utils`' `mount` with `attachTo: container`, and
`emitted` delegates straight to `wrapper.emitted`. `vitest-browser-vue` is a thin locator-flavoured
shell over VTU, which is why the translation table is so mechanical.

**Use a real `<button type="submit">` for the form block.** All three approaches were tested in
Chromium:

| Approach | Result |
|---|---|
| `form.requestSubmit()` | works, but needs `container.querySelector` — the one escape hatch the docs warn against |
| real `<button type="submit">` + `.click()` | works, and `FormData` yields `{ 'slider[0]': '50' }` |
| implicit submission (Enter on focused thumb) | **does not submit** — 0 calls |

The button wins on two counts: it goes through the locator API like everything else, and it makes
`describe('after clicking submit button')` describe something that actually happens. The third row
is the interesting one — a user pressing Enter on this slider never submits the form, and neither
jsdom nor the browser port would have caught that, because the original test fires a synthetic
`submit` event and never exercises the path a user takes.

## Open questions

- **Performance — deliberately deferred until the migration is done.** Measuring one ported file
  tells you about browser startup, not about the suite. The question is no longer *whether*
  browser mode is fast enough to be the default — it is the default by decision — but **what an
  all-browser suite costs**, and whether CI needs sharding to absorb it. Per-file evidence so far
  says it is affordable: ~1.5× wall clock on the worst case (a composable that gains nothing) and
  ~0.6s for a cold Chromium. Measure the whole suite before trusting that.
- Worth adding `toMatchScreenshot` visual regression once a CSS shim exists? Probably **not yet**,
  and possibly never in this fork. `docs/guide/browser/visual-regression-testing.md:31-49` is blunt
  that screenshots are unstable across environments — font rendering, GPU drivers, headless vs
  headed — and recommends Docker or a cloud service for stable baselines. reka-ui is a *headless*
  library whose components ship with no styling of their own, so the thing under test would be the
  CSS shim written for the tests, not the library. Revisit only if a styled story tree appears.

---

# Repo reference

Everything below is upstream reka-ui, unchanged by this effort. Vue 3 headless component library,
pnpm monorepo, Node ≥ 22, pnpm 10.

## Commands (from repo root)

- Install: `pnpm i`
- Test (one-shot): `pnpm --filter reka-ui exec vitest run [path]` (`pnpm test` = watch mode —
  avoid in automation). Add `--project=unit` or `--project=browser` to run one runner; see
  [Current state](#current-state).
- Coverage: `pnpm --filter reka-ui test:coverage`
- Type-check: `pnpm --filter reka-ui type-check`
- Lint: `pnpm lint` (fix: `pnpm lint:fix`)
- Build: `pnpm --filter reka-ui build` (vue-tsc + tsdown)
- Regenerate API docs after changing public props/emits/slots: `pnpm docs:gen`

## Layout

- `packages/core/src/<Family>/` — one dir per component family; parts named `<Family><Part>.vue`;
  each family has `index.ts`; public surface = `packages/core/src/index.ts`.
- `packages/core/src/shared/` — shared composables (`createContext`, `useForwardExpose`, prop/emit
  forwarding, …).
- `packages/core/src/date/` — date/calendar utilities.
- `packages/plugins` — build-tool integration (resolver, Nuxt module).
- `docs/` — VitePress site; `docs/content/meta/*.md` is AUTO-GENERATED (never hand-edit).
- Stories are Histoire (`*.story.vue`), not Storybook.

## Conventions

- Context: `createContext('<Component>')` → `[inject, provide]`; `*Root.vue` provides, descendants
  inject.
- Rendering: `Primitive` with `as` / `asChild`; expose refs via `useForwardExpose()`.
- Tests: colocated `*.test.ts`, vitest + jsdom + `@testing-library/vue` + `vitest-axe` (axe check
  expected for new components); jsdom quirks handled in `packages/core/vitest.setup.ts`. Browser-mode
  ports are colocated `*.browser.test.ts` — see [Conventions for ported tests](#conventions-for-ported-tests).
- Commits: Conventional Commits, scope = component family (`fix(Dialog): …`); commitlint enforces;
  lint-staged runs `eslint --fix` (lints JSON/MD/YAML too — intentional).

## Environment notes

- `rm` is aliased to `rm -i` in this shell. On EOF it keeps the file **and still exits 0**, so
  `rm x && echo done` reports success having deleted nothing. Use `/bin/rm -f`.
- **`cp` is aliased to `cp -i` too**, with the same trap: restoring a backup over an existing
  file silently does nothing (`overwrite …? (y/n [n]) not overwritten`) and still exits 0. This
  bites hardest when reverting a config after an experiment — you think you restored it and you
  did not. Use `/bin/cp -f`, or check the file afterwards.

See `CONTRIBUTING.md` for the full upstream guide.
