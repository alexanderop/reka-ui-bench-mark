# Improving the completed Browser Mode ports

The 97-file migration is complete and the original jsdom tests remain as a
comparison corpus. This document records the post-migration audit that moved
the browser suite from faithful translation to native-browser reference
coverage. It is a result log, not a speculative backlog.

All framework claims below were checked against the installed Vitest 4.1.10
types/source. Runtime claims were measured in the Chromium browser project.
Anything not exercised by a committed test is labelled `[unverified]`.

## What changed

The generic `src/test/browser.ts` compatibility adapter was deleted. Its five
large consumers now await `vitest-browser-vue` render and use Browser Mode
locators, `userEvent`, `expect.element`, and `expect.poll`:

- Autocomplete: real click, fill and keyboard input; IME payloads alone remain
  synthetic.
- ColorArea and ColorSlider: real tab/keyboard and held mouse input; only the
  disabled, otherwise-unreachable key guard remains a constructed event.
- Listbox: real focus entry, typeahead and scrolling outcomes replace
  `scrollIntoView` spies.
- TagsInput: real value entry, blur, keys and clipboard paste; IME payloads
  remain constructed.

NumberField and PinInput received the same treatment. PinInput and TagsInput
seed the clipboard through a real selection/copy/paste sequence rather than a
script-built `ClipboardEvent`. Drawer snap tests now use trusted clicks and a
stateful held mouse drag. ScrollArea scrolling is driven by trusted wheel input.

`render()` is awaited everywhere except the documented synchronous timing
probe in `shared/useSize.browser.test.ts`. `env.d.ts` augments
`vitest/browser`'s `BrowserCommands`; tests no longer cast `commands` through
`unknown`.

## Vitest 4.1.10 interaction boundary

The pinned API provides click, hover, wheel, keyboard, fill/type/clear,
copy/cut/paste, tab, drag/drop, viewport commands and retrying browser
assertions. It does not provide locator focus/blur, cross-engine touch, or IME
composition.

The suite therefore follows this boundary:

- ordinary focus entry uses click or `userEvent.tab()`;
- raw `.focus()` is retained only when programmatic focus itself is the
  contract or an arbitrary roving-focus descendant cannot be reached without
  changing selection; those sites are documented;
- composition, `isComposing`, timestamps, `defaultPrevented`, pointer IDs and
  otherwise-unreachable disabled guards may use constructed events when that
  payload is the subject, with a local rationale;
- trusted touch is implemented only on Chromium through the typed
  `touchSwipe` command and CDP `Input.dispatchTouchEvent`. The test explicitly
  skips Firefox/WebKit; cross-engine payload-only fallbacks remain narrow.

## New behavior coverage

The following unpaired browser tests add behavior the jsdom originals could
not prove:

- `Splitter.interactions.browser.test.ts`: measured drag, pointer lifecycle,
  separator ARIA relations, Home/End/arrow/Enter and F6 focus cycling.
- `ScrollArea.interactions.browser.test.ts`: wheel, thumb drag, pointer capture
  cleanup and glimpse state transitions.
- `Drawer.interactions.browser.test.ts`: trusted Chromium touch plus top/bottom
  scroll-edge arbitration.
- `TreeVirtualizer.interactions.browser.test.ts`: native wheel scrolling,
  virtual-window replacement, roving focus and off-screen typeahead.
- `TabsIndicator.interactions.browser.test.ts`: horizontal/vertical geometry
  and real ResizeObserver updates.

The real regressions fixed by these tests are recorded in `FINDINGS.tsv`,
including Splitter keyboard active state and Enter/layout synchronization.

## Accessibility contracts

General axe audits remain, but intended semantics now have dedicated oracles:

- ARIA snapshots pin tree shape.
- Role-state filters prove selected, checked, pressed or expanded state is on
  the intended node and no other.
- Accessible-name and accessible-description matchers prove the user-facing
  semantics.
- Direct DOM ID resolution proves `aria-controls`, `aria-labelledby`,
  `aria-describedby` and `aria-activedescendant`; ARIA snapshots cannot express
  whether an IDREF actually resolves.

The added contracts cover Tabs, Toggle, ToggleGroup, Checkbox, Tooltip, all six
calendar families, Combobox/Autocomplete/DropdownMenuFilter active-descendant
lifecycle, and 20 empty-capable required form-control families. Existing axe
and ARIA expected failures remain quarantined with `it.fails`; the new
RangeCalendar unnamed-application twin is recorded the same way.

Browser regressions found and fixed include stale active-descendant IDREFs,
empty DropdownMenu item IDs, Toggle's unsynchronised required checkbox bridge,
and empty range fields submitting `"undefined - undefined"`.

## Production-only browser coverage

Run:

```bash
pnpm --filter reka-ui test:coverage:browser
```

`vite.config.browser-coverage.ts` runs only the Chromium browser project,
includes unloaded `src/**/*.{ts,vue}` production modules, excludes tests,
`*.test-d.ts`, stories, fixtures, test helpers, shims, snapshots, screenshots
and visual infrastructure, and writes separate text/JSON/HTML reports under
`packages/core/coverage/browser-production`.

The final clean measured report runs 111 test files / 1582 runtime tests and
instruments 570 production modules with zero leaked test, story, fixture,
helper, shim, snapshot, screenshot or visual paths. It reports 82.52% lines
(10981/13306); the percentage is diagnostic, not a target. The useful first
gap was Select's real overflow scroll buttons, which now reach 100% lines in
`SelectScrollButtonImpl.vue` through trusted hover/pointer coverage. Advanced
Drawer composition primitives and Splitter storage/stacking remain explicit
configuration/composition gaps rather than percentage-chasing fixtures.

## Correctly synthetic cases

Do not mechanically replace these with a click or key helper:

- IME composition and `isComposing`/`beforeinput` payload tests;
- events whose `defaultPrevented` value is the assertion;
- disabled-control guards that trusted input cannot reach;
- pure composable coordinate/timestamp/pointer-ID inputs;
- animation events where bubbled target identity is the guard;
- otherwise-unreachable focus restoration/window-blur recovery paths.

Every retained site must explain which payload or guard is under test and why
the pinned API cannot produce it. A generic synthetic interaction adapter is
not an acceptable fallback.

## Verification loop

For each improvement batch:

1. inspect production behavior;
2. add the smallest real-browser regression;
3. run focused Chromium;
4. run `port:parity <Component> --complete` for paired files;
5. run `port:coverage <Component>` and argue any loss line-by-line;
6. run type-check/lint, then the broader browser, cross-browser, unit and node
   projects without overlapping full browser runs;
7. update `FINDINGS.tsv`, this document, AGENTS.md and the public migration
   guide with measured evidence.

Visual story baselines are a separate reviewed integration oracle and were not
changed by this audit.
