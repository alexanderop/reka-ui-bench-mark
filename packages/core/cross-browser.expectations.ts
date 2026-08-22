/**
 * Engine- and platform-specific expectations for the cross-browser project
 * (`vite.config.cross-browser.ts`). The 97 ported files are written and kept
 * green against Chromium; this table is where the *differences* live when the
 * same files run in Firefox and WebKit.
 *
 * One row per (engine, test) that does not behave like Chromium, each naming a
 * `FINDINGS.tsv` key that explains why — the `@finding` rule from PORTING.md
 * applied to engines instead of jsdom. `vitest.cross-browser.setup.ts` turns a
 * `fails` row into `test.fails` for that engine, and a `passes` row clears an
 * `it.fails` quarantine that does not reproduce there (so the test must pass).
 * A row that matches nothing in its file fails the file: a stale expectation is
 * a fixed bug or a renamed test, and either way it needs reading.
 *
 * Rows are keyed by the full test name (`describe > … > it`) exactly as Vitest
 * prints it. `platform` defaults to `'*'`; use `'darwin'`/`'linux'` for OS-bound
 * behaviour (sequential focus on macOS is the known case).
 */
export type Engine = 'chromium' | 'firefox' | 'webkit'
export type Platform = 'darwin' | 'linux' | 'win32' | '*'

export interface CrossBrowserExpectation {
  engine: Engine
  platform?: Platform
  /** Test file, relative to `packages/core`, as Vitest names it. */
  file: string
  /** Full test name, or a RegExp over it. */
  test: string | RegExp
  /**
   * `fails`: deterministically fails on this engine (inverted like `it.fails`).
   * `passes`: an `it.fails` quarantine that does not reproduce here (the test must pass).
   * `skip`: nondeterministic on this engine — measured to flip between runs — so
   * neither verdict can be pinned; skipped with the finding as the reason.
   */
  expect: 'fails' | 'passes' | 'skip'
  /** A key in FINDINGS.tsv. Validated at setup; an unknown key fails the run. */
  finding: string
}

export const EXPECTATIONS: CrossBrowserExpectation[] = [
  // ── Firefox ─────────────────────────────────────────────────────────────
  { engine: 'firefox', file: 'src/Tree/TreeVirtualizer.interactions.browser.test.ts', test: 'tree virtualizer native browser interactions > moves focus and the virtual window with native End, Home and ArrowDown keys', expect: 'fails', finding: 'cross-browser#firefox-treevirtualizer-end' },
  // innerHTML attribute order differs from the Chromium `.snap` baselines.
  { engine: 'firefox', file: 'src/ScrollArea/ScrollArea.browser.test.ts', test: /^given (default|prop:type="always"|prop:type="scroll") ScrollArea > (on (hover|scroll) > )?should render (content, but not scrollbar|scrollbar|content and scrollbar)$/, expect: 'fails', finding: 'cross-browser#dom-snapshot-attribute-order' },
  { engine: 'firefox', file: 'src/Tree/Tree.browser.test.ts', test: 'given default Tree > should render snapshot', expect: 'fails', finding: 'cross-browser#dom-snapshot-attribute-order' },
  // Which of the offset-write tests fail changes from run to run on Firefox.
  { engine: 'firefox', file: 'src/Drawer/Drawer.snap.browser.test.ts', test: /^drawer snap points — integration > (mount-time snap offset write \(reopen bug\) > writes --drawer-snap-point-offset on|swipe release does not leave stale movement var > updates --drawer-snap-point-offset synchronously)/, expect: 'skip', finding: 'cross-browser#drawer-snap-offset-nondeterministic' },

  // ── WebKit ──────────────────────────────────────────────────────────────
  // JavaScriptCore resolves the fixture's invalid `en-UK` tag to `en`, not `en-GB`.
  { engine: 'webkit', file: 'src/DateField/DateField.browser.test.ts', test: 'dateField > changes segment positioning based on `locale`', expect: 'fails', finding: 'cross-browser#webkit-en-uk-not-aliased' },
  { engine: 'webkit', file: 'src/DateField/DateField.browser.test.ts', test: 'dateField > doesnt show the day period for locales that don\'t use them', expect: 'fails', finding: 'cross-browser#webkit-en-uk-not-aliased' },
  { engine: 'webkit', file: 'src/TimeField/TimeField.browser.test.ts', test: 'timeField > doesn\'t show the day period for locales that don\'t use them', expect: 'fails', finding: 'cross-browser#webkit-en-uk-not-aliased' },
  // ArrowRight on the focused trigger moves focus back into the field.
  { engine: 'webkit', file: 'src/DatePicker/DatePicker.browser.test.ts', test: 'datePicker > navigates segments using the arrow keys', expect: 'fails', finding: 'cross-browser#webkit-arrowright-leaves-trigger' },
  // macOS WebKit: Tab skips links and buttons; a click does not focus them.
  { engine: 'webkit', platform: 'darwin', file: 'src/DatePicker/DatePicker.browser.test.ts', test: 'datePicker > navigates the segments using tab', expect: 'fails', finding: 'cross-browser#webkit-darwin-tab-skips-links-and-buttons' },
  { engine: 'webkit', platform: 'darwin', file: 'src/NavigationMenu/NavigationMenu.browser.test.ts', test: 'given default NavigationMenu > after clicking on button to open menu > after pressing tab > should focus on the first item in menu', expect: 'fails', finding: 'cross-browser#webkit-darwin-tab-skips-links-and-buttons' },
  { engine: 'webkit', platform: 'darwin', file: 'src/NavigationMenu/NavigationMenu.browser.test.ts', test: 'given default NavigationMenu > after clicking on button to open menu > after pressing down key > should focus on the first item in menu', expect: 'fails', finding: 'cross-browser#webkit-darwin-click-does-not-focus' },
  { engine: 'webkit', platform: 'darwin', file: 'src/NavigationMenu/NavigationMenu.browser.test.ts', test: 'given default NavigationMenu > after clicking on button to open menu > after pressing down key > should focus on the last item in menu', expect: 'fails', finding: 'cross-browser#webkit-darwin-click-does-not-focus' },
  { engine: 'webkit', platform: 'darwin', file: 'src/Tooltip/Tooltip.aria.browser.test.ts', test: 'given the Tooltip story fixture > adds and removes a resolved accessible description with the tooltip', expect: 'fails', finding: 'cross-browser#webkit-darwin-tab-skips-links-and-buttons' },
  // innerHTML attribute order differs from the Chromium `.snap` baseline.
  { engine: 'webkit', file: 'src/Tree/Tree.browser.test.ts', test: 'given default Tree > should render snapshot', expect: 'fails', finding: 'cross-browser#dom-snapshot-attribute-order' },
  // The quarantined pending-focus reopen does not reproduce on WebKit.
  { engine: 'webkit', file: 'src/HoverCard/HoverCard.browser.test.ts', test: 'given a HoverCard with enableTouch > should not reopen from a pending focus timer after closing on touch', expect: 'passes', finding: 'cross-browser#hovercard-pending-focus-not-in-webkit' },
  // Three of the four offset-write tests failed in every isolated WebKit run and the
  // fourth flipped under load — nondeterministic here too, so the same `skip`.
  { engine: 'webkit', file: 'src/Drawer/Drawer.snap.browser.test.ts', test: /^drawer snap points — integration > (mount-time snap offset write \(reopen bug\) > writes --drawer-snap-point-offset on|swipe release does not leave stale movement var > updates --drawer-snap-point-offset synchronously)/, expect: 'skip', finding: 'cross-browser#drawer-snap-offset-nondeterministic' },
]
