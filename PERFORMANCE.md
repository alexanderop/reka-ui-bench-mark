# PERFORMANCE.md — what browser mode costs, and where

Vitest Browser Mode is slower than jsdom. This document says **by how much, and which line of your
test is paying for it** — because the aggregate number (1.13×) and the number that governs the
inner dev loop (1.9×) and the number a single mouse click costs (800×) are three very different
stories, and quoting the wrong one leads to the wrong decision.

Everything here is measured on this repo's 87 file pairs — the same tests, ported one-for-one, so
the comparison is like-for-like rather than two suites that happen to test the same components.

**Machine and versions.** Apple M4 Pro, 12 cores, macOS 25.5.0, Node 24.19.0. `vitest@4.1.10`,
`@vitest/browser-playwright@4.1.10`, `vitest-browser-vue@2.1.0`, `jsdom@26.1.0`, Chromium headless.
All figures are medians of at least 3 runs unless noted. **Ratios travel between machines; absolute
milliseconds do not.**

---

## The one-paragraph answer

Per-test overhead in browser mode is **zero** — a trivial test costs 0.03ms in both environments,
and `render()` costs 0.3ms against jsdom's `mount()` at 0.22ms. What costs is **real pointer
input**: `locator.click()` is **26ms** against `element.click()`'s **0.03ms**. Three quarters of
that is not the click — it is Playwright's *stability* actionability check, which waits two
animation frames (measured at 16.65ms in this headless browser) to be sure the element is not
moving. Across the suite that single operation accounts for **46% of the total slowdown**, and the
count of real-input calls per file predicts that file's slowdown with **r = 0.95**. Files with no
real input at all are, on average, **faster** in Chromium than in jsdom.

---

## 1. Whole suite — wall clock

```bash
pnpm --filter reka-ui exec vitest run --project=unit      # jsdom, 87 files
pnpm --filter reka-ui exec vitest run --project=browser   # Chromium, 89 files
pnpm --filter reka-ui exec vitest run --project=node      # no DOM, 10 files
```

| project | files | tests | run 1 | run 2 | run 3 | median |
|---|---|---|---|---|---|---|
| `unit` (jsdom) | 87 | 1444 | 10.59s | 10.75s | 11.13s | **10.75s** |
| `browser` (Chromium) | 89 | 1426 + 20 expected fail | 12.24s | 12.10s | 12.00s | **12.10s** |
| `node` (no DOM) | 10 | 571 | — | — | — | 2.26s |
| all three together | 186 | 3441 + 20 | — | — | — | 25.59s |

**Browser mode costs 1.13× jsdom wall clock** on the full suite — 1.35s spread over 87 files, about
15ms per file. This is the number that decides whether CI needs sharding. It does not.

Two caveats on the comparison, both small and both in jsdom's favour: the browser project runs 2
extra files (`smoke`, `css-shim` — harness guards with no jsdom counterpart), and its 20 `it.fails`
quarantines still execute their bodies in full.

## 2. Why the wall clock barely moves — the phase breakdown

The same runs, by phase (these are summed-across-workers figures, which is why they exceed wall
clock):

| phase | jsdom | browser | |
|---|---|---|---|
| environment | 18.05s | **0ms** | no jsdom `Window` to construct per file |
| transform | 15.26s | **0ms** | Vite serves the page; no per-file transform in the runner |
| setup | 18.07s | 7.98s | jsdom pays for `vitest.setup.ts` — the mock file that exists only to paper over jsdom |
| import | 38.79s | 32.31s | comparable |
| **tests** | **32.35s** | **74.60s** | ← the entire regression lives here |

Browser mode wins ~35s of setup-shaped work and loses ~42s of test-shaped work. That near-cancellation
is why 2.3× slower tests present as 1.13× slower wall clock. It also means **the ratio is not stable
across suites**: a suite with fewer, heavier files banks less of the fixed-cost saving.

Note the third row especially. Roughly half of jsdom's setup cost here is the file whose entire
purpose is to fake the APIs Chromium provides natively. **Part of jsdom's speed advantage is spent
buying back the environment browser mode gives you for free.**

## 3. Per-operation cost

Method: a throwaway `*.browser.test.ts` rendering a minimal Vue fixture, each operation in a loop of
20–50 with `performance.now()` around it, reported through `console.warn` (which reaches the terminal;
`console.log` does not). The file was deleted afterwards.

| operation | cost | vs jsdom equivalent |
|---|---|---|
| `locator.click()` | **26.2 ms** | `el.click()` 0.03 ms → **~800×** |
| `locator.hover()` | 25.0 ms | — |
| `locator.click({ force: true })` | **8.0 ms** | skips actionability |
| `userEvent.keyboard('a')` — static input | 1.8 ms | |
| `userEvent.keyboard('{ArrowUp}')` — live DateField segment | **8–9.6 ms** | the component actually re-renders |
| `userEvent.fill('hello')` | 2.0 ms | |
| `await render()` | 0.31 ms | VTU `mount()` 0.22 ms |
| `locator.element()` (query) | 0.02 ms | |
| `await expect.element(…)` **passing first attempt** | 0.08 ms | |
| `expect(rawNode).toBeTruthy()` | 0.01 ms | |
| trivial `it()` — harness overhead per test | **0.03 ms** | jsdom: 0.03 ms — *identical* |

Read the last row first. **There is no per-test tax.** Measured over 60 trivial and 60 render-only
tests in each environment, the whole-file wall clock was 21.2ms browser vs 15.1ms jsdom. Queries,
renders and passing assertions are all effectively free. The regression is concentrated in a single
family of calls.

## 4. Why a click costs 26ms

Decomposed:

| | |
|---|---|
| `locator.click()` | 26.2 ms |
| `locator.click({ force: true })` — same real trusted click, no actionability wait | 8.0 ms |
| difference | **18.2 ms** |
| `2 × requestAnimationFrame`, measured inside the page | **16.65 ms** |

The difference is the frame pair, to within noise.

Playwright's actionability requirements for a click are *visible → **stable** → receives events →
enabled*, and **stable** means the element's bounding box is unchanged across two consecutive
animation frames. That is a wall-clock wait; no amount of CPU removes it. The corroborating case is
`fill`, whose requirements are *visible → enabled → editable* — **no stability check** — and which
costs 2.0ms, an eighth of a click.

The remaining 8ms is the real input pipeline: hit-testing plus three CDP input events (move, down,
up) crossing into the browser process, against jsdom's single synthetic `click` object dispatched
in-process. For scale, a bare round trip to the Playwright driver is ~1.8ms (that is what
`userEvent.keyboard` on a static input measures).

This is the same cost the correctness notes describe from the other side: an awaited real click
crosses the event task and Vue's flush, which is *why* the ported tests can delete their
`nextTick()` calls. **You are buying real event semantics, and 18ms of it is the browser proving the
element stopped moving first.**

## 5. Per-file — the count of real interactions predicts everything

Method: summed per-test durations from `--reporter=json` for each project, joined on the file pair,
against a static count of real-input calls in the browser file (`.click(`, `.hover(`, `.dropTo(`,
`.dblClick(`, the custom `mouse*` commands; and separately `.keyboard(`, `.type(`, `.tab(`, `.fill(`).

- **r = 0.93** between pointer-action count and per-file slowdown; **r = 0.95** including keyboard.
- Regression slope: **+32.6ms of slowdown per real-input call**, intercept **−16ms**.
- 744 pointer actions across the suite × 26ms = **19.3s, or 46% of the 42.4s total delta**.
- **29 of 87 files are faster in Chromium.** Of the 28 files that make no real input at all, **26 are
  faster**, mean **−37ms**.
- Median per-file ratio: **1.89×**.

The negative intercept is the finding worth pinning: **a file that never touches the mouse or
keyboard is faster in a real browser than in jsdom.** Chromium's DOM is native code; jsdom's is
JavaScript. Browser mode is not slow — *acting like a user* is slow, and it is slow because a user
is slow.

Top of the table (summed test time, ms):

| file | tests | jsdom | browser | delta | pointer calls | key calls |
|---|---|---|---|---|---|---|
| `DateField` | 62 | 1201 | 6735 | **+5534** | 71 | 69 |
| `TimeField` | 72 | 1021 | 5182 | **+4161** | 61 | 81 |
| `RangeCalendar` | 45 | 3683 | 6734 | **+3050** | 60 | 28 |
| `Calendar` | 54 | 2476 | 4689 | **+2212** | 40 | 38 |
| `Combobox` | 45 | 1307 | 2890 | **+1584** | 27 | 10 |
| `Editable` | 17 | 538 | 1911 | **+1373** | 17 | 8 |
| `NumberField` | 41 | 405 | 1762 | **+1357** | 30 | 4 |
| `DatePicker` | 20 | 1241 | 2566 | **+1325** | 38 | 21 |

And the other end:

| file | tests | jsdom | browser | delta | pointer calls | key calls |
|---|---|---|---|---|---|---|
| `Autocomplete` | 25 | 947 | 550 | **−396** | 2 | 0 |
| `Listbox` | 40 | 1069 | 757 | **−312** | 3 | 0 |
| `ColorArea` | 64 | 265 | 54 | **−211** | 0 | 0 |
| `Toolbar` | 4 | 231 | 39 | **−192** | 0 | 0 |
| `ConfigProvider` | 8 | 196 | 47 | **−149** | 0 | 0 |
| `ColorSlider` | 16 | 173 | 39 | **−134** | 0 | 0 |

Full 87-file table in the appendix.

## 6. The cliff: a *failing* retrying matcher costs 15 seconds

Everything above is happy-path. The asymmetry that actually hurts:

| | jsdom | browser |
|---|---|---|
| `expect.element(…).toHaveFocus()` — **passing** | — | 0.08 ms |
| `expect.element(…).toHaveFocus()` — **failing** | 8 ms | **15009 ms** |
| `expect.element(…).not.toHaveAttribute(…)` — **failing** | 7 ms | **14990 ms** |

**Where the 15s comes from — it is not the matcher's own timeout.** Read from source
(`vitest@4.1.10`): `processTimeoutOptions`
(`packages/browser/src/client/tester/tester-utils.ts:193-223`) gives a locator action or an
`expect.element` **the remaining test timeout minus 100ms** whenever no explicit `timeout` is passed
*and* `browser.providerOptions.actionTimeout` is unset. And `testTimeout` defaults to **15000ms in
browser mode**, against 5000 elsewhere (`packages/vitest/src/node/config/resolveConfig.ts:935`):

```ts
resolved.testTimeout ??= resolved.browser.enabled ? 15_000 : 5_000
```

15000 − 100 = 14900. Measured on a purpose-built failing test: `expect.element` **14918ms**,
`click()` on a missing element **14907ms**. `expect.poll`'s own default is 1000ms and never applies
here, because the remaining-test-time value overrides it.

**This is fixable in config, and this repo now does it** — see [§8](#8-config-levers-tested).

Consequences, in order of how often they bite:

1. **A red suite is far more expensive than a green one.** Budget CI time for failure, not for the
   happy path.
2. **Mutation testing gets ~2000× slower per assertion.** When mutation-verifying a claim, mutate
   against the cheapest assertion that proves it — or set `actionTimeout` for that run.
3. A hung port is usually a zero-size or unreachable element, not a slow one — measure the target's
   `getBoundingClientRect()` before assuming the locator is wrong.
4. `browser.screenshotFailures` defaults to **true**
   (`resolveConfig.ts:874`), and each failure takes a full-page screenshot with a 5s timeout
   (`packages/browser/src/client/tester/runner.ts:162-181`) — on top of the timeout above. It fires
   only on `task.result.state === 'fail'`, so the 20 `it.fails` quarantines do **not** pay it.
   `browser.trace` defaults to `'off'` (`resolveConfig.ts:899-900`) and costs nothing here.

## 7. Cold start — the inner dev loop

Single-file runs, full process wall clock including pnpm and Vitest startup:

| file | jsdom | browser | ratio |
|---|---|---|---|
| `Checkbox` (26 tests, 20 clicks) | 1327 ms | 2363 ms | 1.78× |
| `Slider` (39 tests, geometry-heavy) | 1277 ms | 2199 ms | 1.72× |
| `DateField` (62 tests, 71 clicks) | 2396 ms | 5146 ms | 2.15× |

**This — not 1.13× — is the number a developer feels**, because the inner loop runs one file at a
time and there is nothing to amortize a Chromium launch against. ~0.6s of it is browser startup, and
it is paid once per invocation rather than once per file, which is exactly why the full-suite ratio
is so much better than the single-file one.

If watch-mode latency is the constraint, that is an argument for keeping the run narrow, not for
keeping jsdom.

---

## 8. Config levers tested

Every knob below was measured on this suite, not reasoned about. Full-suite figures are warm runs —
**editing `vite.config.ts` invalidates Vite's dep-optimize cache, so the first run after any config
change is 1.5–2× slow and must be discarded.** That cold run is the single easiest way to fake a
result in either direction.

| lever | measured | verdict |
|---|---|---|
| `playwright({ actionTimeout: 2000 })` | failing assertion **14918ms → 1025ms**; failing action → ~2000ms; green suite unchanged (12.03s) | **adopted** |
| `isolate: false` | **46–53 of 89 files fail**, non-deterministically, and it is *slower*: 26.8–29.7s | rejected |
| `maxWorkers` | 6 → 12.60s · **11 (default) → 11.79s** · 16 → 13.25s | keep default |
| `expect: { poll: { interval: 10 } }` (from 50) | 11.70s vs 11.79s | noise, not adopted |
| `viewport: 1280×800` (from default 414×896) | wall clock unchanged, **breaks `Rating`'s mouse-leave test** | rejected |
| `launchOptions.args: --disable-frame-rate-limit, --disable-gpu-vsync, --disable-background-timer-throttling` | click **24.8 → 52.8ms**, 2×rAF **16.7 → 34.9ms** — **2× worse**, reverted and re-measured to confirm | rejected |
| lazy-loading `axe-core` out of the setup file | per-file setup 454ms → 441ms | noise, not adopted |

### The one that worked

```ts
provider: playwright({ actionTimeout: 2000 })
```

It buys nothing on a green run and makes a red one **~15× cheaper**, for the reason in
[§6](#6-the-cliff-a-failing-retrying-matcher-costs-15-seconds): it makes `processTimeoutOptions`
return early, so a failing Playwright action is capped at 2000ms and a failing `expect.element`
falls back to `expect.poll`'s own 1000ms default instead of inheriting the 15000ms test timeout.
Note the asymmetry — the assertion path lands at 1000ms *whatever* you set `actionTimeout` to
(measured 1025ms at both 1000 and 2000); the number only governs actions.

**Why 2000 and not 1000.** Headroom, measured by walking it down until the suite broke:

| `actionTimeout` | result |
|---|---|
| 300 ms | **12 files fail** |
| 500 ms | **1 file fails** |
| 1000 ms | green |
| 2000 ms | green |

So the slowest *legitimate* wait in this suite is somewhere in 500–1000ms, and 1000 would ship with
roughly 1× margin. CI hardware is slower than an M4 Pro; 2000 keeps ~2–4× margin while still
cutting failure cost by 7.5×. **Do not copy the number — run this ladder on your own suite**, since
it measures your slowest real wait, not a universal constant.

### Why `isolate: false` fails so badly, and why it is worth knowing

It is the obvious "reuse the iframe, skip the per-file boot" optimization, and it converts a green
suite into 400–600 non-deterministic failures. The reason is the same one the migration notes
already document from the jsdom side: **module-level state and document-level listeners survive
between files.** Every overlay that registers an outside-press handler, every module-scope
registry, every un-unmounted app leaks into the next file. Isolation is not overhead here — it is
what makes the ported tests independent.

It is also *slower*, because failures then pay the timeout cliff. A correctness regression that
presents as a performance regression is a good reminder to check the pass count on every
optimization run, not just the clock.

### Levers that do not exist

- **The stability wait is not configurable.** It lives in Playwright's injected script, not in a
  Vitest option. `force: true` skips it per call; nothing turns it off globally.
- **There is no `dispatchEvent` escape hatch in `userEvent`.** Vitest's provider maps
  `userEvent.click` straight onto Playwright's `locator.click(options)`
  (`packages/browser-playwright/src/commands/click.ts:5-11`), passing options through — so
  `force`, `position` and `timeout` are available per call, but a synthetic no-actionability click
  is not part of the API. You could write one as a custom command; it would be a jsdom-grade click,
  which is the thing this migration set out to stop using.
- **Custom commands are not a fast path.** Measured: a built-in `userEvent.keyboard` round trip is
  1.8ms, while this repo's custom `mouseMove` is 8.4ms and a `mouseDown` + `mouseUp` pair is 25ms —
  more than a whole `locator.click()`. Batching a gesture into one Playwright call is cheaper than
  splitting it across commands, so keep `dropTo()` / `click({ position })` as the default and reach
  for the split only when the test's hook structure demands it.

---

## What to do about it

Ordered by leverage:

1. **Count your pointer actions, not your tests.** At ~33ms of slowdown each (regression slope), 30
   clicks in a file is a second. Nothing else in the API is worth optimizing until that number is
   down.
2. **Don't repeat a gesture the browser already performs.** A real click delivers `pointerdown`,
   `mousedown`, focus, `mouseup` and `click`; the jsdom-era rituals that fire several of those by
   hand are both slower and less faithful. `Select`'s double-`pointerup` selection is the worked
   example — deleting it made the test *both* faster and correct.
3. **`force: true` is 3× cheaper — but it is a different gesture.** It skips the actionability
   *wait*, not the gesture; on a disabled element Chromium then delivers only `pointerdown` and
   focuses an ancestor. Use it where that is the point (disabled-control tests), never as a blanket
   speed-up.
4. **Prefer `fill` to per-character typing** where the contract is the resulting value: 2.0ms against
   ~1.8ms *per key* on a static input and 8–9ms per key on a live one.
5. **Leave keyboard-only tests alone.** They are already cheap, and they are exempt from the modal
   `pointer-events: none` hit-testing problem too.
6. **Don't chase `render()`, queries or assertions.** 0.31ms, 0.02ms and 0.08ms. There is nothing
   there.

## What is not measured here

- **CI hardware.** All numbers are one M4 Pro with 12 cores. The stability wait is wall-clock and
  will not shrink on a faster box; the RPC and import costs will. Expect the ratio to *worsen* on a
  slower or more contended CI runner. `[unverified]`
- **Headed vs headless, and other browsers.** Only headless Chromium was measured. The 16.65ms frame
  pair is a headless figure. `[unverified]`
- ~~**Multi-browser `browser.instances`.** Not exercised.~~ **Measured** via `vite.config.cross-browser.ts`,
  one engine per process, whole 97-file corpus, same machine: Chromium 16.3s; Firefox 35.2s with
  parallel files and **87.2s** serial; WebKit 21.1s parallel and **80.8s** serial. Serial is
  mandatory for those two engines — parallel tabs steal focus and fail 12 (Firefox) / 1 (WebKit)
  focus-dependent tests that pass alone — so the honest multipliers are **5.3× (Firefox)** and
  **5.0× (WebKit)** over Chromium, dominated by the `tests` phase (59.4s / 58.8s vs 10.3s). All three
  engines in *one* process: 97s and 11 spurious Chromium failures from contention. Details and the
  per-test verdicts in `FINDINGS.tsv` under `cross-browser#…`; CI runs one engine per job.
- **Whether the 1000ms locator timeout can safely be lowered** for this suite, which would cut the
  15s failure cliff proportionally. Worth trying; not tried. `[unverified]`
- **`toMatchScreenshot`.** One isolated `AspectRatio` story-sheet pilot is now enabled outside the
  measured 89-file browser project. Its cold visual run completed in 1.74s and the assertion/test
  body in 136ms on the same machine. The pinned Playwright 1.62.1 Noble container completed the
  same one-test Vitest phase in 2.41s with a 295ms test body (dependency installation excluded).
  One case is not a performance study; larger-sheet costs remain `[unverified]`. See the bounded
  visual-regression note in `AGENTS.md`.

## Reproducing all of it

```bash
# whole-suite wall clock, per project
pnpm --filter reka-ui exec vitest run --project=unit
pnpm --filter reka-ui exec vitest run --project=browser

# per-file data behind §5
pnpm --filter reka-ui exec vitest run --project=unit    --reporter=json --outputFile=unit.json
pnpm --filter reka-ui exec vitest run --project=browser --reporter=json --outputFile=browser.json
# then join testResults[] on filename and sum assertionResults[].duration

# per-operation data behind §3 and §4: a temporary *.browser.test.ts with
# performance.now() around a loop of 20, reported via console.warn (console.log
# does not reach the terminal). Delete it afterwards.
```

---

## Appendix — all 87 file pairs

Summed per-test durations in ms, sorted by delta. `ptr` counts `.click(`/`.hover(`/`.dropTo(`/
`.dblClick(`/`mouse*`; `key` counts `.keyboard(`/`.type(`/`.tab(`/`.fill(`.

| file | tests | jsdom | browser | delta | ptr | key |
|---|---|---|---|---|---|---|
| `DateField` | 62 | 1201 | 6735 | +5534 | 71 | 69 |
| `TimeField` | 72 | 1021 | 5182 | +4161 | 61 | 81 |
| `RangeCalendar` | 45 | 3683 | 6734 | +3050 | 60 | 28 |
| `Calendar` | 54 | 2476 | 4689 | +2212 | 40 | 38 |
| `Combobox` | 45 | 1307 | 2890 | +1584 | 27 | 10 |
| `Editable` | 17 | 538 | 1911 | +1373 | 17 | 8 |
| `NumberField` | 41 | 405 | 1762 | +1357 | 30 | 4 |
| `DatePicker` | 20 | 1241 | 2566 | +1325 | 38 | 21 |
| `Accordion` | 27 | 399 | 1721 | +1322 | 7 | 10 |
| `Tree` | 25 | 345 | 1529 | +1184 | 19 | 1 |
| `Dialog` | 29 | 782 | 1886 | +1103 | 24 | 10 |
| `Checkbox` | 26 | 136 | 1145 | +1008 | 20 | 0 |
| `FocusScope` | 10 | 300 | 1255 | +955 | 6 | 10 |
| `MonthRangePicker` | 23 | 672 | 1580 | +908 | 26 | 9 |
| `Select` | 29 | 1108 | 1997 | +889 | 21 | 1 |
| `ColorField` | 29 | 94 | 972 | +878 | 13 | 20 |
| `Slider` | 39 | 187 | 1035 | +848 | 6 | 33 |
| `Pagination` | 28 | 370 | 1123 | +753 | 15 | 0 |
| `YearRangePicker` | 21 | 537 | 1285 | +748 | 21 | 9 |
| `NavigationMenu` | 13 | 367 | 1092 | +725 | 14 | 3 |
| `RadioGroup` | 21 | 212 | 863 | +651 | 8 | 5 |
| `Presence` | 10 | 16 | 663 | +647 | 6 | 0 |
| `Toast` | 7 | 799 | 1393 | +595 | 7 | 1 |
| `Switch` | 9 | 89 | 648 | +560 | 7 | 2 |
| `Stepper` | 11 | 381 | 932 | +551 | 10 | 12 |
| `TagsInput` | 28 | 439 | 988 | +548 | 2 | 4 |
| `Drawer` | 11 | 151 | 690 | +539 | 12 | 1 |
| `DropdownMenu` | 16 | 533 | 1032 | +499 | 3 | 7 |
| `DateRangePicker` | 13 | 752 | 1247 | +495 | 16 | 4 |
| `Rating` | 15 | 266 | 760 | +494 | 5 | 4 |
| `Collapsible` | 11 | 115 | 601 | +486 | 6 | 0 |
| `MonthPicker` | 27 | 633 | 1086 | +453 | 18 | 9 |
| `ToggleGroup` | 15 | 177 | 623 | +446 | 5 | 3 |
| `DateRangeField` | 8 | 336 | 763 | +427 | 6 | 9 |
| `TimeRangeField` | 22 | 461 | 880 | +419 | 16 | 16 |
| `Drawer` | 6 | 107 | 516 | +409 | 12 | 0 |
| `DropdownMenu` | 9 | 340 | 725 | +385 | 2 | 0 |
| `Splitter` | 3 | 104 | 453 | +349 | 4 | 0 |
| `Toggle` | 11 | 85 | 425 | +340 | 4 | 0 |
| `shared` | 12 | 8 | 342 | +334 | 0 | 1 |
| `shared` | 4 | 10 | 327 | +317 | 4 | 3 |
| `DismissableLayer` | 20 | 169 | 483 | +314 | 4 | 5 |
| `AlertDialog` | 4 | 143 | 429 | +286 | 4 | 0 |
| `PinInput` | 38 | 456 | 721 | +265 | 1 | 15 |
| `Viewport` | 5 | 17 | 235 | +218 | 0 | 0 |
| `Menubar` | 6 | 380 | 581 | +201 | 2 | 0 |
| `ScrollArea` | 9 | 1107 | 1292 | +186 | 8 | 0 |
| `HoverCard` | 6 | 505 | 684 | +179 | 1 | 0 |
| `Label` | 7 | 63 | 192 | +129 | 5 | 0 |
| `ColorSwatchPicker` | 9 | 186 | 312 | +127 | 3 | 0 |
| `Primitive` | 15 | 38 | 156 | +118 | 3 | 0 |
| `Popover` | 2 | 115 | 230 | +115 | 1 | 0 |
| `YearPicker` | 28 | 514 | 616 | +102 | 14 | 12 |
| `ContextMenu` | 3 | 189 | 289 | +99 | 1 | 0 |
| `RovingFocus` | 4 | 90 | 186 | +96 | 0 | 10 |
| `shared` | 3 | 8 | 99 | +91 | 1 | 0 |
| `Menu` | 6 | 234 | 274 | +40 | 2 | 0 |
| `shared` | 2 | 2 | 3 | +1 | 0 | 0 |
| `shared` | 13 | 3 | 1 | -2 | 0 | 0 |
| `shared` | 15 | 3 | 1 | -2 | 0 | 0 |
| `shared` | 10 | 39 | 35 | -5 | 0 | 0 |
| `shared` | 17 | 7 | 2 | -5 | 0 | 0 |
| `shared` | 7 | 12 | 4 | -9 | 0 | 0 |
| `VisuallyHidden` | 9 | 20 | 8 | -12 | 0 | 0 |
| `shared` | 7 | 17 | 5 | -12 | 0 | 0 |
| `Teleport` | 5 | 20 | 5 | -15 | 0 | 0 |
| `Collection` | 5 | 21 | 5 | -16 | 0 | 0 |
| `shared` | 6 | 23 | 6 | -17 | 0 | 0 |
| `FocusGuards` | 5 | 24 | 4 | -20 | 0 | 0 |
| `Drawer` | 16 | 24 | 2 | -22 | 0 | 0 |
| `Avatar` | 8 | 708 | 682 | -26 | 0 | 0 |
| `Tooltip` | 6 | 168 | 141 | -27 | 0 | 0 |
| `shared` | 4 | 37 | 8 | -29 | 0 | 0 |
| `ColorSwatch` | 17 | 46 | 13 | -33 | 0 | 0 |
| `shared` | 1 | 39 | 5 | -34 | 0 | 0 |
| `Separator` | 1 | 53 | 7 | -46 | 0 | 0 |
| `Tabs` | 7 | 164 | 115 | -49 | 0 | 2 |
| `AspectRatio` | 2 | 59 | 9 | -50 | 0 | 0 |
| `Drawer` | 10 | 60 | 7 | -54 | 0 | 0 |
| `Progress` | 3 | 276 | 215 | -62 | 0 | 0 |
| `Popper` | 22 | 72 | 9 | -63 | 0 | 0 |
| `ColorSlider` | 16 | 173 | 39 | -134 | 0 | 0 |
| `ConfigProvider` | 8 | 196 | 47 | -149 | 0 | 0 |
| `Toolbar` | 4 | 231 | 39 | -192 | 0 | 0 |
| `ColorArea` | 64 | 265 | 54 | -211 | 0 | 0 |
| `Listbox` | 40 | 1069 | 757 | -312 | 3 | 0 |
| `Autocomplete` | 25 | 947 | 550 | -396 | 2 | 0 |
