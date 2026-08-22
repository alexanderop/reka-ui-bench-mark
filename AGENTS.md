# AGENTS.md — what this fork is for

This is a working fork of [reka-ui](https://github.com/unovue/reka-ui). It is **not** trying to
ship a feature. It exists for two reasons, in order:

1. **Learn Vitest Browser Mode properly** — by using it on a real, non-trivial component
   library rather than a toy app.
2. **Give all 97 test files a non-jsdom destination.** The 87 that touch the DOM move to
   Vitest Browser Mode, and the 10 that touch none move to a plain `node` project. By explicit
   project-owner decision after completion, the 87 original jsdom files remain runnable as a
   comparison corpus; they are no longer the destination or the migration progress measure.

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

## Document map

| Document | Audience | Holds |
|---|---|---|
| **`AGENTS.md`** (this file) | agents working in this repo | what the fork is for, the translation table, the gotchas, conventions for ported tests |
| **`PORTING.md`** | whoever is running the migration | how the work is sequenced, the oracles, the tiers, the per-file loop |
| **`MIGRATING-TO-BROWSER-MODE.md`** | **the public** | the generalised field guide, written to be shared outside this repo |
| **`VITEST-BROWSER-MODE-COOKBOOK.md`** | **the public** | focused recipes for writing reference-quality Browser Mode tests after setup |
| **`PERFORMANCE.md`** | anyone deciding whether browser mode is affordable | what it costs and where — per suite, per file, per operation, with the method for each number |
| **`A11Y-FINDINGS.md`** | anyone triaging accessibility bugs in reka-ui | the product and fixture issues the ARIA census found, with evidence, severity and the `it.fails` that pins each |
| **`IMPROVING-PORTED-TESTS.md`** | maintainers of this fork | the post-migration audit that replaced compatibility input with reference-quality browser interaction |
| **`IMPROVING-PORTED-TESTS-VITEST-5.md`** | maintainers planning an upgrade | measured Vitest 5 opportunities; not current 4.1 setup guidance |

**When you learn something non-obvious, it goes in two places**: the specific note here (or in
`PORTING.md`), *and* the generalised version in `MIGRATING-TO-BROWSER-MODE.md`. That last file
is a deliverable in its own right, not a by-product — including the negative results. Its
"Adding to this guide" section has the rules; the important one is **say how you know**, and
mark anything unmeasured `[unverified]`.

---

## The premise

reka-ui's original suite runs on jsdom, and jsdom cannot do layout, focus, or pointer capture. The
retained originals pay for that in mocks. `packages/core/src/Slider/Slider.test.ts:10-18` is the clearest
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

Use the [Vitest v4.1.10 source](https://github.com/vitest-dev/vitest/tree/v4.1.10) — the exact
version resolved by this repo's frozen lockfile — instead of guessing or relying on training data.
For repeated source work, keep a local checkout pinned to tag `v4.1.10`; its path is deliberately
not part of the repository contract. Vitest 4 moved a lot: the provider is now a function from a separate package
(`playwright()` from `@vitest/browser-playwright`, not the v3 string `provider: 'playwright'`),
and the context import moved from `@vitest/browser/context` to `vitest/browser`. Blog posts
and older docs will lead you wrong.

The docs tree at that tag is the versioned source of vitest.dev, so prefer it over the live site
(which can move ahead). Line numbers are safe to cite while the pin holds.

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
  `NODE_TESTS` list, setup file `vitest.setup.ts`. This is the retained comparison suite:
  87 files / 1444 runtime tests. It stays green but does not measure migration progress.
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

The browser project also registers six custom commands — `copyPaste`, `mouseDown`, `mouseMove`,
`mousePress`, `mouseUp`, and `touchSwipe` — from `vitest.browser.commands.ts`. The held-mouse
commands exist because the locator API's only drag
primitive (`dropTo`) is atomic and cannot be split across `beforeEach` hooks; see the gotcha
below.

Completed corpus and findings:

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
- **T1 is complete: all 9 files are off jsdom** (1 earlier port plus the 8 reopened DOM-dependent
  files). The mechanical ports mostly confirmed equal coverage; the useful exceptions were an
  unfailable axe audit in `component/Arrow`, structurally-equal wrong-node assertions in
  `useArrowNavigation`, and masked early-return guards found during independent review.
- **T2 is complete: all 44 mechanical files are off jsdom through batch 9.** Batch 9 added
  Accordion, Calendar, DateField, DatePicker, Dialog, DismissableLayer, RangeCalendar and TimeField.
  Independent review replaced substring/count-only state checks with exact rendered values and full
  date/range identity, made disabled gestures prove delivery and prevention, isolated exact Dialog
  warnings, and removed DismissableLayer's arbitrary sleeps. Batch 8 added the ColorSwatch/ColorField,
  Rating and picker families.
- **T3 is complete: 23/23 files.** The final slice added Autocomplete, both color controls,
  Drawer snap/swipe, DropdownMenu and its filter, FocusScope, HoverCard, Listbox, Menu, Menubar,
  NumberField, PinInput, TagsInput and Tooltip. Native input exposed nine faithful browser-only
  failing tests across eight findings, all quarantined against live keys. The authoritative
  inventory reports **97/97 files off jsdom**, leaving 0 files / 0 call-sites without a non-jsdom
  destination.
- `packages/core/src/Select/Select.browser.test.ts` — **complete, 29 of 29. First T4 file, and
  the pattern-frontier port for fake timers and modal hit-testing.** All three stubs deleted; the
  double-pointerup selection ritual evaporated (`#pointerup-guard-consumed-by-real-click`);
  Chromium enforcing the modal's `body { pointer-events: none }` forced two hooks to be
  re-derived and exposed the outside-press dismiss path as zombie-covered in jsdom (bisected,
  `#outside-press-coverage-is-zombie`); `vi.useFakeTimers()` works in the tester iframe but
  freezes rAF (`#fake-timers-work-but-freeze-raf`). Nine findings, 21 argued allow lines,
  coverage +40/−0.
- `packages/core/src/NavigationMenu/NavigationMenu.browser.test.ts` — **complete, 13 of 13 (one
  `it.fails`). The `vi.mock` frontier: module mocking works in browser mode unchanged**
  (`#module-mock-works`), including a hoisted async factory over `@vueuse/core` with
  `importActual` and per-test `mockImplementation` swaps. Coverage **+100/−0** — real hovers
  earned the whole viewport-measurement and enter/leave surface. axe found a real
  `aria-hidden-focus` violation on the focus proxy that jsdom filed under `incomplete`
  (`#focus-proxy-aria-hidden-focus`), and the real mouse forced three re-derivations, led by
  "a mouse click cannot avoid hovering first" (`#mouse-click-cannot-avoid-hover`). Seven
  findings.
- `packages/core/src/Combobox/Combobox.browser.test.ts` — **complete, 45 of 45 (one `it.fails`).
  The geometry frontier, and the port that set the construct-vs-compensate stub rule**: six
  stubs deleted — including the prototype `getBoundingClientRect` feeding the virtualizer,
  which the real 200px viewport replaces 1:1 (`#virtualizer-real-viewport`), and the narrated
  blur simulations a real click performs itself (`#simulated-blur-becomes-real`) — while the
  popper describe's choreographed ResizeObserver is **kept on purpose**, because it constructs
  the scenario rather than compensating for jsdom (`#popper-ro-mock-kept`). axe caught the
  fixture failing AA contrast by 0.06 (`#color-contrast-4-44`); the popper render ladder
  rebased 3/4 → 4/4 deterministic; coverage +13/−0 with 2 argued allow lines, one of them the
  third bisected zombie-coverage instance (`#zombie-covered-lines`).
- `packages/core/src/ScrollArea/ScrollArea.browser.test.ts` — **complete, 9 of 9. The snapshot
  frontier, and the first port where scrolling is real.** All six stubs deleted — the prototype
  geometry overrides, the hand-fired scroll event (`viewport.scrollTop = 40` now makes the
  *browser* fire the event, `#scroll-event-is-real`), and the corner describe's RO mock. The
  snapshots carry measured thumb geometry (`18px`, sub-pixel post-scroll transforms) — locally
  deterministic, font-dependent across machines (`#snapshots-real-geometry`). A headless
  scrollbar has no intrinsic thickness; jsdom's `offsetWidth = 10` stub was silently fabricating
  it, replaced by 10px of real CSS (`#scrollbar-thickness-was-stubbed`). Fourth bisected
  zombie-coverage instance. Coverage +1/−0 with 4 argued lines.
- **Visual story sheets — 22 files, `*.visual.browser.test.ts`, 25 sheets, one helper.**
  Every component with a static Chromatic story has one — Accordion, Calendar, DateField,
  DatePicker, DateRangeField, DateRangePicker, Editable, Listbox, NavigationMenu, NumberField,
  RangeCalendar, Rating, ScrollArea (four stories), Slider, Splitter, Stepper, TimeField,
  TimeRangeField — plus the static Demo stories of AspectRatio, ColorArea, ColorSlider and
  ColorSwatch. Each renders the existing `*.story.vue` through `defineHistoireStory`, which
  registers stand-in `<Story>`/`<Variant>` components under one neutral Vue host and takes one
  `toMatchScreenshot` reference per story. Exact attribute, text and `getBoundingClientRect()`
  assertions in the test body remain the diagnostic oracle (a per-variant literal for every value
  the story sets: `2/28/2024`, `EUR\u00A05.00`, `Esfand 1402 AP`, `33.3`); the image is the
  integration oracle. Three things made the second batch deterministic, all in the helper or the
  setup rather than in the stories: the `radix-icons` set is **preloaded** into `@iconify/vue` so
  every story icon renders synchronously and offline; `pinClock(PINNED_TODAY)` fakes **only
  `Date`** for the calendars and `now()` placeholders; and `columns: 1` widens a sheet whose
  variants overflow a half-sheet cell. The Accordion sheet also found a real bug
  (`#aria-controls-empty-at-rest`, quarantined `it.fails` in that file). **The story files
  are the only sheet source, by project-owner decision** — the earlier hand-declared
  `defineVisualStory` sheets (variants as data, `*-all-variants` references, eight files including
  a Popper sheet) were removed after the Histoire route proved to cover the same components
  through fixtures that already exist; Popper has no story file and so no visual test. The neutral
  host is load-bearing: rendering `AspectRatio` directly through `vitest-browser-vue` lets its
  forwarded `$el` make the library's `unwrapNode(wrapper.parentElement)` remove the real ratio
  wrapper, leaving a 414×0 false-green mount. The stand-in `<Story>` host keeps that wrapper
  present and mutation-visible.
  Visual tests use `vite.config.visual.ts`, an explicit 900×3600 instance **and Playwright context**
  viewport (tall enough for the 3399px Accordion sheet — a taller sheet is clipped, see the
  gotcha), `env.visual.d.ts` + `tsconfig.visual.json` for a type-check that reaches the story
  SFCs, and reviewed Darwin/Linux references; they are excluded from the 89-file
  browser/coverage project. The Linux reference is owned by an exact
  `mcr.microsoft.com/playwright:v1.62.1-noble` CI image and a branch-only manual update workflow.
  How to write one is under [Visual story sheets](#visual-story-sheets).
- **ARIA census + transition tests — `src/a11y-census.browser.test.ts` and six
  `<Component>.aria.browser.test.ts` files (Select, DropdownMenu, Combobox, DateField, Calendar,
  TagsInput).** The census takes one `toMatchAriaSnapshot` of every at-rest story fixture (65 of
  97, `Date` pinned) into `src/__snapshots__/a11y-census.browser.test.ts.snap`; the `.aria` files
  hold rest → open → Escape tree round trips with role-state filters, and an `it.fails` per finding.
  First read of the census found five product findings, all ARIA-legal and axe-green: `SelectLabel`
  / `DropdownMenuLabel` placed beside their group (as the docs demos do) leave the group unnamed
  with a **dangling `aria-labelledby`** (`#label-outside-group-dangling-labelledby`, and the
  DropdownMenu twin); the DateField `<Label for>` reaches only the hidden `<input tabindex=-1>`, so
  the group is unnamed and segments are named `"month,"` with no field name
  (`#label-reaches-only-hidden-input`); Calendar's `application` grid is unnamed because the label
  sits on a role-less div (`#application-unnamed`); TagsInput's delete button is named by the tag
  text (`#delete-button-named-by-tag-text`); PopperArrow's `<svg>` is an unnamed `img` inside the
  open menu (`#popper-arrow-svg-exposed-as-img`). Plus four fixture bugs, in the `#census` row. How
  to write one is under [ARIA census and transition tests](#aria-census-and-transition-tests).

- **Reference-quality interaction and semantics follow-up.** The generic `src/test/browser.ts`
  compatibility adapter is gone. Autocomplete, ColorArea, ColorSlider, Listbox, NumberField,
  PinInput and TagsInput await render and drive ordinary input through locators / `userEvent`;
  Drawer snap uses trusted clicks and a held mouse drag; ScrollArea uses wheel and held-pointer
  commands. Constructed events remain only for documented payload contracts such as IME,
  `defaultPrevented`, timestamps/pointer IDs and otherwise-unreachable disabled guards. Typed
  `BrowserCommands` now live in `env.d.ts`; `touchSwipe` uses Chromium CDP because installed Vitest
  4.1.10 has no touch operation. New unpaired regressions cover Splitter, ScrollArea, Drawer touch
  edge arbitration, TreeVirtualizer and TabsIndicator. Semantic contracts add Tabs relations,
  Toggle/ToggleGroup/Checkbox states, Tooltip descriptions, active-descendant lifecycle, all six
  calendar families and native required-form validation across 20 empty-capable control families.
  Every browser-proven production fix and unresolved quarantine is in `FINDINGS.tsv`.

- **Production-only Browser Mode coverage.** `vite.config.browser-coverage.ts` includes unloaded
  production `src/**/*.{ts,vue}` while excluding tests, type-tests, stories, fixtures, helpers,
  shims, snapshots/screenshots and visual infrastructure. It writes an independent text/JSON/HTML
  report to `packages/core/coverage/browser-production`; run it with
  `pnpm --filter reka-ui test:coverage:browser`. It is a gap finder, not a percentage target.

**The migration is complete.** All four pattern-frontier files (Select, NavigationMenu, Combobox,
ScrollArea) and every remaining T3/T4 file are oracle-clean. Fake timers, `vi.mock`, stub-derived
geometry, and DOM snapshots each have worked Chromium coverage; all sharp edges are recorded below.

- **Cross-browser — the full 111-file functional browser project on Firefox and WebKit,
  `vite.config.cross-browser.ts`.**
  Same setup files, CSS shim, axe shims and custom commands as the `browser` project; one engine per
  run (`CROSS_BROWSERS=firefox|webkit`, default both), `fileParallelism: false`, and
  `contextOptions.timezoneId` set explicitly. Chromium is the engine the ports are written against
  and stays the only one in the default `browser` project; this config is where the *differences*
  are recorded. Every engine-specific verdict lives in `cross-browser.expectations.ts` — one row per
  (engine, test) with `fails` / `passes` (an `it.fails` that does not reproduce there) / `skip`
  (measured nondeterministic), each naming a `FINDINGS.tsv` key; `vitest.cross-browser.setup.ts`
  flips `task.fails` from a `beforeEach`, validates every key against the raw-imported TSV, and
  fails a file whose row matched nothing (a stale row is a renamed test or a fixed bug). Measured
  on the final serial whole corpus: 222 engine/file instances, 3092 passing + 56 documented
  expected failures + 16 documented skips in 180.20s. Historical macOS/Linux deltas remain in
  `FINDINGS.tsv`; the pinned Playwright `v1.62.1-noble` Linux container is what the
  `Cross-Browser` workflow runs (one engine per job). What the runs found is in the
  `cross-browser#…` rows — WebKit ignores `process.env.TZ`, the date fixtures' `en-UK` is an invalid
  tag that only JavaScriptCore refuses to alias, and `innerHTML` attribute order is engine-specific.
  Earlier synthetic clipboard and pointer tests also exposed Firefox-specific payload differences;
  the native-interaction follow-up superseded those expected failures. macOS
  WebKit neither focuses a clicked button nor tabs to links/buttons, and one `it.fails` quarantine
  (HoverCard) does not reproduce on WebKit. The gotchas are below under "Cross-browser".

### Commands

```bash
pnpm --filter reka-ui exec vitest run                    # all three projects
pnpm --filter reka-ui exec vitest run --project=browser  # the destination
pnpm --filter reka-ui exec vitest run --project=unit     # retained jsdom comparison suite
pnpm --filter reka-ui exec vitest run --project=node     # no DOM at all
pnpm --filter reka-ui test:visual                        # isolated reviewed PNG references
pnpm --filter reka-ui test:visual:update                 # intentionally refresh this OS baseline
pnpm --filter reka-ui test:cross-browser                 # the functional suite on firefox + webkit, serial, expectations applied
CROSS_BROWSERS=webkit pnpm --filter reka-ui test:cross-browser   # one engine (what each CI job runs)
pnpm --filter reka-ui test:coverage:browser              # production-only Chromium report

pnpm --filter reka-ui port:checklist Slider              # every describe/it, ✓ or ✗
pnpm --filter reka-ui port:parity Slider --complete      # nothing renamed or weakened
pnpm --filter reka-ui port:coverage Slider               # still reaches the same lines

pnpm --filter reka-ui exec vitest run --project=browser src/a11y-census.browser.test.ts  # ARIA tree of every fixture
pnpm --filter reka-ui exec vitest run --project=browser src/a11y-census.browser.test.ts -u  # after an intended a11y change — then READ the diff
```

`port:checklist` is the one to run *while* porting — it prints the original's whole tree in
source order with each node marked present or missing (`--missing-only` for just the gaps), and
it is the only check that compares `describe` blocks directly. Full rules in `PORTING.md` §2.

Final retained-comparison baseline (2026-08-22): **208 files / 3569 passing + 28 expected fails**
across the three projects when counted independently. Browser alone is 111 files / 1554 passing
+ 28 expected failures in 15.50s; jsdom remains 87 files / 1444 passing in 11.25s; node remains
10 files / 571 passing in 2.16s. The browser project is the 87 paired ports plus two harness files,
accessibility and native-interaction contracts; the latter are intentionally unpaired. Keep all
three green—the jsdom project is the retained comparison corpus, not unfinished migration work.

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
- Keep ordinary action targets as locators: `await locator.click()` or
  `await userEvent.type(locator, text)`, never `userEvent.click(locator.element())`.
  `locator.element()` is synchronous and throws immediately; `expect.element(locator)` and
  locator-backed actions retry. When a low-level payload contract genuinely needs a stable raw
  node, retain that node for `dispatchEvent`/identity reads and pair it with
  `page.elementLocator(node)` for ordinary actions. That pairing does not restore any wait lost
  before the raw node was first resolved, so it is the exception, not the default query shape.
- **…but only the *compensating* mocks.** A stub that **constructs the scenario** — Combobox's
  popper describe mocks ResizeObserver to fire twice synchronously because *RO-driven re-render
  counts are the subject* — ports with the test, scoped and restored. Ask of every stub: is it
  faking what the browser would do (delete), or is it the test's input (keep, and record it as
  a kept stub in `FINDINGS.tsv`)? First applied in `Combobox/Combobox.test.ts#popper-ro-mock-kept`.

### Visual story sheets

A visual sheet renders an existing Histoire `*.story.vue` — nothing else. `src/test/visual`
(`defineHistoireStory`, `toBeNear`, `centerOf`) owns everything a sheet used to repeat by hand:
the neutral host, mounting, waiting, collecting cells, and the screenshot. A sheet file names the
story and the assertions, nothing else:

```ts
import SliderChromatic from './story/SliderChromatic.story.vue'

const histoire = defineHistoireStory(SliderChromatic)       // → screenshot `slider-chromatic-story`

describe('slider histoire story', () => {
  histoire.it('renders every chromatic variant with thumbs at their values', async ({ title, cells, cell }) => {
    expect(title).toBe('Slider/Chromatic')                  // the <Story title>
    expect(cells).toHaveLength(13)                           // one cell per <Variant>, in story order
    const ltr = cell('Uncontrolled (LTR)')                   // by <Variant title>, verbatim
    await expect.poll(() => centerOf(ltr.get('[role="slider"]')).x).toBeNear(…)
  }) // ← mounts, runs this, then takes the screenshot
})
```

`defineHistoireStory(StoryComponent, { screenshot?, mask?, columns? })` renders the story file with stand-in
`Story`/`Variant` components registered through `global.components`: `Story` renders the 760px
neutral host, `Variant` renders one `<section data-variant>` cell, and the story's own markup
inside each variant is untouched. Histoire has no portable-stories API (its `<Variant>` renders
`null`; see the gotcha), so this is the only way to reuse a story file in Vitest, and it is
enough: 0 of the 176 stories use `initState` or the `{ state }` slot prop.

- **Cells are named by the story, not typed by you.** `cell(name)` takes the `<Variant title>`
  verbatim — trailing spaces included (`'Uncontrolled (RTL) '` in `SliderChromatic`). A
  variant-less story renders one cell named `default`; a bare `<Variant />` is `untitled`, both
  as Histoire names them. `cell.variant` is `{ name }` only: there is no expectation data, so
  literal expected values live in the test body — and keep them literal, never derived from the
  helper the component itself uses.
- **`cell.get(sel)` throws naming the cell — at the call site; `getAll`, `rect` scope to the cell.**
  `cell(name)` and all three queries are `vi.defineHelper`s (see the gotcha), so a stale selector
  or variant name puts the `❯` frame on the sheet file's line, not `sheet.ts`. Selectors are
  CSS; the story's own `data-*` / `role` attributes are the stable markers to query.
- **The screenshot name is `<kebab story title>-story`** (`Scroll Area/Chromatic/Both` →
  `scroll-area-chromatic-both-story`), derived from the rendered title, so it is only known after
  `mount()`. Override with `screenshot:`.
- **`histoire.it` takes the screenshot after your callback.** Use `it` + `await histoire.mount()`
  + `await screenshot()` only when something has to exist *before* the render — `ColorSwatch`'s
  `console.warn` spy is the one case.
- **`mask: ['img']`** masks matching elements inside the sheet (`screenshotOptions.mask`). Use it
  for content a story author never meant to be deterministic — `AspectRatio.story.vue` loads a
  remote Unsplash photo — and only when the layout is stable without it (that `<img>` is
  absolutely positioned inside the ratio wrapper, so the wrapper's geometry is still asserted).
- **`columns: 1`** when the variants are wider than a 356px half-sheet cell. Histoire's
  `width: '50%'` grid is a much wider column; a date-time range field or a five-step horizontal
  stepper clipped at the sheet edge (or wrapped under itself) is not a reviewable reference.
  Measured before the option existed: `DateRangeField` cut off at `12 : 0` with the mask missing
  the overflow, `Stepper`'s fifth step drawn over its first. Used by the four range sheets and
  Stepper.
- **Icons are preloaded, never fetched.** Every story icon is `radix-icons:*` through
  `@iconify/vue`, which otherwise loads icon data from api.iconify.design *after mount* — a
  network round trip deciding whether the PNG has icons in it. `vitest.visual.setup.ts` calls
  `addCollection(@iconify-json/radix-icons)` and points the API at a dead host, so an icon
  outside the set renders empty rather than quietly depending on the network. Sheets assert
  `svg.iconify--radix-icons` counts so a missing preload is loud.
- **`pinClock(PINNED_TODAY)`** (module level, next to `defineHistoireStory`) for any story whose
  output depends on *today*: a calendar with no value opens on the current month, `data-today`
  dots the current day, `now()` placeholders carry the current time. It fakes **only `Date`**
  (`toFake: ['Date']`, advancing), so rAF, timers and ResizeObserver stay real; see the
  fake-timers gotcha for why the default set would break the sheet. `PINNED_TODAY` is noon UTC
  on 2024-02-14, inside the date stories' own February 2024 fixture and distinct from the
  selected 20th. Hour and zone name still follow the host timezone, so a zoned placeholder
  (`DateRangeField`'s "Locale timezone") is pinned *and* masked.
- **Story fixtures settle on ResizeObserver.** The Chromatic slider's thumb lands 6px later than
  first paint (`useSize` measuring the thumb), and `type="auto"` scrollbars appear a frame after
  mount; read those through `expect.poll`, including the *empty* case, or a late bar slips past.
  Splitter panel sizes (`data-panel-size`) are the same shape — poll them.
- **A second `it` in a sheet file is allowed for a relation the image cannot show**, mounting
  through `histoire.mount()` without a screenshot. `Accordion`'s `it.fails` for
  `#aria-controls-empty-at-rest` is the precedent; it follows the same `@finding` rule as a
  functional port.
- **`toBeNear(expected, tolerance = 1.5)`** works synchronously and under `expect.poll`; its
  failure names the delta (`expected 141 to be within ±1.5 of 151.22 (off by 10.222)`). Pass a
  looser tolerance explicitly when the subject is.
- **Test-name convention**: `describe('<camelTitle> histoire story')`, one `it` per story file.
- Prefer Chromatic stories; a Demo story is acceptable when it is the only one and static (the
  four color/swatch demos are). Interactive `*Demo` stories with open overlays or animations are
  not sheet material — stable variants only. A component with no story file gets no visual test;
  write the story first if it needs one.
- Only `*-chromium-*.png` under a `*.visual.browser.test.ts/` folder is tracked. A failing visual
  test writes `<test name>-1.png` into the same folder — a capture, not a baseline; `.gitignore`
  keeps it out.
- **The sheet must fit the tester viewport.** The helper throws before capturing if the sheet's
  bottom edge is below `window.innerHeight`, naming the two fixes (raise `VIEWPORT_HEIGHT` in
  `vite.config.visual.ts`, or shrink the story). Without that guard the reference is silently
  blank below the fold — see the gotcha. The guard fired for real on the 3399px Accordion sheet
  at 3200; the viewport is 3600 now, and the 24 other references stayed byte-identical.
- **`type-check:visual` reaches the story SFCs.** `tsconfig.visual.json` includes
  `env.visual.d.ts` instead of `env.d.ts`, which types `Story`/`Variant` as the stand-ins
  (`StoryStandIn`/`VariantStandIn`) rather than through Histoire's `components.d.ts` — because
  three upstream grid stories (Editable, Listbox, Splitter) pass `iframe` where Histoire's
  `StoryLayout` forbids it, Histoire ignores it, and upstream's `tsconfig.check.json` excludes
  stories entirely. The stand-in's `layout` type is widened to accept it; the stories are
  otherwise type-checked in full.

### ARIA census and transition tests

Two file shapes, both unpaired (no jsdom original; `port:parity` prints "not a port" and skips
them, `port:coverage` is per-file so they do not skew gains), both in the normal `browser` project
— an ARIA tree carries no geometry or font metrics, so unlike the PNG sheets the `.snap` is the
same on every OS.

- **`src/a11y-census.browser.test.ts`** — one `it` per `story/_*.vue` (glob), `await render(...)`
  then `await expect.element(document.body).toMatchAriaSnapshot()`. `pinClock(PINNED_TODAY)` at
  module level (the calendar fixtures open on *today*); Avatar skipped (remote image flips its tree
  on load); partials and sub-variants skipped by the `SKIP` regex with the reason in the comment.
  It is a **census, not a contract**: run it after an accessibility change, `-u`, and *read the
  diff* — the smells are mechanical (unnamed role, loose `text:` beside a control, placeholder or
  value as name, duplicate sibling names, unnamed `img` in an overlay). A tree it cannot show:
  relations, states that are false (`[expanded]` appears only when true, so a closed overlay is
  just `- button "X"`), anything `aria-hidden`. Do not add open states here.
- **`<Component>.aria.browser.test.ts`** — the open states. One `it` that round-trips **rest →
  open → Escape** with an inline snapshot per state *and* the role-state filter for each state the
  snapshot lists (`getByRole('combobox', { expanded: true }).elements()` → 1 then 0; `option
  selected`, `menuitemradio checked`, …), because a snapshot proves the state is on the right node
  and only the filter proves it is on no other. Then one `it.fails` per finding, **single
  assertion each** (so the quarantine cannot hide a sibling failure), tagged `@finding` with a
  `FINDINGS.tsv` key, asserting the *intended* relation with a name-based query
  (`getByRole('group', { name: 'People', exact: true })` → 1). The green round trip pins today's
  tree — when the `it.fails` goes red, the snapshot changes with it; update both. Synchronize the
  open state on a visible locator (`await expect.element(page.getByRole('listbox')).toBeVisible()`)
  before snapshotting, not on a sleep; the matcher's own stability polling does the rest. Pass
  `exact: true` to every name that is data.
- Three ways to aim the feature, in order of payoff measured here: (1) the census, for "what does
  an AT get" across the whole library at once; (2) transition pairs on overlays, where the
  structure only exists when open; (3) **family conformance** — one regex template shared by
  siblings that should expose the same shape. `CalendarFamily.aria.browser.test.ts` now applies
  that contract to the six calendar families and catches a sibling that loses its application or
  grid naming without requiring someone to read the whole census tree.

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
| `mount(C, { attachTo: document.body })` | `await render(C)` — **drop `attachTo`; it throws** |
| `beforeEach(() => document.body.innerHTML = '')` | *(delete)* **only if assertions are container-scoped** — keep it when they query the whole document (see gotcha) |
| `wrapper.unmount()` at the end of a test | *(delete)* — `render` cleans up |
| `wrapper.find('style')` / any role-less element | `screen.container.querySelector(…)` — no locator can address it |
| `wrapper.attributes('x')` | `await expect.element(el).toHaveAttribute('x', v)` — takes a raw `HTMLElement`, not just a locator |
| `findByRole(document.body, …)` — **portalled content** | `screen.getBy*` **or** `page.getBy*` — both are document-scoped and return the same node. Only `screen.locator` / `screen.container` are container-scoped |
| `getByText('x')` | `getByText('x', { exact: true })` — vitest locators default to **substring** |
| bare `getByTestId(…)` used *as* an assertion | `await expect.element(…).toBeInTheDocument()` — a locator is lazy and throws nothing |
| `expect(wrapper.attributes('x')).toBeUndefined()` | `await expect.element(el).not.toHaveAttribute('x')` |
| `expect(domNode).toStrictEqual(otherNode)` when identity is the contract | `expect(domNode).toBe(otherNode)` — structurally identical elements can compare equal under `toStrictEqual` |
| `wrapper.find('button')` / `findAll('button')` when the **tag** is the subject | `screen.container.querySelector('button')` / `querySelectorAll('button')` — a role-equivalent `<div>` must not pass |
| `wrapper.findAll('button')` when the **role** is the subject | `screen.getByRole('button').elements()` |
| `VueWrapper.find(All)(sel)` | `screen.container.querySelector(All)(sel)` — both include component root nodes; `DOMWrapper.findAll` stays `element.querySelectorAll` and excludes the wrapped element |
| `await nextTick()` only to settle an eventual DOM outcome | delete it; make `await expect.element(locator)…` own the wait |
| `await nextTick()` after `await locator.click()` for a synchronous Vue update | delete it; the awaited real interaction crosses the event task and Vue's microtask flush |
| `wrapper.text()` | `screen.container.textContent` |
| `userEvent.keyboard('{19}')` — a **multi-character** braced key | type the real keys (`'1'`, `'9'`). A brace whose contents are not a real Playwright key name silently becomes `insertText` and fires **no key events at all** |
| `fireEvent.keyDown(el, { key })` where the component also reads **`keyup`** | `{Key>}` / `await sleep(0)` / `{/Key}` — a plain `{Key}` releases before a `setTimeout(0)` runs |
| `wrapper.findAllComponents(X)[n].emitted('e')` | **no equivalent** — `render`'s `emitted` is root-only and the `VueWrapper` is not exposed. Observe the DOM event that drives the emit (a `bubbles: false` `CustomEvent` still reaches a **capture** listener) |
| `el.trigger('click')` on a **disabled** element | `loc.click({ force: true })` — delivers only `pointerdown`, then focuses the nearest *mouse*-focusable ancestor |
| `wrapper.find('[type="Radio"]')` | ports **verbatim**, capital R and all — `type` is on HTML's case-insensitive attribute-value list |
| `el.dispatchEvent(new CompositionEvent('compositionstart'))` + hand-set `.value` + `new Event('input')` — an IME sequence | **Chromium:** `cdp().send('Input.imeSetComposition', { text, selectionStart, selectionEnd })`, then `Input.insertText` to commit — real `compositionstart/update/end` *and* `beforeinput`/`input` with `isComposing: true` (see the `cdp()` gotcha). Other engines: keep the synthetic dispatch |
| `el.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch' }))` — a touch gesture | **Chromium:** `cdp().send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })` … `touchMove` … `touchEnd` — real `pointerType: 'touch'` pointer events plus `touchstart/move/end`; coordinates are page-level (offset *and* scale from `window.frameElement.getBoundingClientRect()`) |
| ResizeObserver / pointer-capture mocks | *(delete)* |

`vitest-browser-vue`'s `render` accepts *almost* all `@vue/test-utils` mount options, so most of
this is mechanical. **The exception is `attachTo`, which it rejects outright** —
`dist/pure-epEwB8Ps.js:24` is `if (mountOptions.attachTo) throw new Error("`attachTo` is not
supported, use `container` instead")`. `render` owns the mount point. A file whose every test
mounts with `attachTo: document.body` (`FocusGuards`, `VisuallyHidden`, `Viewport` all do) will
crash on the first test if you port that option literally, so **drop it** — do not translate it
to `container: document.body`.

---

## Known gotchas (found the hard way — add to this list)

### Cross-browser

**Firefox and WebKit route focus and keyboard to the active tab, and Vitest runs files in parallel
tabs.** Whole corpus, one engine, default parallelism: Firefox 30 failures, WebKit 13; with
`--no-file-parallelism`: 18 and 12 — and every failure that vanished was a focus or keyboard-routing
assertion (DateField/TimeField `stepSnapping`, whose typed value is snapped on `focusout`; Calendar's
next-button clicks; NavigationMenu Tab; Menu sub-trigger hover; Combobox addOnBlur; ColorArea thumb
focus), each green in an isolated rerun (DateField 62/62, Calendar 54/54). In this historical
97-file migration-close measurement Chromium was immune (97/97 parallel).
`vite.config.cross-browser.ts` therefore sets `fileParallelism: false` and pays
~2.5× wall clock (Firefox 35s → 87s, WebKit 21s → 81s). Read a non-Chromium failure list only after
a serial or isolated rerun. *[mechanism inferred from which tests flip, not from engine source]*

**Three `browser.instances` in one process fail Chromium tests that are green alone.** In that same
historical 97-file measurement, chromium + firefox + webkit together took 97s with 86 failures,
**11 of them Chromium** (Select, DateField,
Toast, MonthRangePicker, DropdownMenu, DismissableLayer…) in files that are 97/97 when Chromium runs
by itself. CPU contention against the 2000ms `actionTimeout` and the timing-shaped tests, not an
engine difference. One engine per process; the CI matrix is one engine per job.

**A test can depend on an engine's locale-alias table.** `DateField`/`TimeField` pass
`locale: 'en-UK'` — not a valid BCP 47 tag (the region is GB). V8 and SpiderMonkey alias UK→GB and
render `dd/mm/yyyy` with no day period; JavaScriptCore resolves it to `en` (measured:
`Intl.DateTimeFormat('en-UK').resolvedOptions().locale` → `en`, `hour12: true`, month-first), so
three locale tests fail on WebKit on both OSes. The tests have asserted V8's alias since jsdom.
Fix is `en-GB`; recorded, not patched (`cross-browser#webkit-en-uk-not-aliased`).

**A script-built `DataTransfer` is empty inside a `ClipboardEvent` in Firefox.** Chromium and WebKit
deliver it (`getData('text/plain') === 'test'`); Firefox gives a non-null `clipboardData` whose
`getData` returns `''` (measured, macOS and Linux). The six PinInput paste tests and two TagsInput
delimiter-paste tests therefore exercise an *empty* paste on Firefox and fail — nothing in the
component is wrong, the synthetic paste is Chromium/WebKit-only. This was a migration-time finding:
the final suite serializes real keyboard copy/paste through a typed browser command, so the eight
Firefox expected failures are gone (`cross-browser#firefox-clipboardevent-empty-datatransfer`).

**`innerHTML` attribute order is engine-specific when `style` is written through the CSSOM.**
ScrollArea's five DOM snapshots fail on Firefox and Tree's on Firefox *and* WebKit with **zero
differing attributes** — only order: Chromium serializes `tabindex="0" style="…"`, Firefox
`style="…" tabindex="0"`; Tree's `<ul>` is `role="tree" style="outline: none;"` in Chromium and
`style role` elsewhere. The `.snap` files are Chromium baselines, as non-portable across engines as
across fonts (`#snapshots-real-geometry`). Expected-fail on the other engines rather than sorting
attributes in a serializer (`cross-browser#dom-snapshot-attribute-order`).

**macOS WebKit neither focuses a clicked button nor tabs to links and buttons.** Measured:
`activeElement` stays `BODY` after `locator.click()` on a `<button>` or `<a href>`; the Tab path from
a button is `BUTTON → INPUT → BODY` on darwin and `BUTTON → A → BUTTON → INPUT` on Linux (Firefox
tabs to both on both OSes). So NavigationMenu's "after pressing down key" pair (ArrowDown goes to
BODY because the opening click never focused the trigger), its "after pressing tab", and DatePicker's
"navigates the segments using tab" fail on darwin WebKit and pass in the Linux container. These are
`platform: 'darwin'` rows — the browser implementing the OS convention, not a bug anywhere
(`cross-browser#webkit-darwin-click-does-not-focus`, `#webkit-darwin-tab-skips-links-and-buttons`).

**WebKit moves focus off the DatePicker trigger on ArrowRight.** Path on every engine:
`… dayPeriod → timeZoneName → trigger`; one more ArrowRight keeps the trigger on Chromium and
Firefox and returns to `timeZoneName` on WebKit, both OSes. "navigates segments using the arrow
keys" fails there. Mechanism not traced (`cross-browser#webkit-arrowright-leaves-trigger`)
`[unverified]`.

**A quarantined bug can be engine-specific.** `HoverCard#pending-focus-reopens` (`it.fails`) passes
on WebKit, which `it.fails` reports as "Expect test to fail". The expectations table has a `passes`
kind for exactly this: the WebKit run now *requires* it green, and the row goes stale the day it
fails there too (`cross-browser#hovercard-pending-focus-not-in-webkit`).

**`Drawer.snap` is nondeterministic on Firefox and WebKit.** Synchronous reads of
`--drawer-snap-point-offset` after `click` + three `nextTick`s come back `0px` instead of `448px`:
on WebKit the same three tests in every isolated run and a fourth once under load, on Firefox two
of them per run but *which* two varies (5 runs, 4 distinct pairs; the Linux container failed the
fourth instead). The identical open/close/reopen sequence probed in a fresh page writes `448px`
synchronously on all three engines, so it is order/state-dependent; root cause `[unverified]`. Both
engines' rows are `skip` — a flaky test cannot be pinned to `fails` without turning the table itself
flaky (`cross-browser#drawer-snap-offset-nondeterministic`).

**`task.fails` can be flipped from a `beforeEach`.** The runner reads it after the test body
(`runner/src/run.ts:765`), so a setup-file hook that sets `ctx.task.fails = true` inverts the
verdict exactly like `it.fails`, and `= false` un-inverts a source-level `it.fails`. That is how the
expectations table works without touching a single ported file. `ctx.skip(reason)` from the same
hook is the `skip` kind. `afterAll` in a setup file cannot take the suite as its first argument
in 4.1 (`FixtureParseError`: the first parameter must destructure); track the current file from
`beforeEach` instead.

**Measure the Linux column.** The macOS focus rules above would have been recorded as engine rules
had the run not been repeated in the pinned `mcr.microsoft.com/playwright:v1.62.1-noble` image
(`docker run … sleep infinity`, copy the tree without `node_modules`, `pnpm i --frozen-lockfile`,
same serial commands). Engine-level rows held on both platforms; the two macOS rows did not
(`cross-browser#linux-verdicts`).

### Everything else

**A braced key that is not a real key name is not a keystroke.** `userEvent.keyboard('{19}')` looks
like "type 19" and is not: vitest's Playwright provider checks the parsed key against a `VALID_KEYS`
set of real Playwright key names (`@vitest/browser-playwright/src/commands/keyboard.ts:52`, used at
L86-91) and otherwise falls back to `page.keyboard.insertText(key)`, **which fires no `keydown` at
all**. Measured in `DateRangeField`: a literal port passed 7 of 8 tests with the day segment never
filling and focus never advancing — the failure reads like a focus bug and is not one. The text does
not even leak into the contenteditable, because `handleSegmentBeforeInput` prevents it. Type the real
digits instead. **Blast radius, grepped: 8 sites in 4 date files** — `DateField.test.ts` L432/435/457/459,
`TimeField.test.ts` L69, `DatePicker.test.ts` L364/368, `DateRangeField.test.ts` L67. The year sites
(`{1980}`, `{2020}`, `{1111}`) need per-site verification, not a blind rewrite: four real digits go
through year accumulation rather than one key.

**A synthetic keypress has zero duration, and that loses races a human always wins.** Chromium
services the input task before a 0ms timer, so `userEvent.keyboard('{X}')` delivers **keyup before a
`setTimeout(…, 0)` scheduled from the keydown**. `RadioGroupItem` latches `isArrowKeyPressed` on
keydown, clears it on keyup, and defers its `.click()` by `setTimeout(0)` — so a plain `{ArrowDown}`
selects nothing. Measured over 15 isolated renders each: plain `{ArrowDown}` **1/15**, held
`{ArrowDown>}` + `sleep(0)` + `{/ArrowDown}` **15/15**; the trace is always
`keydown → focusin → keyup → setTimeout(0)`. `userEvent.keyboard(text)` takes no delay option, so the
hold syntax is the only lever. The held form is also the *faithful* translation, because
`fireEvent.keyDown` dispatches a keydown and **never a keyup** — which is why `RadioGroupItem.vue:69`,
the keyup reset, has **hit count 0 across the entire jsdom file** and the flag stays stuck `true` for
the rest of it.

**A held modifier persists until explicitly released.** `useTestKbd().SHIFT_TAB` expands to
`{Shift>}{Tab}` and contains no `{/Shift}`. Measured in `TimeRangeField`: Chromium carried Shift
from the right-to-left navigation test into a later label click, suppressing native label
activation; the label test passed alone and the exact pair reproduced the failure. Final-suite
confirmation: an unreleased DateRangeField Shift made six later ToggleGroup arrow-focus tests fail,
while ToggleGroup alone stayed 15/15 green. Append the release token to every chord unless continued
modifier state is the contract.

**Force-clicking a disabled element delivers only `pointerdown` — and then focuses an ancestor.**
Confirming that `force: true` skips the wait rather than the gesture. Chromium then focuses the
nearest *mouse*-focusable ancestor, and `tabindex="-1"` counts as mouse-focusable. In `RadioGroup`
that ancestor is the roving-focus group, so its `@mousedown` never runs, `isClickFocus` stays false,
and `handleFocus` runs the full **entry-focus** algorithm for what was a mouse interaction — i.e. the
Safari workaround is bypassed exactly in the disabled case. Worth knowing before the T3 overlays.
If there is no mouse-focusable ancestor, the press instead blurs the current control to `BODY`
(measured in `Stepper`). Therefore `activeElement !== disabledTarget` is a vacuous assertion: also
assert the valid selection/current state that the disabled gesture must preserve.

**A modal overlay's `body { pointer-events: none }` is real, and no click flag overrides it.**
`DismissableLayer` with `disableOutsidePointerEvents` (every modal Select/Dialog path) styles the
body inert, and Chromium's hit-testing honours it: everything outside the content — *including the
trigger* — is unreachable by any pointer. `force: true` does not help, because a forced click is
still trusted input dispatched at coordinates, and the browser routes it to `<html>` (the one
element that keeps `pointer-events: auto`, since the inherited `none` starts at `body`). Measured
in `Select`: the original's "click Close while open" and "pointerdown the trigger while open" are
gestures no user can make; jsdom performed them happily because it has no hit-testing. Three rules
fall out: (1) a press *at those coordinates* is an **outside press** and dismisses — which jsdom
never saw, because of the zombie-listener entry below; (2) the **keyboard is exempt** —
`pointer-events` does not gate keydown, so Escape (and Tab, where not trapped) are the gestures a
port can use; (3) keyboard-activating a button inside a not-yet-positioned popper world is racy —
see the fake-timers entry. Expect all of this on every remaining T3/T4 overlay.

**`vi.useFakeTimers()` works in browser mode — and freezes `requestAnimationFrame`.** First
exercised in `Select`'s cleanup test, all of it real: sinon installs on the tester-iframe window,
`vi.getTimerCount()` sees the component's pending `setTimeout`s, `vi.spyOn(window, 'clearTimeout')`
wraps the fake and catches unmount cleanup, and Playwright actions plus retrying matchers keep
running on *real* time outside the page, so you can still click and poll while the page clock is
frozen. The sharp edge is the default `toFake` set, which includes `requestAnimationFrame` and
`performance`: floating-ui positioning freezes, so anything downstream of `isPositioned` — Select's
`focusSelectedItem` auto-focus above all — is deferred indefinitely and then fires *whenever a
later RPC lets a frame through*. Measured: focusing the Close button and pressing Enter lost a race
to exactly that deferred auto-focus; the component stole focus mid-`userEvent.keyboard` and Enter
selected an item instead — every assertion still passed, and only the coverage oracle noticed the
Close handler never ran. Under browser fake timers: never wait on anything rAF- or
positioning-dependent, don't build poll loops on `performance.now()` (it is frozen too), and drive
state through microtask-only paths.

Second data point, from `NavigationMenu`: the frozen clock also starves the **ResizeObserver →
CSS-var pipeline** — the viewport's `--reka-navigation-menu-viewport-height` never gets set, the
`overflow-hidden` viewport computes 0px tall, and every link in the open menu hit-tests to the nav
list behind it. A real hover of content is therefore *impossible* in a fake-timer test (Playwright
burns the full timeout on interception), and the original's synthetic `pointerleave` dispatch is
the correct port, not a shortcut.

**`vi.mock` works in browser mode, unchanged.** Measured in `NavigationMenu` on Vitest 4.1.10: a
hoisted `vi.mock('@vueuse/core', async factory)` with `vi.importActual`, per-test
`vi.mocked(...).mockImplementation` swaps, and a mid-test restore of the real implementation all
behave exactly as under jsdom, and the component under test receives the same mocked module
instance the test file sees. No config, no `{ spy: true }` needed for a factory mock.

**A real mouse click cannot avoid hovering first.** Playwright's click moves the pointer onto the
element, so every `pointerenter`/`pointermove` handler fires before `mousedown` does — which
inverts jsdom's world, where a click was *only* a click. On a hover-opening component
(`NavigationMenuTrigger`), the "open on click" test still passes but through the hover-open path
(the trigger ignores the click that follows a hover-open within 300ms), and a
"clicking must NOT open" test (`disableClickTrigger`) cannot be expressed with real input at all —
hover isn't disabled there, and Chromium's `HTMLElement.click()` dispatches
`PointerEvent { pointerType: '' }`, which such guards deliberately let through for keyboard/AT.
The original's own `{ pointerType: 'mouse' }` synthetic event is the faithful port. Expect this on
`Tooltip`, `HoverCard`, and every hover-triggered overlay.

**A zero-distance `page.mouse.move()` still emits `pointermove`.** Measured while reviewing
`useIsUsingKeyboard`: the custom `mouseDown(x, y)` command moves before pressing, and Chromium
emits one move even when the pointer is already at exactly `(x, y)`. If the component handles both
move and down with the same callback, pre-positioning followed by that command does not isolate the
down path. Split out a press-only command (`page.mouse.down()`) when the event type is the contract.

**The compat-sequence rituals evaporate — and so do their workarounds' workarounds.** `Select`'s
original opens with `pointerdown` + hand-fired `mousedown`/`mouseup`/`click`, then needs **two**
`pointerup`s per selection, because its own opening gesture leaves the trigger-press position
armed and `SelectContentImpl`'s capture guard swallows the next `pointerup`. A real trigger click
delivers its own `pointerup` at the unmoved position — the exact "accidental pointerup" the guard
exists for — so the guard consumes it, disarms, and a following real option click selects on the
first try. When a jsdom file performs the same event twice with a comment explaining why, the
comment is usually describing its own gesture's incompleteness, not the component.

**A `bubbles: false` `CustomEvent` still reaches a capture listener.** That is the escape hatch when
the Vue emit you need lives on a *child* component: `render` binds `emitted` to the root wrapper only
and never exposes the `VueWrapper`, so `wrapper.findAllComponents(X)[n].emitted('e')` has no
translation. Observe the DOM event that drives the emit instead — reka dispatches these through
`shared/handleAndDispatchCustomEvent.ts` — with a capture listener on `document`.

**`renderToString` works in the browser project, unmodified.** `@vue/server-renderer@3.5.17`'s package
exports carry **no `browser` condition** — only `types`/`node`/`module`/`import`/`require` — so Vite
takes `import` and serves `dist/server-renderer.esm-bundler.js`, a pure string builder over
`@vue/shared` with no `node:` import in it. The "the `vue` browser condition gives you runtime-only"
fear does not apply. `createSSRApp` + `idPrefix` + `renderToString` + `app.mount(container)` hydration
all run in the tester iframe, and client-compiled SFCs (`render`, not `ssrRender`) work because Vue
falls back to walking the client vnode tree. Verified in `Tabs` by falsifying its two *negative*
hydration assertions: a probe hydrating a `nuxt-N` server tree against an `other-N` client tree
produced a real `Hydration attribute mismatch` warning, captured by the spies.

**…and the cost of an SSR test is not the SSR — it is the container.** Such a test builds its own
`document.createElement('div')` and appends it to `document.body`, and `cleanup()` only removes
containers *it* created, so a **live hydrated Vue app survives for the rest of the file**. Measured in
`Tabs`: after a later `render()`, `screen.getByRole('tab').elements()` and `page.getByRole('tab')`
both return **4** while `screen.container.querySelectorAll` returns 2. Since `screen`'s helpers are
document-scoped, a role-query translation of `wrapper.findAll('button')[1]` indexes into the
leftovers. **Container-scope every query in a file that contains an SSR test.**

**`console.warn` and `console.error` DO reach the terminal; `log` and `info` do not.** Refining the
entry below — the original claim was about `console.log` and over-generalised. Browser-mode `warn`/
`error` are forwarded as `[vite] (client) [console.warn] …`. Forwarding and spying are also
independent: `vi.spyOn(console, 'warn').mockImplementation(() => {})` captures the call *and*
suppresses the forwarding.

**A warning count does not prove which warning fired, and an unawaited action can borrow one from
another instance.** Dialog's helper dropped the Promise from its click, so the intended nested
dialog had not opened when the assertion ran; the single counted warning belonged to the still-open
outer dialog. Await the causal action, clear the targeted spy after unrelated teardown, filter only
the component warning channel when compiler noise is expected, and assert the exact message rather
than `toHaveBeenCalledTimes(1)`.

**A production behavior explicitly disabled under `MODE === 'test'` cannot be validated by moving
the same test to browser mode.** Dialog's hide-others hook returns before applying `aria-hidden` in
both projects, and the old test also inspected `body` instead of a concrete outside sibling. Record
the gap; meaningful coverage needs a production-mode seam/build and an observable outside element.

**`process.env.TZ` from `globalSetup` reaches Chromium by env inheritance — and WebKit ignores it.**
`vitest.global.ts` sets `US/Eastern`, and the Chromium tester iframe reports `America/New_York` on a
host whose `/etc/localtime` is `Europe/Berlin` — measured. So `@internationalized/date` fixtures,
including `ZonedDateTime`, port unchanged, and `navigator.language` is `en-US` in both. *(This entry
previously ended "nothing sets `browser.timezoneId`, a single silent point of failure for 12 date
files".)* The cross-browser run cashed that warning: Firefox inherits the env var too, **WebKit does
not** — every `ZonedDateTime` assertion in DatePicker, RangeCalendar and TimeRangeField reported
`Europe/Berlin` there. Both the `browser` and `cross-browser` projects now pass
`playwright({ contextOptions: { timezoneId: 'America/New_York' } })`, which fixed all three files on
WebKit with no other change (`cross-browser#webkit-timezone-not-inherited`); the env var stays for
the node/jsdom projects.

**A retrying matcher settles its own assertion, not "Vue's flush".** Never put
`await expect.element(X).toHaveAttribute(expected)` immediately before a synchronous read of the
same `X` and `expected`: the retry has already guaranteed the second assertion. Mutation-verified
in `Presence`: delaying instant unmount by 500ms made the original fail while that two-assertion
port stayed green. If an interaction needs settling, wait on a **different precondition** in the
hook (the open state before clicking closed), then preserve the original's instantaneous read.
An awaited Playwright click already crosses Vue's microtask flush for synchronous state updates;
timers, transitions, and async watchers still need an explicit, distinct synchronization point.

**Do not count a browser-only test adapter as gained product coverage.** During migration,
`src/test/browser.ts` was a small VTU-compatible wrapper used by five large ports. Istanbul initially
reported every adapter line as browser-only because the jsdom originals never import it: apparent
gains included +49 for Autocomplete and +29 for TagsInput. `parity-coverage.mjs` now excludes that
exact harness path; the production gains are +25 and +1. Apply the same rule to any future helper
under the instrumented source tree. The reference-quality follow-up removed the adapter entirely.

**Shared helpers fail at the call site only if you wrap them — `vi.defineHelper` (4.1.0) does it,
and it trims the stack, not the message.** From source: the wrapper is a function named
`__VITEST_HELPER__` (`vitest/src/integrations/vi.ts:614`) and `@vitest/utils/src/source-map.ts:235`
slices the stack at the *last* such frame, so nested helpers resolve to the outermost call and a
plain `throw new Error` is trimmed like an assertion; the browser tester's errors go through the
same parser (`browser/src/node/rpc.ts:177`). Measured on six shapes in Chromium (table in the
guide, §6): wrapped sync/async/`expect.element`/nested-throw all land on the test line. The
migration-time compat adapter demonstrated the trap: `find(sel)!` + `.attributes()` wrapped still
read `Cannot read properties of null (reading 'getAttribute')`, just at a better line. It therefore
guarded every consuming method **and** wrapped it; the final audit then deleted the adapter when its
ordinary interactions moved to locators and `userEvent`. `cellQueries` (`get`/`getAll`/`rect`) and
`cell(name)` in the visual helper are wrapped too: `cell('Nope')` reports at the sheet file's
line. Five compat files (169 + 4 expected fails) and the 22 visual files (25 + 1) unchanged. Do
not wrap `expect.extend` matchers (already call-site) or `setup()` factories; for a helper called
in a loop keep a `message:` naming the iteration, because the call-site line is the same each
time. While *authoring* a helper, leave it unwrapped — its own frames disappear.

**Prefer outcome synchronization over `nextTick()`.** Auditing every completed browser port found
14 actual calls: 2 before retrying Toolbar assertions, 5 after Teleport mounts, and 7 in Presence.
All 14 are gone. Toolbar needed no replacement because `expect.element` already owns the wait;
Teleport now waits for the user-visible locator before taking raw nodes for structural assertions;
Presence keeps exact synchronous reads immediately after awaited real clicks. The exact Vitest
4.1.10 source matters: `expect.element(locator)` is `expect.poll(...)` and re-queries the locator
on every attempt (50ms interval, 1000ms timeout by default). `await render()` itself does **not**
call Vue's `nextTick` — its thenable records a trace mark — while `await rerender()` delegates to
VTU `setProps()`, which already returns `nextTick()`. Keep an explicit tick only when "after one
Vue flush" is itself the contract, or when the state change bypasses an awaited browser action.
Mutation check: delaying Presence's instant unmount by 500ms still made both exact browser close
assertions fail after their ticks were removed.

**A retrying matcher is a silent weakening when the subject is timing.** `Progress`'s
`describe('after 200ms')` is one instantaneous read. A retrying matcher widens that to the sleep
plus its retry budget; moving the fixture's flip from 200ms to 900ms made the jsdom original fail
while the first browser port stayed green. Keep the synchronous read. Rule of thumb: **when a
`describe` name mentions a duration, never retry the condition it asserts.**

**A tag query and a role query are not interchangeable when the tag is the contract.** The
unmutated nodes can be identical and still make the translation weaker. Serving Primitive's
`as="button"` as `<div role="button">` made the original's `find('button')` fail while a role-only
port passed all 15 tests. Use a container CSS query when the component chooses the element; use
`getByRole` when accessible semantics are what the original asserts.

**Do not discover nodes through the property you are about to assert.** A port that calls
`getByRole('option').elements()` and then asserts every returned node has `role="option"` is
self-fulfilling: a broken item simply disappears from the subset, and `elements()` need not throw.
Measured in `ColorSwatchPicker`. Discover through an independent stable marker (`[data-color]` in
that fixture), then assert the role on the complete set.

**Expected values should not reuse the production derivation under test.** Comparing an item's
label with the same `getColorName` helper the component calls lets a helper regression move actual
and expected together. For a finite public fixture, use literal expected labels. First applied to
all seven ColorSwatchPicker colors after independent review.

**A selected-count assertion does not prove selection identity.** The YearRangePicker and
MonthRangePicker originals asserted only that a range rendered four years or three months.
Mutation-shifting `isSelected` by one period kept those counts green while selecting 1981–1984
instead of 1980–1983 and February–April instead of January–March. When the contract names a range,
assert the complete literal ordered labels and the concrete start/end nodes; partial membership and
generic marker existence leave the same offset bug alive.

**Structural equality is not DOM-node identity.** Distinct elements with the same markup can
compare equal under `toStrictEqual`. Measured in `useArrowNavigation`: three assertions named the
wrong sibling (`child1` vs `child2`, and reversed Home/End targets) yet stayed green because every
fixture node was the same empty `<div>`. When the contract is which node was returned or focused,
use `toBe` and ensure the starting node makes the requested navigation observable.

**A test name can describe a premise the fixture never constructs.** Two reviewed ports caught
this independently. `Collection` claimed registration order differed from DOM order, but both were
`first, second, third`; deleting the sort stayed green. `useDrawerSnapPoints` named clamping and
fast-swipe branches, but its outcomes were also produced by nearest-snap and physical-crossing
fallbacks. Reorder after registration or choose inputs on opposite sides of the decision boundary,
then mutation-check the exact branch named by the test.

**`VueWrapper.find(All)` includes component roots; `DOMWrapper.findAll` does not include itself.**
`vitest-browser-vue` unwraps its internal mount div, so component roots are direct children of
`screen.container`: a container query preserves the first behavior, while
`element.querySelectorAll` preserves the second. Primitive uses both patterns one line apart.

**DOM-property reflection can be more capable in Chromium than jsdom.** For
`hidden="until-found"`, jsdom's boolean `hidden` setter reflects `''`; Chromium's enumerated setter
reflects `'until-found'`, which is the platform behavior. A port that preserves an assertion for
the jsdom artifact should quarantine it and record the browser result rather than coercing Chrome
back to the old value.

**CSS animation tests become real in Chromium.** jsdom returned an empty `animationName` for every
Presence fixture, so its animated block exercised the same instant-unmount path as the default
block. With local keyframes in Chromium, close starts the exit animation and the node correctly
stays mounted until `animationend`. Use a real `AnimationEvent` instead of adding properties to a
plain `Event`; a `getComputedStyle` spy itself can remain unchanged.

**Two silent vacuities from `@testing-library` originals — the oracle cannot see either.** Both
leave the assertion count unchanged, so `port:parity` passes while the test stops testing.

1. **`getByText` defaults to a *substring* match in vitest locators; `@testing-library`'s defaults
   to whole-string.** Measured: `screen.getByText('checked').elements()` returns **one element whose
   `textContent` is `unchecked`**. With `{ exact: true }` it returns zero. Both of `Switch`'s toggle
   tests would have passed against a switch that never toggles. It bites hardest when the two
   expected strings are prefixes of each other — `checked`/`unchecked`, `valid`/`invalid`.
2. **A locator is lazy, so `getBy*` no longer asserts.** In a `@testing-library` original the
   *throw* is the assertion; `screen.getByTestId('does-not-exist')` constructs without throwing
   (measured). A test whose only "assertion" was a bare `getBy*` becomes a test with no assertion
   at all.

Audited across every port completed so far: the lazy-locator class is clean, and the four
non-`exact` `getByText` calls all resolve correctly — **`getByText` targets the deepest element
containing the text**, verified by probe (`<div><label>Label</label><input></div>` → one match,
`LABEL`, not the div whose `textContent` is also `Label`).

**Role-*name* matching is substring too — `getByRole('option', { name: 'Apple' })` matches
Pine*apple*.** The third member of the substring family, measured in `Select`: the un-exact
locator resolved to 2 elements and failed as a strict-mode violation. That is the *loud* failure
mode; the quiet one is a name with a single substring match, which silently widens the query the
day a colliding option is added. Pass `{ name: …, exact: true }` whenever the name is data rather
than a label you control. Related strict-mode trap from `Combobox`: an original's
`find('[role=group]')` (first match) is NOT `getByRole('group')` (strict, one match) when the
fixture renders two groups — a wait written with the locator times out on the violation. Poll the
original's own container query instead.

**…and the whole substring family is switched off by one config flag that already exists on 4.1.**
`browser.locators.exact: true` (`docs/config/browser/locators.md`, **since 4.1.3**, experimental;
wired at `browser/src/client/tester/locators/index.ts:56` into `Ivya.create`) makes `getByText`,
role `name` and the other text locators whole-string by default — it is Vitest 5's default, not a
v5-only API. Measured on 4.1.10 over the browser project with it on: **1496 pass, 2 fail, both
Menubar** — `getByRole('menuitem', { name: 'New Tab' })` had been matching an item whose accessible
name is `New Tab ⌘ T` (the shortcut hint is inside the item, `_Menubar.vue:57-62`): the quiet
widening predicted above, made loud. Both the `browser` and `cross-browser` projects now set it, the
Menubar locator names the full string, and the defensive `{ exact: true }` calls elsewhere are
redundant but harmless (`browser-mode#locators-exact-on-4-1`,
`Menubar/Menubar.test.ts#menuitem-name-includes-shortcut`).

**`toHaveTextContent` is substring-based too.** DateField and DatePicker had named overwrite,
overflow and ArrowUp cases where expected `1` was already present in initial `1980` or `12`, and
expected `5` accepted a broken `20245`. When a segment's rendered value is the contract, compare
trimmed text exactly and include visible formatting such as `00`, `01` and `07`; otherwise zero
padding and stale prefixes can both hide regressions.

**A virtualizer settles asynchronously under real ResizeObserver — and starts by mounting
everything.** Measured in `Combobox`: `@tanstack/virtual-core` rendered all 100 rows at the
original `flush()`'s timing and trimmed to 20 (8 visible + overscan 12) once the real RO
measurement of the 200px viewport landed. jsdom's rect stub made measurement synchronous, so the
original's flush choreography was calibrated to the stub. Let the subset assertion own the wait
(`expect.poll(… .length).toBeLessThan(100)`); a fixed flush ports the stub's timing, not the
component's.

**Do not mutate a Vue-owned inline style behind Vue's back to drive ResizeObserver.** Measured in
`useSize`: directly changing the observed element's `style.width/height` made the real callback
trigger a render that restored the old virtual-DOM style, creating `ResizeObserver loop completed
with undelivered notifications`. Put the dimensions in reactive fixture state and change them via
the fixture's real control; then Vue and the observer agree on ownership and the size transition is
the component's scenario rather than a test-induced feedback loop.

**Make observer-driven fixtures start at their settled geometry before suppressing anything.**
ScrollArea's two-axis corner writes 10px CSS variables that shorten both observed tracks from 200px
to 190px during the first delivery. The functional corner regression now declares those real 190px
track lengths up front and Chromium, Firefox, and WebKit run it without an observer warning. The
visual story sheet intentionally renders the natural multi-variant mount; Vitest 4.1.10 still prints
the Vite client's exact deferral diagnostic before `onUnhandledError` accepts it. The visual and
cross-browser configs match that complete message only, and every other browser error remains fatal.

**A mock-choreographed numeric expectation may rebase deterministically — measure before
quarantining.** Combobox's popper slot-render ladder is 3-then-4 in jsdom and **4-then-4** in
Chromium (real floating-ui does at open the position update jsdom deferred a tick), stable across
repeated isolated runs and a +50ms settle probe. The browser numbers are the *stronger* form of
the test's claim ("does not keep re-rendering"), so the port pins them with a finding
(`#popper-render-count-rebased`) instead of quarantining. Rebase only on measured determinism.

**DOM snapshots of real layout embed font metrics.** `ScrollArea`'s browser snapshots carry
`--reka-scroll-area-thumb-height: 18px` and a post-scroll `translate3d(0px, 0.79476px, 0px)` —
values computed from how tall lorem text wraps at 50px, i.e. from the font stack. Verified stable
across consecutive runs on one machine; do **not** expect the baselines to survive a different
OS/font image, the same way screenshots don't. A `.browser.test.ts` file writes its own `.snap`,
so the jsdom baselines stay untouched for diffing — and the diff is the payoff: jsdom's
prototype-stubbed geometry made every thumb ratio the same fiction. If cross-machine CI ever
matters, normalize computed values with a snapshot serializer rather than re-stubbing geometry.

**A visual story sheet should be one Vue tree, not a pile of reparented `render()` containers.**
The `AspectRatio` pilot rendered its variants below one neutral host, proved each exact ratio
numerically, then captured the complete sheet once; `defineHistoireStory`'s stand-in `<Story>`
is that same host, now with the story file supplying the variants. This matters beyond tidiness: `vitest-browser-vue` unwraps `wrapper.parentElement`, while reka's
`useForwardExpose` can make the wrapper's public `$el` point at an inner primitive. A directly
rendered component with a load-bearing outer wrapper can therefore lose that wrapper in the test
harness; `AspectRatio` measured 414×0 while its browser DOM snapshot passed. A neutral story host
keeps the production wrapper intact. Keep raw failure screenshots ignored, explicitly unignore
only `*.visual.browser.test.ts` references, and run them under the fixed visual config rather than
the functional/coverage project.

**Histoire has no portable stories — but its `<Story>`/`<Variant>` are global components, and that
is enough.** Storybook's Vitest addon works through `composeStory` (a CSF export becomes a plain
renderable) plus a Vite plugin that rewrites `*.stories.*` into tests. Histoire 0.17.17 has
neither: `@histoire/plugin-vue`'s runtime `<Story>` reads the story object only its own
`MountStory` sub-app supplies, and `<Variant>` **renders `null`** — the slot is pulled out later
via `variant.slots()` and mounted by `RenderStory` in a separate `createApp` (read from
`src/client/app/{Story,Variant,RenderStory}.ts`). Its official visual path is build-time
(`@histoire/plugin-screenshot` over `histoire build`, or Lost Pixel/Percy on the built site) — a
second browser pipeline with no numeric assertions beside the image. What *does* work, measured:
the SFCs resolve `Story`/`Variant` as **global components**, so
`render(StoryFile, { global: { components: { Story: StandIn, Variant: StandIn } } })` renders the
story's own markup under the visual host — 13 variants, 20 real sliders, 228ms, for
`SliderChromatic`. It holds for the whole tree because **0 of the 176 stories use `initState` or
the `{ state }` slot prop** (grepped); `defineHistoireStory` still supports the sync form, and
declares every prop Histoire's `components.d.ts` lists so none of them leaks onto the DOM.

**`@iconify/vue` renders nothing until its data arrives — and by default that data comes from the
network.** `Icon.render()` returns an empty placeholder until `iconMounted` flips in `mounted()`,
then calls `getIconData(name)`: if the icon is in storage it renders synchronously on that
re-render; if not, `loadIcons()` fetches from api.iconify.design and re-renders whenever the
response lands. Calendar/DatePicker nav chevrons, Rating's stars, Stepper's indicators and
NumberField's ±buttons are all `radix-icons:*` — 30 distinct names across the story tree
(grepped). A reference PNG taken before the fetch resolves has no icons; one taken after does;
nothing tells you which you got. `vitest.visual.setup.ts` preloads `@iconify-json/radix-icons`
(devDependency, 1.2.6) with `addCollection` and points the API provider at `127.0.0.1:9`, and the
sheets assert `svg.iconify--radix-icons` counts. Measured: all icon sheets render identically on
consecutive runs with no network request made.

**A calendar with no value opens on today — pin `Date`, and only `Date`.** `CalendarChromatic`'s
"Empty default"/"Disabled" and `RangeCalendarChromatic`'s likewise have no value or placeholder,
so their month is `today()`; `DateRangeFieldChromatic` builds a placeholder from
`now(getLocalTimeZone())`. `vi.useFakeTimers({ toFake: ['Date'], now, shouldAdvanceTime: true })`
fixes the date without freezing rAF/`performance` (the full default set starves floating-ui and
the RO→CSS-var pipeline, see the fake-timers entries), and `expect.poll`/Playwright keep real
time. Measured: with `PINNED_TODAY` = 2024-02-14T12:00Z the empty calendars heading reads
`February 2024` and every February grid dots the 14th, on consecutive runs. Pick noon UTC so every
zone from UTC−11 to UTC+11 agrees on the date; the *hour* still follows the host zone, which is
why the one zoned placeholder is masked as well.

**The two-column sheet is narrower than Histoire's `width: '50%'` grid.** A 760px sheet gives a
cell ~356px; Histoire's 50% is whatever half the playground is, usually far more. Measured
before `columns: 1` existed: the `DateRangeField` fields ran past the sheet edge (`12 : 0`
visible, the rest gone) and the "Locale timezone" mask covered the frame but not the overflow;
`StepperChromatic`'s five `basis-1/5` steps wrapped so "Checkout" was drawn over "Address". Both
are layout facts about a too-narrow container, not component bugs, and both vanished at one
column. When a story's variant is a wide control, pass `columns: 1` and look at the PNG.

**An open Accordion/Collapsible region has no `data-state` at initial mount, and the closed
"State attributes" boxes are 24px tall on purpose.** `CollapsibleContent.vue:110` binds
`data-state` to `undefined` while `skipAnimation` holds, so at first render the open region has
no `data-state` at all while closed ones carry `data-state="closed"` + `hidden`. Discriminate on
`hidden`, not on `data-state="open"`. And `AccordionChromatic`'s scoped `.content-attr { display:
block }` overrides the UA `hidden` rule, so its closed regions paint as 2px-bordered, 10px-padded
empty boxes — the story's way of showing the closed-state border colour, not a leak.

**…and every Accordion trigger has `aria-controls=""` until something re-renders it.** The
Histoire sheet's one real bug (`#aria-controls-empty-at-rest`): `CollapsibleRoot` hands the
trigger a plain non-reactive `contentId: ''`, `CollapsibleContent` fills it with `||= useId()` on
*its* mount, and the trigger never re-reads it. Probe: four triggers `["", "", "", ""]` at rest
while the four regions already have ids; one click on any trigger repopulates all four. Valid
ARIA (an empty idref list), so axe is green; no functional test in either runner asserts
`aria-controls` on Accordion or Collapsible. Quarantined with `it.fails` in
`Accordion.visual.browser.test.ts`. **Not a browser-mode win** — jsdom renders the same empty
attribute (measured, same fixture, VTU `mount`); it was found because the sheet workflow inspects
the at-rest state *before* the click that repairs it, and asserts the relations a PNG cannot show.
Upstream knew: maintainer PR #2522 (the `ref` fix) was closed unmerged when issue #2521's VoiceOver
symptom turned out to be user settings.

**An element screenshot of a sheet taller than the tester iframe is silently clipped — and the
PNG does not look clipped.** Playwright can expand the outer page for an element capture, but it
cannot paint iframe content below the iframe's own box. The result is a reference with the
element's full height and **pure white below the fold** — no error, no warning, and the first
run "creates" it as the baseline. Measured on the Histoire demo sheets at the original 900×1000
viewport: ColorArea (1368px), ColorSlider (1624px), NavigationMenu (1451px) and three ScrollArea
sheets (1224px) all came back blank from y≈1000 down; the 985px Slider sheet was the tallest to
survive. Two fixes, both applied: `VIEWPORT_HEIGHT = 2000` for the instance **and** the
Playwright `contextOptions` (height does not change the 760px sheet's layout — all 8 existing
references stayed pixel-identical with no `--update`), and `assertSheetFitsViewport()` in the
helper, which throws with the sheet's bottom edge and the viewport height before any capture.
**Review the first PNG of every new sheet by eye, bottom half included.**

**In Vitest 4.1.10, an instance viewport alone can still produce a scaled element screenshot.**
With browser UI disabled, the Playwright provider does not copy `browser.instances[].viewport` to
the outer browser context (`browser-playwright/src/playwright.ts`, the commented-out assignment in
`createContext`). The orchestrator then scales the 900×1000 tester iframe to fit Playwright's
smaller default page. Measured on the `AspectRatio` pilot: a declared 760px story became a 548px
PNG. Give `playwright()` the same `contextOptions.viewport`; the reference becomes the expected
760×974 with no CSS transform/downsampling. Pin the complete Playwright container tag in CI, keep
its Linux baseline beside the local platform baseline, and allow automated updates only from an
explicit non-default branch dispatch.

**…and the same scaling silently misplaced every raw `page.mouse` command in the default `browser`
project, for the whole migration.** The functional project declares no viewport, so the tester
iframe is 414×896 CSS px inside Playwright's 1280×720 default page and the orchestrator scales it to
333×720 (measured from inside the test: `window.frameElement.getBoundingClientRect()` — the frame is
same-origin and readable — width 332.68, scale 720/896 = 0.8036). Locator actions compensate; the
custom `mouseDown/mouseMove/mousePress/mouseUp` commands add raw iframe-CSS offsets to
`iframe.owner().boundingBox()` and do not: **`mouseDown(100, 200)` fired `pointerdown` at client
(124, 249)**, 1.244× the request. Slider's `rect.left + 10` was really +12, its +50 really +62; all
four files using the commands (Slider, Rating, ScrollArea, useIsUsingKeyboard) passed because their
assertions tolerate it. Fixed by giving the `browser` and `cross-browser` projects
`contextOptions.viewport: { width: 414, height: 896 }` — the same lever as the visual config — after
which the probe lands at exactly (100, 200) and the suite is 97/97 green with one honest casualty:
Rating's "reset the preview on mouse leave" left to (390, 5), which is *inside* the 414×32
`RatingRoot` block (`elementFromPoint(390, 5)` is the radiogroup; the reset is on its `mouseleave`,
`RatingRoot.vue:116`); it only passed because the scaled pointer left the iframe altogether
(`elementFromPoint(485, 6)` → `null`). Now (390, 200), on bare body. Rule: **any page-level
coordinate computed from iframe CSS px needs the offset *and* the scale**, and the cheap way to never
need the scale is to make the outer page the size of the instance
(`browser-mode#scaled-iframe-page-coordinates`, `Rating/Rating.test.ts#leave-point-was-inside-the-root`).

**Generic component props need both an exact-key check and a test-specific type-check.** Vue's
component props are mostly optional, and a variant produced by `Array.map` is no longer a fresh
object literal. A plain `ComponentProps<C>` constraint therefore accepted `{ ratioo: 1 }` through
structural assignment. The since-removed hand-built `defineVisualStory` helper intersected each
inferred props object with the real component props and made every extra key `never`
(mutation-verified: `ratio` → `ratioo` failed `type-check:visual`). Recorded because the lesson
outlives the helper: a Histoire sheet sidesteps it only because the `*.story.vue` is itself a
type-checked SFC — a typo there is `vue-tsc`'s problem, and `tsconfig.visual.json` still includes
the visual test call sites so the test bodies are checked too.

**A headless scrollbar has no intrinsic thickness — geometry stubs can be silent fixture
authors.** Unstyled, ScrollArea's bars measure 0×200/200×0 (probed), so the corner that sizes
itself from them can never render. jsdom's prototype `offsetWidth/Height = 10` didn't just
compensate for missing layout, it invisibly *designed* a 10px scrollbar nobody wrote. The port
declares the same 10px as real CSS on the fixture — the zero-size family again, but the lesson is
sharper: when deleting a geometry stub, ask what the numbers were standing in for; some of them
were the fixture.

**`el.scrollTop = 40` is a real scroll in Chromium.** The browser scrolls the overflow and fires
the scroll event itself, asynchronously on a rendering frame — delete the hand-dispatched
`trigger('scroll')` along with the property stub, and let a polling assertion absorb the frame
delay. The port gains the real scroll-handler path (`prevScrollPos` tracking) jsdom's synthetic
event skipped.

**Portalled content is NOT invisible to `screen` — `render`'s `getBy*` helpers are document-scoped.**
*(This entry previously claimed the opposite, and the wrong version is why `AlertDialog`'s port
carries a comment saying `screen` "would find nothing". It does find it.)* From source,
`vitest-browser-vue@2.1.0` `dist/pure-epEwB8Ps.js`:

```js
20: const baseElement = customBaseElement || customContainer || document.body
21: const container   = customContainer || baseElement.appendChild(document.createElement('div'))
34: locator: page.elementLocator(container),
45: ...getElementLocatorSelectors(baseElement)
```

The destructured helpers bind to **`baseElement`, which defaults to `document.body`**. So
`screen.getByRole(…)` reaches teleported content, and returns the *same node* `page.getByRole(…)`
does. What is container-scoped is **`screen.container` and `screen.locator`**. Measured against the
open `_AlertDialog.vue` fixture — content's `parentElement` is `BODY`, `container.contains(content)`
is `false`, and:

| root | dialog open |
|---|---|
| `screen.getByRole('alertdialog')` | **1** (same node as `page`) |
| `page.getByRole('alertdialog')` | 1 |
| `screen.locator.getByRole('alertdialog')` | **0** |

`page.getBy*` still works and completed ports using it are correct — do not "fix" them. Two real
consequences of the true rule, though, and the second is the hazard:

- Pass `container:` explicitly and `baseElement` becomes that container, at which point the helpers
  *are* container-scoped. That is probably how the wrong rule got written.
- Because the helpers are document-scoped, **`screen.getBy*` also sees other renders.** Measured: with
  two `render()` calls in one test, the first screen's `getByText('bravo')` matches the *second*
  component. Pairs with the two-renders-do-not-unmount entry below.

**jsdom's zero layout fakes a full-viewport scrollbar.** `window.innerWidth -
document.documentElement.clientWidth` is the scrollbar-width idiom, and jsdom reports
`clientWidth === 0`, so it evaluates to the **entire viewport width**. Measured:
`useBodyScrollLock.ts:60` computes a **1024px phantom scrollbar** under jsdom and every modal open
sets `padding-right: 1024px`. Chromium gives 414−414=0 and correctly skips the branch. No test in
either suite asserts the value, so nobody noticed. `useBodyScrollLock` sits on every modal path, so
expect this across T3.

**A LOST coverage line can mean the port is *cleaner*.** The mirror of the `#auto-unmount` rule.
jsdom coverage of module-level stacks and registries can come from **test-to-test bleed** when
teardown is deferred — `FocusScope.vue`'s `focusScopesStack.remove` runs in a `setTimeout(…, 0)`,
so its `pause()`/`resume()` lines are covered when jsdom runs two tests and not when it runs one.
Bisect a 1-test run against a 2-test run before accepting that the port lost something real.

**…and the bleed has a second, bigger form: zombie *document listeners*.** The jsdom originals
never unmount, and `document.body.innerHTML = ''` removes elements but not document-level
listeners — so every "outside press" and "focus outside" handler from every previously-opened
overlay stays live for the rest of the file, attached to detached content. In `Select`, the
**entire outside-press dismiss path** (`DismissableLayer.vue:118-128` plus its `utils.ts` support)
was covered only this way: a 2-test isolated run covers none of it, the full describe covers all
of it. The kicker is *why* the current instance never handles its own events: the listener
registration is deferred by `setTimeout(0)` (`utils.ts:126`), and one jsdom test's hook chain is
microtask-only, so **the listener only ever attaches between tests** — on instances that are
already zombies. jsdom "covering" a line can mean a dead component processed a live test's event.

**`browser.trace` is a single-file reproduction tool, not a suite mode.** Vitest 4.1 records
Playwright traces (`--browser.trace=on|retain-on-failure|…`, `docs/guide/browser/trace-view.md`), with
`page.mark()` / `locator.mark()` as timeline markers and a zip per test under `__traces__` (now
gitignored). Measured on the green browser project, back to back on one machine: baseline **24.3s**;
`retain-on-failure` **69.4s (2.85×) with 13–15 *new* failures in 12 files** across two runs
(TimeField, Calendar, HoverCard, Menu, ScrollArea, Accordion, the Avatar snapshot, axe audits — the
timing-shaped tests) plus a Playwright `tracing.stopChunk: file data stream has unexpected number of
bytes`; with `--no-file-parallelism` **359.6s and still 5 failures**. `retain-on-failure` still starts
and stops a chunk for every test (~210ms each) and only deletes the passing zips afterwards, so the
cost and the interference are paid regardless. Turn it on for one file when a failure needs a
timeline; never in CI or the default run (`browser-mode#trace-cost`, `PERFORMANCE.md` §8).

**A failing retrying matcher inherits the *test* timeout — which browser mode defaults to 15s.**
`expect.element(…).toHaveFocus()` going red took **15009ms** against the jsdom equivalent's 8ms;
a failing `expect.element(…).not.toHaveAttribute` in `Tabs` cost **14990ms** against 7ms. *(This
entry previously concluded "the ~15s figure is the matcher's timeout". It is not — `expect.poll`'s
own default is 1000ms.)* From source: `processTimeoutOptions`
(`browser/src/client/tester/tester-utils.ts:193-223`) hands a locator action or an `expect.element`
**the remaining test timeout minus 100ms**, unless an explicit `timeout` is passed or
`browser.providerOptions.actionTimeout` is set — and `testTimeout ??= browser.enabled ? 15_000 :
5_000` (`node/config/resolveConfig.ts:935`).

**So it is fixable, and the config now fixes it:** `playwright({ actionTimeout: 2000 })` makes that
function return early, capping a failing action at 2s and letting a failing `expect.element` fall
back to `expect.poll`'s 1000ms (measured 14918ms → 1025ms, with the green suite unchanged). The
suite is green at 1000ms, 1 file fails at 500 and 12 at 300, so 2000 is ~2-4× headroom over the
slowest legitimate wait. Full ladder and the other six levers tried — `isolate: false` (breaks 400+
tests), `maxWorkers`, viewport, frame-rate launch flags — in `PERFORMANCE.md` §8.

**`checkVisibility()` is not an oracle for "hidden".** It returns **`true`** for a correctly
visually-hidden element — Chromium ignores `clip-path` and 1px geometry. Use
`getBoundingClientRect()` plus `document.elementFromPoint()`; a properly hidden element measures
1×1 at (-2,-2) and hit-tests to `null`.

**`includeHidden` changes accessible-name computation, not just the visibility filter.** A name
sourced from an `aria-hidden` subtree matches *with* the option and not without — so
`getByRole('button', { name: 'Save' })` returning 0 and the `includeHidden` variant returning 1 is
a meaningful signal about the a11y tree, not a query quirk.

**`console.log` from a browser test does not reach the terminal in this config** — but `warn` and
`error` do; see the forwarding entry above, measured in `Tabs`. Do not debug by failing an assertion
to read the diff. `await expect(str).toMatchFileSnapshot('./out.txt')` writes probe output to disk
through the server and works fine in browser mode.

**Vue writes DOM *properties*, not attributes, whenever `key in el` — and jsdom and Chromium
disagree about which IDL setters reflect back.** This is the most systematic T2 hazard found so
far, because it makes a whole class of jsdom assertion an assertion about jsdom. `shouldSetAsProp`
(`@vue/runtime-dom`, `patchProp`) ends in `return key in el`, and `'nonce' in HTMLStyleElement` is
true in both environments, so Vue assigns `el.nonce = …` and never calls `setAttribute`. Then:

| | `getAttribute('nonce')` | `hasAttribute` | `.nonce` |
|---|---|---|---|
| jsdom | `'abc123'` | `true` | `'abc123'` |
| Chromium | `null` | **`false`** | `'abc123'` |

jsdom's `nonce` IDL setter reflects into the content attribute; Chromium's writes only the internal
slot. So `Viewport.test.ts`'s `expect(styleEl.attributes('nonce')).toBe('abc123')` — and its comment
claiming "jsdom exposes the attribute reliably" — is a jsdom implementation detail dressed as
platform behaviour. Quarantined as `Viewport/Viewport.test.ts#nonce-attribute`.

**The sweep this demanded has been done, and the hazard is one attribute, not a class.** All 421
`.attributes('…')` assertions in the 97 originals were counted (41 distinct names), the rule
confirmed from source — `shouldSetAsProp` ends in `return key in el` against the **exact lowercase
key** (`@vue/runtime-dom@3.5.17/dist/runtime-dom.cjs.js:763`), then `patchDOMProp` (L564) assigns
`el[key] = value` — and every plausibly-IDL name probed in both environments:

| key | prop path (jsdom/chromium) | jsdom | chromium |
|---|---|---|---|
| `disabled`, `required` | true/true | `''` | `''` |
| `type`, `dir`, `placeholder`, `id`, `style` | true/true | value | **identical** |
| `role` | **false/true** | n/a — `setAttribute` | `presentation` |
| `nonce` | true/true | `abc123` | **`null`** ← the only test-visible divergence |
| `tabindex`, `readonly`, `inputmode`, `aria-*`, `data-*`, `class` | false/false | n/a — `setAttribute` | n/a |

**Only `nonce` diverges observably.** The blast radius stays small for a mechanical reason worth
remembering: `key in el` needs the *exact* attribute spelling, and the IDL names are `tabIndex`,
`readOnly`, `inputMode`, `ariaLabel`, `ariaValueNow` — none match the hyphenated or lowercase
attribute, so they all take `setAttribute`. That exempts every `aria-*` (~150 assertions) and every
`data-*` (`data-state` alone is 92). **So do not treat `attributes('x')` as a review flag.** The
diagnostic rule still stands if one *does* fail in Chromium: read `el.x` before concluding the port
is broken, and quarantine rather than switching the assertion to the property.

*One nuance that outlives the sweep:* `role` shows **`key in el` is itself environment-dependent** —
`'role' in div` is `false` under jsdom 20 and `true` in Chromium (ARIA reflection, `Element.role`).
Vue therefore takes *different code paths* in the two environments for the same binding. Invisible
here only because Chromium's `role` setter reflects.

*This was diagnosed against a wrong prediction, recorded so nobody re-derives it:* it is **not** the
spec's nonce hiding. Hiding requires a **header-delivered** CSP and *empties* the attribute while
leaving it present — so "attribute absent entirely" is never nonce hiding. Verified the consumer
impact separately: under a real `style-src 'nonce-…'` CSP the style still applies, because Vue
patches props before insertion, so this is a test artifact and not a reka bug.

**A manual `unmount()` leaks its container.** `cleanup()` removes a container only for a wrapper it
unmounts itself, so a test that calls `unmount()` explicitly leaves an empty `div` in `<body>` for
the rest of the file. Harmless if your assertions are container-scoped; **fatal if they query the
whole document.** Which is why the `document.body.innerHTML = ''` habit is *not* always deletable —
`FocusGuards` counts `[data-reka-focus-guard]` document-wide, and deleting its reset turns
`toBe(2)` into a pass-for-the-wrong-reason. Keeping it is safe: the tester iframe's `<body>` holds
nothing but render containers, and `vitest-browser-vue` registers `beforeEach(cleanup)` on the file
root suite while your reset sits inside a `describe`, so parent-first hook order runs `cleanup()`
first and it never has its DOM yanked. All measured.

**jsdom has no *native* sequential focus navigation — but `userEvent.tab()` polyfills it.** A raw
Tab keydown moves nothing there; `document.activeElement` is unchanged. So a test that fires
`trigger('keydown', { key: 'Tab' })` never tested tab order and cannot be ported — only rewritten,
which the verbatim-name rule forbids. `FocusGuards` is that case: its guards exist to catch focus
escaping to browser chrome and neither suite ever presses Tab. In Chromium, Tab from the last inner
button lands on the trailing guard and a second Tab leaves to `BODY`.

**But `@testing-library/user-event` ships its own tab-order implementation** —
`dist/esm/utils/focus/getTabDestination.js` — so an original calling `await userEvent.tab()` *does*
exercise tab order and ports one-for-one. `RovingFocus` is that case (its original tabs at L41, L43,
L91, L122) and the port is mechanical. Read the qualifier carefully in both directions: a passing
jsdom `userEvent.tab()` test proves **user-event's model** of tab order, not the browser's. What
makes `RovingFocus` interesting is that the port shows the two agree at every step — BODY → the
group's single tab stop → out to BODY — which is a stronger claim than either environment alone.
**So the rule is: a tab-order test is unportable only if the original had no way to move focus at
all.** Check *how* it moves focus before concluding anything.

*Unverified, worth knowing:* vitest's `userEvent.tab()` is `page.keyboard.press('Tab')` at **page**
level with no `focusIframe()` step, unlike `userEvent.keyboard`, which focuses the tester iframe
first. It caused no trouble in `RovingFocus`; it is the first thing to suspect if a ported tab test
sends focus somewhere impossible.

**Zero-size blocks clicking, not tabbing.** Refining the empty-`<label>` gotcha: the focus guards
are exactly `0x0` and Chromium tabs to them fine. Actionability checks are a *click* concern.

**Fragment-root components put every root as a direct child of `screen.container`.** `Viewport`
yields `['DIV','STYLE']`, so `container.firstElementChild` is not the whole component — a real
consideration when choosing what to hand to `axe`.

**Two `render()` calls in one test do not unmount each other.** Cleanup is registered as a
`beforeEach`, not between renders, so both containers coexist for the rest of the test and are
removed before the next one. Measured: `document.body.children.length === 2` mid-test with both
elements connected, `0` at the start of the next test. A jsdom original that mounts twice inside
one `it` (`Separator` does) ports literally, with no restructuring.

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
*Refinement from the cross-browser run:* "never real" is the operative phrase. **The real mouse is
pointer 1 in Chromium and WebKit and pointer 0 in Firefox** (measured on a real hover), so once
anything has moved the mouse in the page, a synthetic `pointerId: 1` *is* a real pointer on two
engines and the capture call silently succeeds. `ColorArea`'s "thumb gains focus when dragging
starts" passes on Chromium and WebKit by that coincidence and fails on Firefox with an unhandled
`NotFoundError` (`cross-browser#firefox-mouse-pointerid-0`). A test that passes because of which
number an engine gives its mouse is still a test of a synthetic event.

**`cdp()` makes three "synthetic-only" things real — IME composition, touch, and a second opinion on
the ARIA tree.** `import { cdp } from 'vitest/browser'` returns the page's Playwright `CDPSession`
(Chromium only; gated by `browser.api.allowWrite` / `allowExec`, both default `true` when the API
host is localhost — `docs/config/browser/api.md`). All three probed green in the `browser` project:

- **IME.** On a focused `<input>`, `Input.imeSetComposition({ text: 'x', selectionStart: 1,
  selectionEnd: 1 })`, again with `'xiang'`, then `Input.insertText({ text: '想' })` produced
  `compositionstart → compositionupdate:x → beforeinput/input (isComposing: true) → … →
  compositionupdate:想 → beforeinput/input → compositionend:想`, with `value` `xiang` mid-composition
  and `想` after commit. The 37 hand-built `CompositionEvent`s in the ports (DropdownMenuFilter 18,
  Combobox 17, Autocomplete, TimeField, ColorField, NumberField) were written under "Playwright has
  no IME"; on Chromium that is no longer the only faithful gesture (`browser-mode#cdp-real-ime`).
- **Touch.** `Input.dispatchTouchEvent({ type: 'touchStart', touchPoints: [{ x, y }] })` →
  `touchMove` → `touchEnd` delivered real `pointerdown/move/up` with **`pointerType: 'touch'`,
  `pointerId: 2`** plus `touchstart/move/end`, without `hasTouch` (`navigator.maxTouchPoints` stayed
  0). Coordinates are page-level — use `window.frameElement.getBoundingClientRect()` for offset and
  scale, or add a `touchSwipe` command beside `mouseDown`. Candidates: `Drawer.snap`,
  `useSwipeDismiss` (synthetic `pointerType: 'mouse'` drags), HoverCard `enableTouch`
  (`browser-mode#cdp-real-touch`).
- **Chromium's own AX tree.** `Page.getFrameTree` → `childFrames[0].frame.id` is the tester iframe;
  `Accessibility.getFullAXTree({ frameId })` returns the engine's nodes. Probe: a group with a dangling
  `aria-labelledby` came back `name=""`, its valid sibling `name="Fruits"`. That is the engine-side
  oracle the ivya-backed family lacks (see the `ivya` entry below) — the census findings can be
  cross-checked against what Chromium actually exposes (`browser-mode#cdp-chromium-ax-tree`).

Two caveats. `cdp()` is `undefined` under Firefox/WebKit, so anything using it in a shared file needs
`it.skipIf(server.browser !== 'chromium')` or the cross-browser run dies at the call. And none of
this is wired into a port yet — the probes were throwaway files; the entries record what was
measured, not what has landed.

**Tests run inside an iframe.** So raw `page.mouse` and `cdp()` take *page*-level coordinates
and you would have to offset by the iframe rect yourself — **and scale by it**, unless the outer
page is exactly the instance viewport (see the scaled-screenshot gotcha and its mouse-command
sibling above; both projects now pin `contextOptions.viewport`). From inside a test,
`window.frameElement.getBoundingClientRect()` gives the rendered box, and `width / window.innerWidth`
the scale. Prefer locator methods. Custom commands (`docs/api/browser/commands.md`) are the escape
hatch when you genuinely need `page.mouse`.

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
(`toHaveBeenCalledTimes(1)`, then `(2)`) port unchanged — **but do not leave them that way.**

**A cumulative mock count is an order-coupled test wearing an honest name's clothes.** The eight
form files inherited the original's ladder: the first block submits and asserts `times(1)`, the
sibling block submits *once more* and asserts `times(2)` + `mock.results[1]` — passing only
because a sibling ran first. Both blocks are named `'should trigger submit once'`, and in seven of
them that name was false. Measured by enabling `clearMocks: true` (Vitest 5's default) on 4.1.10:
**7 files fail, not 8** — `Checkbox` survives because its hook performs both submits itself.
Fixed by clearing the shared spy in the form block's `beforeEach` and having each test assert its
own `times(1)` + `results[0]`; the assertion count is unchanged, so `port:parity` stays clean, and
the test names became true. `Checkbox/Checkbox.browser.test.ts:231` was the in-repo precedent.

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

**And it is not only `mousedown` handlers — a real click also *focuses*.** So any
`getActiveElement() !== document.body` guard flips in the browser and never under jsdom. Measured:
`activeElement` is `BODY` both before and after `HTMLElement.click()` in jsdom, so
`DialogContentImpl.vue:63` (which records the trigger element for focus restoration) is unreachable
there. That one is a genuine environment win — `mount()` + `unmount()` does not reproduce it.

Check the branch map before celebrating, though. That same handler's `if (event.detail > 1)` is
`[0,2]` — never taken, because nothing in either suite double-clicks. The line went green; the
behaviour it guards is still tested by nobody. **A covered line is not a tested behaviour.**

**The CSS shim can *cause* zero-size, not just fail to prevent it.** Tailwind preflight zeroes
`button { padding }` and `* { border-width }`, so a contentless `<button>` in a fixture measures
**0×0** and cannot be clicked — `force: true` does not help either. Proven cheaply by rendering the
identical empty `<button>` inside a **shadow root**, which preflight cannot reach: 16×6 there, 0×0
in the light DOM. So when a port hangs on a click, the shim is a suspect, not just a victim.

**`toMatchFileSnapshot` cannot be called from `afterAll`** — "cannot be used without test context".
Since it is the way to get probe output out of a browser test, the dump has to live in a trailing
`it('dump')`.

**A zero-size element cannot be clicked, and plenty of them are zero-size.** An empty `<label>`
measures `0x18` in Chromium — zero *width* — so `locator.click()` retries and times out. jsdom's
`.click()` does not care, because there is no layout to consult. This is the CSS-shim failure in
miniature and it does not need Tailwind to bite: any element whose content is empty is a
candidate. If a port hangs on a click, measure the target with `getBoundingClientRect()` before
assuming the locator is wrong. Giving the element real content is a legitimate fix — it is a
deviation from the original body, so it costs you a `FINDINGS.tsv` row.

**Expect this on most button-like T2 components — it is the default shape of a headless suite.**
`Switch` and `Toggle` both mount the primitive with **no children**, because a headless library's
tests have no reason to pass a slot, and both measured exactly 0×0 under the Tailwind shim. Both
fixed it the same way: a `beforeAll` `<style>` giving the control a box, removed in `afterAll`.
Budget for it rather than re-diagnosing it per file.

**Playwright will not click a *disabled* element, and `force: true` is the faithful gesture.**
Actionability includes "enabled", so a plain `.click()` on a disabled control burns the full
timeout (measured on `Toggle`: 1503ms to failure against 6ms forced). `force: true` skips the
**wait**, not the gesture — Chromium still delivers a real `pointerdown` and then suppresses
`mousedown`/`mouseup`/`click` itself, which is exactly the platform behaviour such a test is about.

The jsdom side of these tests was never a click at all: **VTU's `DOMWrapper.trigger` short-circuits
on `isDisabled()`** (`vue-test-utils.esm-bundler.mjs:7195`) for BUTTON/INPUT/SELECT/TEXTAREA, so
"clicking a disabled X does nothing" asserts *VTU's own guard* rather than the platform's. Another
member of the family the `nonce` case belongs to — an assertion about the harness wearing the
costume of an assertion about the browser. Translation-table row: `el.trigger('click')` on a
disabled element → `loc.click({ force: true })`.

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

**axe audits a *detached copy* under jsdom and the *live element* in browser mode — all 62 axe
files.** `vitest-axe`'s `mount()` branches on `document.body.contains(html)`; VTU's `mount()`
leaves the component detached, so every jsdom axe test in this repo takes the fallback branch —
axe never sees the live component, it sees a copy re-parsed from `outerHTML` and pasted into
`document.body`, with the audit *context* being `document.body` rather than the component.
`vitest-browser-vue`'s `render` attaches, so ports take the first branch. Verified the local shim
reproduces the published `dist/index.js` logic, so this is real and not a shim artifact.
Consequence: **a ported axe test legitimately reports a different number of passing rules than
its original**, in both directions, and that is not a weakening. `Separator` measured 6 jsdom
passes vs 5 in Chromium, the extra being `aria-hidden-body` — a rule about `<body aria-hidden>`,
applicable only because jsdom accidentally widened the context.

**Census by node count, not by bucket.** An earlier version of this entry said `color-contrast`
lands in `incomplete` under jsdom. That is too specific to be safe: `AlertDialog` measured the same
rule landing in **`incomplete` with the dialog closed and `inapplicable` with it open, in the same
file**. The reliable test is not which bucket a rule is in — it is **whether its entry has any
nodes**. A zero-node entry in either bucket means the rule did not run, and a census that reads
buckets alone will report "the rule ran" when nothing was examined.

**…and `incomplete` *with* nodes is a third failure mode: the rule ran and abstained — which
`toHaveNoViolations` treats as a pass.** Measured in `NavigationMenu`: the focus proxy
(`aria-hidden="true"` + `tabindex="0"`) is a straight `aria-hidden-focus` violation in Chromium,
but jsdom cannot determine focusability without layout, so axe files the same node under
`incomplete` — and the jsdom test has been green over a real WAI-ARIA violation the whole time.
When porting an axe test, diff the `incomplete` bucket between environments, not just violations.

**Do not over-generalise `Slider`'s vacuous axe test — it was vacuous for a specific reason.**
Measured across three more files: `Progress` (13 jsdom passes, 0 violations) and `Toolbar` (15)
are **not** vacuous, because `mount()` renders synchronously and nothing is `display: none`. The
`Slider` case needed an element hidden *at mount time*. What browser mode reliably adds is exactly
one rule — `color-contrast`, which jsdom structurally cannot run — and it is not a formality:
`Progress` came in at **4.85:1 against a 4.5:1 threshold**. Always probe rather than assume, in
whichever direction.

**…and even that one rule is conditional on the fixture having text.** `Toggle` mounts a
contentless `<button>`, so `color-contrast` is `inapplicable` **in Chromium too** and all three of
its axe tests gain literally nothing from the browser — jsdom's only difference is the
`aria-hidden-body` artifact from the detached-mount entry above, which is a jsdom bug, not a jsdom
win. Pairs with the zero-size entry: the same contentless-primitive shape that breaks clicking also
neuters the one rule browser mode was supposed to add. `Toggle` also runs its enabled and disabled
axe censuses to **byte-identical** results — i.e. the file pays for the same audit twice.

**A green axe test can still be unfailable.** `Separator`'s only test survives three mutations
that matter: misspelt role and bad `aria-orientation` are caught, but **deleting `role="separator"`
entirely yields zero violations *and* zero passes** — the component's whole contract can be removed
and the test stays green. Same shape in `Progress`: `aria-progressbar-name` passes only because
reka names the bar with its own *value* ("0%"), a name that describes nothing and changes as it
fills. axe green means "no violation found", never "the component is correct".

**Valid ARIA can still describe the wrong product state; use an ARIA snapshot for that contract.**
Measured in Chromium with the Tabs shape: Password content was visible while Account retained
`aria-selected="true"` and the panel referenced `account-tab` through `aria-labelledby`. axe-core
4.9.1 returned **zero component violations**; the browser consequently exposed Account as the
selected tab and Account as the panel's accessible name. Every attribute was legal, but their
combined meaning was wrong. `toMatchAriaInlineSnapshot` can assert the intended selected tab and
named panel together. Keep axe too: snapshots do not replace its rules, contrast, or hidden-focus
checks. *(The full measured example was written up in `VITEST-AXE-VS-ARIA-SNAPSHOTS.md`, which is
no longer in the tree — see the note two entries down. The summary here is the record.)*

**…but an ARIA snapshot only asserts the states it *lists*, so it cannot catch a state appearing
on the wrong node.** There is no `[selected=false]`, and `/children: equal` constrains child
count and order, not attributes. Measured on `Tabs`: four snapshot-only tests — including a
`/children: equal` tablist template — all stayed green while `TabsTrigger.vue` was mutated to
`:aria-selected="'true'"`, i.e. with *every* tab permanently selected. The oracle for the absence
half is the role **state filter**, which no ported file uses:
`expect(screen.getByRole('tab', { selected: true }).elements()).toHaveLength(1)` turns the same
mutation red. `getByRole` takes `selected`, `checked`, `expanded`, `pressed`, `level`, `disabled`
and `includeHidden` (`docs/api/browser/locators.md:105-212`). Rule: the snapshot proves the state
is on the right node, the filter proves it is on no other. Write both. *(A survey of the
accessibility API surface and five `*.improved.browser.test.ts` pilot files were cited here as
`IMPROVING-A11Y-TESTS.md`; neither exists on disk or in any branch — only
`Collapsible/Collapsible.aria-controls.browser.test.ts` survived whatever session wrote them. The
living examples of the pattern are now `src/a11y-census.browser.test.ts` and the six
`<Component>.aria.browser.test.ts` files; see [ARIA census and transition
tests](#aria-census-and-transition-tests).)*

**The whole browser-mode a11y family is backed by `ivya`, not by Chromium's AX tree.**
`toMatchAriaSnapshot` builds its tree with `generateAriaTree` from `ivya/aria`
(`packages/browser/src/client/tester/aria.ts`), `toHaveAccessibleName` calls
`getElementAccessibleName` from `ivya/utils`, and `getByRole` is the same engine — one
implementation across queries, matchers and snapshots, where the jsdom stack computes names with
`dom-accessibility-api` instead. Practical consequences: the tree is deterministic and carries no
font metrics (unlike the DOM snapshots in `ScrollArea`), and it is a *model* of what an AT would
be told, so it will not show Chromium's own repairs of broken relations — the divergence already
recorded for `combobox-stale-activedescendant`. The engine's own tree *is* reachable, though:
`cdp().send('Accessibility.getFullAXTree', { frameId })` for the tester frame (see the `cdp()` gotcha)
returned Chromium's nodes, naming a validly-labelled group `"Fruits"` and a dangling-`aria-labelledby`
group `""` — so "what would Chromium tell an AT" is a probe away, not a guess
(`browser-mode#cdp-chromium-ax-tree`).

**…and the tree carries no relations at all, so an ARIA snapshot cannot see a broken
`aria-controls`.** Read out of `@vitest/browser` `dist/expect-element.js` (bundled ivya): a tree
node has role, name, and the props `checked / disabled / expanded / level / pressed / selected /
active`, plus `/url` for links and `/placeholder` for textboxes. `aria-controls`, `-describedby`,
`-owns`, `-activedescendant` are not rendered. Measured in `Collapsible/Collapsible.aria-controls.browser.test.ts`: `toMatchAriaInlineSnapshot`
of the open fixture is byte-identical (`- button "Trigger" [expanded]` / `- text: Content`) with
`aria-controls=""` and with it filled after a click — so `#aria-controls-empty-at-rest` is
quarantined as an attribute assertion, and a green sibling test pins the snapshot's blindness
(if it goes red, the tree has started carrying relations). An ARIA snapshot does see the *effect*
of a relation that feeds the accessible name — `aria-labelledby` — because the name is computed;
it never sees the wiring itself. Pair the snapshot with a `toHaveAttribute` for each relation that
is the contract.

**…but it does see a relation that *fails to feed* a name, and that is the census's best catch.**
`SelectGroup`/`MenuGroup` render `aria-labelledby=<own id>` and their `Label` takes that id only
from a group context it is nested in; placed as a sibling — which `_Select.vue`, `_DropdownMenu.vue`
**and both docs demos** do — the label renders with no id, the reference dangles, and the tree
shows it on the first line: `- listbox: - text: Fruits - group: - option "Apple"`. Measured:
`aria-labelledby="reka-select-group-v-26"` resolves to no element; `getByRole('group', { name:
'Fruits' })` → 0; axe files the dangling idref under `incomplete`, so every axe test stays green.
The Combobox fixture nests its label and its tree reads `- group "Fruits": - text: Fruits …` — the
shape the other two should have. Same class, different wiring: `DateFieldRoot` gives its `id` to
the hidden `<input tabindex=-1>`, so `<Label for>` labels a node no user reaches and the tree is
`- text: Label` / `- group:` / `- spinbutton "month,": mm` — the segment's hardcoded `'month, '`
(`useDateField.ts:92`, trailing comma from the React-Aria convention of concatenating the field
label, which reka does not do) is the whole name; and `CalendarRoot` binds `fullCalendarLabel` as
`aria-label` on its role-less root div while `role="application"` is on the `<table>`
(`CalendarGrid.vue:23`, deliberate, #2502), so the tree is `- application: - rowgroup: …` — an
unnamed landmark, where `MonthPickerGrid` labels its application by the heading. **Reading rule for
a census tree:** a loose `- text:` immediately beside an unnamed `group:`/`application:`/control is
a label that reaches nothing. The five findings and four fixture bugs are in `FINDINGS.tsv` under
`a11y-census.browser.test.ts#census` and the `*.aria.browser.test.ts#…` keys.

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

**A quarantined test with multiple assertions needs an audit.** `it.fails` turns any thrown
assertion, hook error, or timeout into success for that test; assertions after the first failure
never run, and failures in siblings before it are indistinguishable. In Collapsible, one expected
`hidden` mismatch silently disabled two other contracts. Relocate independent assertions to a
shared hook that also runs for a non-quarantined sibling, or split them into an existing
non-quarantined test shape. Count assertions before applying `.fails`.

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

**A mounted overlay is not necessarily an open, auditable overlay.** Floating UI inserts content
before it has finished positioning it; reka's Popper wrapper deliberately starts at
`translate(0, -200%)` while measuring. An eager role count can therefore make an "open" axe test
pass over content that is still off-page and before mount autofocus settles. Synchronize on
independent public state (`aria-expanded`, visible content) and, when positioning matters, require
the wrapper to leave its measuring transform before auditing. Also re-evaluate inherited axe rule
exceptions: Popover's jsdom test disabled `aria-dialog-name` even though the live content is
labelled by its trigger, and Chromium passes that rule once the positioned state is awaited.

## Open questions

- **Performance — answered; the numbers and their method are in `PERFORMANCE.md`.** The whole
  suite costs **1.13×** jsdom wall clock (12.10s vs 10.75s), so **CI does not need sharding**. The
  cost is not per test — a trivial test is 0.03ms in both, `render()` 0.31ms vs `mount()` 0.22ms —
  it is per **real pointer action**: `locator.click()` is **26ms** against `el.click()`'s 0.03ms,
  and **18ms of that is Playwright's stability check waiting two animation frames** (measured
  16.65ms), which `click({ force: true })` skips at 8ms. Real-input call count predicts per-file
  slowdown at **r = 0.95**; 744 pointer actions are **46%** of the total delta; and the 28 files
  making no real input are **faster** in Chromium (mean −37ms), because Chromium's DOM is native and
  jsdom's is JavaScript. Two numbers still to respect: the inner loop is **~1.9×** (single-file cold
  start, ~0.6s of unamortized Chromium launch), and a **failing** retrying matcher costs **~15s**
  against jsdom's 8ms.
  What remains open is CI-hardware behaviour, headed runs, and whether the 1000ms locator timeout
  can be safely lowered — all marked `[unverified]` there. Multi-browser is answered: one engine per
  process, serial files, Firefox 87s / WebKit 81s for the corpus (see the cross-browser bullet above
  and `PERFORMANCE.md`).
- **Visual regression has 22 files, 25 sheets, one helper.** Every sheet is a
  `defineHistoireStory` render of an existing `*.story.vue`, through native `toMatchScreenshot`;
  the hand-built `defineVisualStory` sheets were removed by project-owner decision, and the
  references are intentionally outside the functional browser/coverage project. Every static
  Chromatic story in the tree now has a sheet; what remains uncovered is the interactive/overlay
  stories (Dialog, Popover, Combobox, Menu, Toast, Tooltip…) — open overlays and animations are
  not sheet material — and components with no story file (Popper). Only Darwin references exist
  until the branch-only Linux update workflow is dispatched. This does **not** reverse the
  general caution: references remain browser/platform-specific, and a headless library should
  screenshot geometry/state with minimal fixture CSS rather than consumer decoration. Darwin and
  Linux references are reviewed at 760×974; Linux comparison and branch-only updates run in the
  pinned Playwright 1.62.1 Noble container. Stability outside those owned environments remains
  `[unverified]`; expand only with the same fixed-image discipline.

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
