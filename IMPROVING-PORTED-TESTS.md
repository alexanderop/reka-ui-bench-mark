# Improving the ported tests with Vitest 4.1

The migration is complete: 97/97 files are off jsdom. This document is the
**post-migration improvement backlog**. The ports were written faithful-first —
verbatim names, translated gestures, jsdom-era habits preserved — and a survey
of all 90 `*.browser.test.ts` files found that **none of them uses a single
Vitest 4.1-era API**: no `userEvent.wheel`, no `locator.fill`, no ARIA
snapshots, no `toBeInViewport`, no `toHaveSelection`, no `copy`/`paste`, no
`tripleClick`.

That leaves two distinct kinds of improvement, catalogued below with evidence:

1. **Better ways to say what is already said** — replacing synthetic events and
   call-spies with real input and outcome assertions.
2. **Coverage that was structurally impossible under jsdom** and that the
   faithful ports did not reach for, because the originals could not contain it.

Everything marked *measured* was run in this repo's Chromium browser project on
the pinned Vitest 4.1.10. The worked example is
`packages/core/src/NumberField/NumberField.improved.browser.test.ts` —
14 tests, all passing in ~2s, sitting next to the untouched faithful port.

---

## The new elements, and what they actually do

Read the implementation before trusting the name — two of these are much
stronger than they sound, one is exactly as synthetic as what it replaces
elsewhere but not on our provider.

### `userEvent.wheel` / `locator.wheel()` — since 4.1.0

On the Playwright provider this is **not** a dispatched event. It is a real
hover (pointer moves onto the element) followed by `page.mouse.wheel(dx, dy)` —
trusted input, routed through Chromium hit-testing
(`vitest/packages/browser-playwright/src/commands/wheel.ts`; the synthetic
`dispatchEvent` fallback in `context.ts` is the *preview provider's* path, not
ours). Options: `{ delta: { x, y } }` or `{ direction }`, plus `times`.

Because the wheel is real, **guards that a synthetic dispatch could only fake
become testable**. Measured on NumberField: a wheel over a *hovered but
unfocused* input is correctly dropped by the `event.target !==
getActiveElement()` guard, and a mostly-horizontal trackpad delta
(`|deltaY| <= |deltaX|`) is correctly ignored — neither guard was covered by
either suite before.

### `toMatchAriaSnapshot` / `toMatchAriaInlineSnapshot` — since 4.1.4 (experimental)

Snapshots the **accessibility tree**, not the DOM: roles, accessible names,
values, states. Uses the normal snapshot workflow (`-u`, inline auto-fill on
first run). Measured on NumberField — one assertion produced:

```
- group:
  - text: Number Field
  - button "Decrease"
  - spinbutton "Number Field": "5"
  - button "Increase"
```

That single block proves the label association, the button names, and the
spinbutton value — things the ports assert through walls of individual
`toHaveAttribute('role'/'aria-*')` probes, when they assert them at all. Unlike
DOM snapshots it does not embed font metrics, so the `ScrollArea` cross-machine
caveat does not apply.

### `userEvent.copy` / `cut` / `paste` + `tripleClick` — real clipboard

`copy()`/`paste()` are implemented as **real modifier chords** —
`{Ctrl/Meta>}{c}{/...}` and `{v}` through the provider keyboard
(`vitest/packages/browser/src/client/tester/context.ts:133-141`). So a paste is
a genuine trusted `ClipboardEvent` with real `clipboardData`, produced by the
browser's own paste command. `tripleClick` is the selection gesture that feeds
`copy`.

**Measured, both probes green in headless Chromium**: `tripleClick` a source
input → `copy()` → focus a target → `paste()` lands `'test'` in a plain input,
and — the real prize — distributes `t/e/s/t` across the PinInput story
fixture's boxes through the component's actual paste handler.

*[unverified]* Clipboard state presumably persists across tests in a session,
like held modifiers do; clear or overwrite it per test rather than assuming.

### `locator.fill()`

Focuses, selects and inserts via a real `insertText` — which means the
component's **cancelable `beforeinput` fires**. Measured on NumberField:
`fill('abc')` is genuinely *rejected by the component's validate guard* (value
unchanged), `fill('42')` accepted. A `input.element.value = '...'` assignment
plus hand-dispatched `input` event — the pattern the ports use — runs none of
that code.

### `toBeInViewport` — since 4.0

Asserts the *outcome* of scrolling: the element intersects the viewport
(optionally with a `ratio`). The replacement for `scrollIntoView` prototype
spies — see the Listbox entry below for why the spy is weaker.

### `toHaveSelection`, `toHaveDisplayValue`

`toHaveSelection` asserts the selected **text** (works on inputs, textareas and
arbitrary text nodes); `toHaveDisplayValue` asserts the formatted string the
user sees, distinct from `aria-valuenow`. Both retrying.

### Trace view (config-level)

`browser: { trace: 'retain-on-failure' }` (Playwright provider only) writes
Playwright trace files to `__traces__` next to the test. Not a test-code
change; worth enabling when debugging a flaky port instead of sprinkling
`console.warn` — **for one file at a time.** Measured on the green browser
project: baseline 24.3s; `retain-on-failure` 69.4s with 13–15 *new*
failures in 12 files and a `tracing.stopChunk` error; serial, 359.6s and still
5 failures. It records a chunk per test whether or not it keeps the zip
(`FINDINGS.tsv` `browser-mode#trace-cost`; `__traces__` is gitignored).

---

## Catalog: better ways in existing ports

### PinInput + TagsInput — hand-built clipboard events → real clipboard

Both files carry the identical helper: construct a `DataTransfer`, dispatch a
synthetic `ClipboardEvent('paste')` at `document.activeElement`
(`PinInput/PinInput.browser.test.ts:32-40`,
`TagsInput/TagsInput.browser.test.ts:11-16`). Replace with the
`tripleClick → copy → paste` flow proven above. The upgrade is not cosmetic:
the synthetic event fabricates `clipboardData`; the real chord tests the
browser's own clipboard payload reaching the handler.

### Autocomplete, DropdownMenuFilter, PinInput — `.value =` assignments → `fill()`

- `Autocomplete.browser.test.ts` — ~15 sites of `input.element.value = '...'`
  plus dispatched `input` events.
- `DropdownMenuFilter.browser.test.ts` — same pattern (`input().value =`),
  19 `dispatchEvent` calls in the file.
- `PinInput.browser.test.ts:426,448,458,473` — direct box assignments.

Each of these skips `beforeinput` and any per-key handling. `fill()` runs the
real pipeline. **Exception, do not convert:** the IME describes in all three
files (`compositionstart` + value + `input` + `compositionend`) are correctly
synthetic — Playwright cannot drive a real IME — and say so in comments.

### Listbox (also Combobox, Slider) — `scrollIntoView` spies → outcome assertions

`Listbox.browser.test.ts:139,187` spies on
`HTMLElement.prototype.scrollIntoView` *in a real browser* and asserts
`toHaveBeenCalled()` / `not.toHaveBeenCalled()`. That observes the call, not
the outcome: a `block: 'nearest'` call that scrolls nothing would fail the
negative test for no user-visible reason, and a call that scrolls the wrong
container would pass the positive one. The browser can assert the truth:

- negatives ("mount highlight must not scroll the page"): assert
  `window.scrollY` stayed `0` and the page geometry is unmoved;
- positives ("entry focus scrolls the first item into view"):
  `await expect.element(item).toBeInViewport()`.

### Overlay families — attribute walls → ARIA snapshots

Menu, DropdownMenu, Select, Combobox and the date/time fields assert accessible
structure via long runs of `toHaveAttribute` probes. One
`toMatchAriaInlineSnapshot` per interesting state (closed / open /
item-highlighted) captures roles, names, `expanded` states and values together,
and fails loudly when any of it regresses. Start with one file (Menu is the
densest) and judge the diff-noise trade-off before sweeping.

### Editable — selection index → selected text

`Editable.browser.test.ts:97` asserts `inputElement.selectionStart === 0`; the
behavior under test is "the text is selected", which `toHaveSelection('…')`
states directly.

### DropdownMenu — `defaultPrevented` proxy → real Tab focus outcome

`DropdownMenu.browser.test.ts:72-78` dispatches a synthetic Tab and asserts
`event.defaultPrevented` — an implementation-detail proxy for the focus-trap
contract. A real `userEvent.tab()` can assert the contract itself: focus leaves
the non-modal menu; focus stays trapped in the modal one. jsdom could not move
focus on Tab at all; Chromium can.

### NumberField — done, see the worked example

`NumberField.improved.browser.test.ts` demonstrates the whole kit: semantic
`getByRole('spinbutton')` locators, retrying `expect.element` matchers,
`toHaveDisplayValue` vs `aria-valuenow`, real keyboard, `fill()` through the
`beforeinput` guard, real wheel with both guards, and the ARIA snapshot.

---

## Catalog: coverage that only exists now

### Select scroll buttons — zero coverage in both suites

`SelectScrollButtonImpl.vue` is real product code, and neither
`Select.test.ts` nor the port mentions it once — scroll buttons only render
when the listbox content overflows its container, and jsdom has no layout to
overflow. A browser test with a height-constrained viewport can render them,
hover them (they scroll while hovered), and assert options actually come into
view (`toBeInViewport`). **The single biggest untouched win found by the
survey.** Budget for the modal `pointer-events: none` and fake-timer/rAF
gotchas already recorded in AGENTS.md — Select is the file that discovered
them.

### useGraceArea — stubbed geometry + synthetic pointers → real ones

`shared/useGraceArea.browser.test.ts` stubs `getBoundingClientRect` on both
elements and dispatches synthetic `PointerEvent`s — a jsdom test running in
Chromium. The repo already owns the `mouseMove` custom command (iframe-rect
translation included). With two absolutely-positioned real elements at the same
coordinates the stubs fabricate, the grace-polygon logic can be driven by a
real pointer through real hit-testing. Construct-vs-compensate caveat: the
stubbed rects *construct* precise geometry, so the current file is defensible —
but real CSS constructs the same geometry and gains the real event path.

### NumberField — wheel guards and PageUp/PageDown

Already landed in the improved file: the unfocused-wheel guard, the
horizontal-delta guard, and the PageUp/PageDown ×10 multiplier
(`handleIncrease(10)`) — all covered by neither the jsdom original nor the
port.

---

## Correctly synthetic — do not "improve" these

- **IME composition guards** — TimeField (`:255-263`), ColorField
  (`dispatchComposingKeydown`), Autocomplete's composition describes,
  NumberField's IME describe. *Playwright* cannot drive an IME; the files say
  so in comments. **CDP can**, on Chromium: `cdp().send('Input.imeSetComposition',
  …)` + `Input.insertText` produced real `compositionstart/update/end` and
  `beforeinput`/`input` with `isComposing: true` (measured — AGENTS.md `cdp()`
  gotcha, `browser-mode#cdp-real-ime`). So these are *Chromium-improvable*,
  and the synthetic dispatch stays the faithful gesture only for the
  cross-browser run. Same for the touch swipes in `Drawer.snap`,
  `useSwipeDismiss` and HoverCard's `enableTouch`
  (`Input.dispatchTouchEvent`, `browser-mode#cdp-real-touch`).
- **Disabled-element keydown negatives** — ColorField (`:367-374`): a real
  keyboard cannot reach a disabled input, so the dispatch keeps the guard-path
  scenario observable instead of passing vacuously.
- **NavigationMenu's `pointerleave`** under fake timers — AGENTS.md records why
  real hover is impossible there (frozen rAF starves the viewport-height CSS
  var; content hit-tests to 0px).

---

## Housekeeping

**Invisible U+00A0 literals.** `Intl` separates currency code and amount with a
no-break space, and exactly 4 sites embed it as an invisible literal:
`NumberField.test.ts:225,270` and `NumberField.browser.test.ts:233,278`. The
tests pass only because of bytes no reviewer can see. When touched next,
rewrite as explicit `'EUR\u00A05.00'` escapes (the improved file already does).
Sweep note: BSD grep misses byte-pattern form — use `grep -rlP '\x{00A0}'`.

---

## Process notes for when the improvements land

- **The improved tests break `port:parity` by design** — new names, new
  assertions. Decide per file whether an improvement lands *in* the port
  (renaming costs findings under the verbatim-name rule) or as a sibling
  `*.improved.browser.test.ts` the way NumberField did. The include glob
  already picks both up.
- The AGENTS.md retrying-matcher rules still apply: never let `expect.element`
  retry a condition whose *timing* is the subject, and never pre-settle an
  assertion you are about to read synchronously.
- `userEvent.wheel` is for components that **listen** to wheel (NumberField,
  future carousel/zoom cases) — not for scrolling something into view; locator
  actions auto-scroll already.

## Suggested order

1. **PinInput / TagsInput clipboard** — proven, mechanical, deletes a
   fake-event helper per file.
2. **Select scroll buttons** — net-new coverage of untested product code.
3. **`fill()` sweeps** — Autocomplete, DropdownMenuFilter, PinInput.
4. **Listbox viewport assertions** — replace the scroll spies.
5. ~~**ARIA snapshots** — pilot on Menu, then judge the sweep.~~ **Piloted, on five components
   instead of one** — Tabs, Accordion, Checkbox, Select and Dialog now have sibling
   `*.improved.browser.test.ts` files covering the accessibility layer, and the pilot produced a
   product finding plus a design correction (a snapshot alone cannot catch a state on the *wrong*
   node; pair it with a `getByRole` state filter). Survey, measurements and the remaining
   candidates are in **`IMPROVING-A11Y-TESTS.md`**. *(Neither that file nor the five
   `*.improved.browser.test.ts` files exist in the tree or any branch any more; the pattern lives
   on in `src/a11y-census.browser.test.ts` and the six `<Component>.aria.browser.test.ts` files —
   see AGENTS.md "ARIA census and transition tests".)*
6. **Editable selection, DropdownMenu real Tab, useGraceArea real geometry** —
   smaller, independent.
7. **CDP-driven IME and touch** (Chromium only, `it.skipIf` for the other
   engines) — DropdownMenuFilter/Combobox composition describes first (35 of
   the 37 synthetic `CompositionEvent`s), then the Drawer swipes. Wrap the
   touch sequence as a `touchSwipe` custom command beside `mouseDown` so
   the page-coordinate offset/scale lives in one place.


---

## Looking ahead: Vitest 5

The Vitest 5 RC changes the *defaults* more than the APIs — exact-by-default
locators and a strict `toHaveTextContent` retire this repo's documented
substring-trap family, while `clearMocks: true` and async `render` force
sweeps of their own. The full survey, measured blast radius, and upgrade plan
live in **`IMPROVING-PORTED-TESTS-VITEST-5.md`**. Practical consequence for
this backlog: upgrade before the backlog gets large, so improved tests are
written against the v5 defaults once instead of audited twice.
