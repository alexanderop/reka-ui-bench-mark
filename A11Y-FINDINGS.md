# A11Y-FINDINGS.md — what the ARIA census found

Accessibility issues in reka-ui found by reading the **ARIA tree** (roles, computed names, active
states — what a screen reader is handed) of every story fixture in Chromium, via Vitest 4.1.10's
`toMatchAriaSnapshot`. Every one of these is **valid ARIA and axe-green**: no rule is broken, the
*meaning* is wrong. That is the layer axe cannot see and this census exists for.

How it was done: `packages/core/src/a11y-census.browser.test.ts` renders 65 fixtures at rest and
snapshots `document.body`; `packages/core/src/<Component>/<Component>.aria.browser.test.ts` snapshots
the open states and pins each finding as an `it.fails` with a single assertion, tagged `@finding`
with the `FINDINGS.tsv` key given below. The `it.fails` goes red the day the bug is fixed. Long-form
evidence is in `FINDINGS.tsv`; this file is the readable version.

Caveat on all of it: "what an AT is handed" is read from the accessible tree (ivya, Playwright's
engine — the same one behind `getByRole`), not from a screen reader. The tree facts are measured;
how NVDA or VoiceOver phrase them is inferred and marked so.

Nothing in non-test source was changed. Findings are reported, not patched.

---

## Product findings

### 1. `SelectLabel` / `DropdownMenuLabel` placed beside their group leave the group unnamed — and the docs show it that way

**Severity:** medium. Affects every consumer who copies the docs demo.
**Keys:** `Select/Select.aria.browser.test.ts#label-outside-group-dangling-labelledby`,
`DropdownMenu/DropdownMenu.aria.browser.test.ts#label-outside-radiogroup-dangling-labelledby`

What the tree shows, Select open (`_Select.vue`):

```
- listbox:
  - text: Fruits
  - group:
    - option "Apple"
    …
  - text: Vegetables
  - group:
    - option "Aubergine"
```

The label is loose text; both groups are unnamed. DropdownMenu is the same: `- text: People` /
`- group:` / `- menuitemradio "Pedro Duarte" [checked]`.

Why: `SelectGroup.vue:20-28` renders `aria-labelledby=<its own useId>`; `SelectLabel.vue:17-23`
takes that id **only from a group context it is nested inside** (`injectSelectGroupContext({ id: '' })`)
— placed as a sibling it renders no id at all. `MenuGroup.vue:20-28` / `MenuLabel.vue:15-21` are
identical. Measured: the first group's `aria-labelledby="reka-select-group-v-26"` resolves to **no
element** (`document.getElementById` → null); `getByRole('group', { name: 'Fruits', exact: true })` → 0.

The fixtures do this, and so do the docs:
`docs/components/demo/Select/tailwind/index.vue:50-53` and `:69-72`,
`docs/components/demo/DropdownMenu/tailwind/index.vue:301-304` all place `<…Label>` *before*
`<…Group>`. Radix's own demos nest the label inside the group. The Combobox fixture nests it and
its tree reads `- group "Fruits": - text: Fruits - option "Apple" …` — the correct shape.

Why axe misses it: a dangling idref lands in `incomplete`, which `toHaveNoViolations()` counts as
a pass.

Fix: nest the label inside the group in the docs and fixtures. Optionally harden the component:
a `Label` that renders with no group context could warn in dev, or the group could fall back to no
`aria-labelledby` instead of a dangling one.

### 2. DateField / TimeField: the field's label never reaches what the user lands on

**Severity:** medium-high. Applies to DateField, TimeField, DateRangeField, TimeRangeField and the
field half of DatePicker / DateRangePicker (same composable; census trees identical in shape).
**Key:** `DateField/DateField.aria.browser.test.ts#label-reaches-only-hidden-input`

What the tree shows (`_DateField.vue`, the documented `<Label for="date-field">` +
`<DateFieldRoot id="date-field">` pairing):

```
- text: Label
- group:
  - spinbutton "month,": mm
  - spinbutton "day,": dd
  - spinbutton "year,": yyyy
```

Why: `DateFieldRoot.vue:322` hands the `id` to the `VisuallyHidden` `<input type="date"
tabindex="-1">`, so `<label for>` labels an element no user reaches. The `role="group"`
(`DateFieldRoot.vue:307`) is unnamed — `getByRole('group', { name: 'Label' })` → 0. Each segment's
name is only its hardcoded `aria-label` from `shared/date/useDateField.ts` (`:70 'day,'`,
`:92 'month, '`, `:113 'year, '`, `:136 'hour, '`, `:160 'minute, '` — note the inconsistent
trailing space), with no `aria-labelledby` / `-describedby` back to the field —
`getByRole('spinbutton', { name: /Label/ })` → 0.

What an AT gets on Tab into the field *[inferred from the tree]*: "month, spinbutton, Empty" — no
field name anywhere. The trailing comma is the React Aria / melt-ui convention for a segment name
that is **concatenated with the field label** via `aria-labelledby` ("month, Birth date"); reka
kept the comma and dropped the concatenation.

Why nobody noticed: clicking the label *does* focus the first segment — the hidden input's
`@focus` forwards it — so every click-the-label test is green.

Fix: put `aria-labelledby=<label id>` on the group, and `aria-labelledby="<segment id> <label id>"`
(or `-describedby`) on each segment, the way the pattern this copies does. Also normalise the
`'day,'` spacing.

### 3. Calendar's `application` landmark is unnamed

**Severity:** medium. Calendar and RangeCalendar (`RangeCalendarRoot.vue:454`, same shape, not
separately tested).
**Key:** `Calendar/Calendar.aria.browser.test.ts#application-unnamed`

What the tree shows (`_Calendar.vue`):

```
- application:
  - rowgroup:
    - row "Sunday, July 28, 2024 …":
      - gridcell "Sunday, July 28, 2024":
        - button "Sunday, July 28, 2024": "28"
```

Why: `role="application"` is on the `<table>` (`CalendarGrid.vue:23` — deliberate, upstream
issue #2502, so NVDA leaves browse mode and arrow keys reach the grid), but the calendar's label
`fullCalendarLabel` is bound as `aria-label` on the **root `<div>`** (`CalendarRoot.vue:350`),
which has no role. Accessible-name computation ignores `aria-label` on a role-less div (ARIA 1.2
prohibits it there). Measured: `getByRole('application')` → exactly one element, the `TABLE`, with
`aria-label` and `aria-labelledby` both null; `getByRole('application', { name: /Event Date/ })` → 0.

The siblings got it right: `MonthPickerGrid.vue:24` sets `aria-labelledby=rootContext.headingId`
and its tree reads `- application "2026"`; YearPicker reads `- application "2020 - 2031"`.

Related, not a bug (`#grid-is-application`): because the table's role is `application`, rows and
gridcells have no grid ancestor, `CalendarGridHead` is `aria-hidden`, and each `row` is named by the
concatenation of its seven cell labels. That is the #2502 trade-off made visible; it is also why
the unnamed landmark matters more than it would on a plain table — the application *is* the grid.

Fix: `aria-labelledby` the grid to the hidden heading (`CalendarRoot.vue:369`), as MonthPicker does.

### 4. TagsInput's delete button is named by the tag text

**Severity:** low-medium.
**Key:** `TagsInput/TagsInput.aria.browser.test.ts#delete-button-named-by-tag-text`

What the tree shows (`_TagsInput.vue`, one tag `Test`):

```
- text: Test
- button "Test"
- textbox "Anything..."
```

Why: `TagsInputItemDelete.vue:37` names the button `aria-labelledby=itemContext.textId` — the tag's
text and nothing else (`TagsInputItem.vue:58` labels the item the same way; both also carry
`aria-current`). Measured: `getByRole('button', { name: 'Test', exact: true })` → 1. An AT
announces "Test, button" *[inferred]*: the item's own name, no verb, nothing saying the control
removes it. Compare Ark UI's tags input: `aria-label="Delete tag <value>"`.

Fix: a localisable `aria-label` such as `Remove <value>`, or `aria-labelledby` pointing at a
visually-hidden "Remove" text plus the tag text. The quarantined test only requires that the delete
control is not named identically to the item it deletes; the wording is a product decision.

### 5. `PopperArrow`'s `<svg>` is exposed as an unnamed image inside overlays

**Severity:** low (cosmetic for AT users).
**Key:** `DropdownMenu/DropdownMenu.aria.browser.test.ts#popper-arrow-svg-exposed-as-img`

The open DropdownMenu tree ends in a bare `- img`. It is `DropdownMenuArrow` → `PopperArrow.vue`,
which renders `Primitive as="svg"` with no `aria-hidden`. The fixture's `@iconify/vue` icons carry
`aria-hidden` themselves, so `page.getByRole('menu').getByRole('img')` resolves to exactly the
arrow. ivya models a bare `<svg>` as role `img`; whether a given screen reader announces it inside a
`role="menu"` is **[unverified]** — Radix's Arrow has the same shape. Fix: `aria-hidden="true"` on
the arrow, like every decorative icon.

---

## Fixture bugs (test fixtures under `story/_*.vue`, not product code)

Reported in `FINDINGS.tsv` under `a11y-census.browser.test.ts#census`. Not patched, because the
fixtures are shared with the jsdom originals.

- `_ToggleGroup.vue` — all three items are `button "Toggle italic"`. Any name-based query is
  ambiguous; the tests index instead.
- `_TimeRangeField.vue` — leaks `- text: "{}"` into the tree (an empty object rendered as text).
- `_DismissableLayer.vue` — two unnamed buttons; `_DummyDatePicker.vue` / `_DummyDateRangePicker.vue`
  — an unnamed icon-only trigger.
- `_ColorPicker.vue` — the hex field is `textbox "#000000"`, named by its placeholder;
  `_Combobox.vue` / `_Autocomplete.vue` — `combobox "Placeholder..."` for the same reason. These
  are "no label in the fixture", which also means the axe tests on them never exercise a labelled
  control.

## Ruled out while reading the census

- Calendar's visually-hidden `heading "Event Date, …" [level=2]` **is** in the tree — it is the last
  node, after the grid, easy to miss when a tree is truncated.
- Tree's flat `treeitem [level=N]` structure (no nested `group`) is legal ARIA when
  `aria-level` / `-setsize` / `-posinset` are present.
- `[expanded]`, `[checked]`, `[selected]` appear only when true, so every closed overlay is just
  `- button "X"` — not a missing state.
- The three `button "Previous page"` in the Calendar tree are the fixture rendering three nav
  buttons, not a component duplication.

## What the census structurally cannot find

Relations (`aria-controls`, `-describedby`, `-owns`, `-activedescendant` — see
`Collapsible/Collapsible.aria-controls.browser.test.ts#aria-controls-empty-at-rest` for the one
found another way), states that are *false*, anything `aria-hidden` or `display: none`, colour
contrast (keep axe), and whether a keyboard user can actually operate the thing (keep the real-input
tests). The open states of overlays are in the `*.aria.browser.test.ts` files, not the census.

## Reproduce

```bash
pnpm --filter reka-ui exec vitest run --project=browser src/a11y-census.browser.test.ts
pnpm --filter reka-ui exec vitest run --project=browser src/Select/Select.aria.browser.test.ts \
  src/DropdownMenu/DropdownMenu.aria.browser.test.ts src/DateField/DateField.aria.browser.test.ts \
  src/Calendar/Calendar.aria.browser.test.ts src/TagsInput/TagsInput.aria.browser.test.ts
```

Seven tests report as "expected fail" — one per finding (DateField has two). When one of them
turns **red**, the bug it names has been fixed: delete the `it.fails`, update the sibling snapshot,
and retire the row here.
