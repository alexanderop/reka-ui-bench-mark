# Improving the ported tests with Vitest 5

Companion to `IMPROVING-PORTED-TESTS.md` (the Vitest 4.1 backlog, actionable
today). This is a **survey snapshot of Vitest `v5.0.0-rc.1`**, not current setup
guidance: it records what that prerelease's defaults and APIs would do for this
suite and the exact sweeps an eventual upgrade was expected to force.

**How this was surveyed:** everything below was read from Vitest's public
[`v5.0.0-rc.1` tag](https://github.com/vitest-dev/vitest/tree/v5.0.0-rc.1) while
this repository stayed pinned to 4.1.10. The v5 prerelease has since advanced,
so re-verify every recommendation against the selected release and its final
migration notes before upgrading. Anything checked against this repo's code is
marked *measured*; predictions are marked *[unverified]*.

**Prerequisites — met.** v5 requires Vite ≥ 6.4 and Node ≥ 22.12; this repo
runs Vite 8 and Node 24 (measured). The config uses none of the removed
options (`test.sequential`, `browser.isolate`, deprecated entrypoints —
grepped, zero hits).

---

## Part 1 — Defaults that delete our gotcha list

The single most valuable thing in v5 for this repo is not an API. It is that
the **substring family** — three separately-documented silent-vacuity hazards
in AGENTS.md — stops being per-test discipline and becomes the default.

### Locators match exactly by default

`browser.locators.exact` becomes **default `true`**: `getByText`, role
`name` filters and friends require a full, case-sensitive match unless a call
opts out with `exact: false`. *(Correction: the option itself is not new — it
shipped in **4.1.3**, default `false`, `docs/config/browser/locators.md`; v5
only flips the default. We flipped it on 4.1.10 instead of waiting — see step
0d below.)* Concretely, against our recorded traps:

| AGENTS.md hazard | v4 behavior | v5 behavior |
|---|---|---|
| `getByText('checked')` vs a Switch rendering `unchecked` | matches — both toggle tests pass against a switch that never toggles | no match |
| `getByRole('option', { name: 'Apple' })` vs *Pineapple* | matches → strict-mode violation (loud) or silent widening (quiet) | no match |
| every defensive `{ exact: true }` added during the migration | required | redundant, eventually removable |

Upgrade cost: any port that *accidentally relies* on substring matching now
fails. The AGENTS.md audit found four non-`exact` `getByText` calls that
resolve correctly today — those are the first suspects when the upgrade run
goes red. The escape hatch (`browser.locators.exact: false`) restores old
behavior globally, but for this suite the new default is exactly what the
gotcha list has been asking for.

### `toHaveTextContent` becomes strict equality

The matcher no longer does partial matching and no longer accepts a RegExp;
both behaviors move to the **new `toMatchTextContent`**:

```ts
// v4 semantics, now spelled honestly:
await expect.element(banner).toMatchTextContent('Error') // substring
await expect.element(banner).toMatchTextContent(/error/i) // regex

// v5 toHaveTextContent is whole-string:
await expect.element(segment).toHaveTextContent('01') // no longer matches "2001"
```

This kills the DateField/TimeField trap (`'1'` passing against `1980`,
`'5'` accepting a broken `20245`). Ports that switched to trimmed exact
`textContent` comparisons *because* the matcher was substring-based can
migrate back to the matcher.

**Measured, not grepped — and now FIXED.** v5's matcher
(`packages/browser/src/client/tester/expect/toHaveTextContent.ts` @
`v5.0.0-rc.1`, exact equality after `text.replace(/\s+/g, ' ').trim()`) was
ported into `vitest.browser.setup.ts` via `expect.extend` and the browser
suite run against it. Of **291** call sites, **7** were substring-reliant —
all of them zero-padding, in 2 files:

```
TimeRangeField:81,172   expected "9",  rendered "09"   (en-GB, 24h)
TimeRangeField:177      expected "2",  rendered "02"
DateRangeField:148,171  expected "0",  rendered "00"   (start-second)
DateRangeField:155,178  expected "0",  rendered "00"   (end-second)
```

Two things worth keeping from that run. **The failures surfaced in waves** —
the first pass reported 4, and fixing those exposed 3 more, because an
assertion after a failing one in the same `it` never ran. Re-run the preview
to convergence rather than trusting the first count. And **padding is
locale-dependent**: the same fixture hour renders `09` under en-GB 24-hour and
`9` under en-US 12-hour, so blanket-padding every site would have been wrong;
only the measured sites were changed.

All 7 now carry `.padStart(2, '0')` (or the literal `'02'`). The suite is
green under the strict matcher *and* under `clearMocks: true`, simultaneously.
Fixing them under 4.1 costs nothing: an exact string still satisfies a
substring match.

---

## Part 2 — New APIs worth adopting here

### `browser.locators.errorFormat` — diagnostic locator failures

`'html' | 'aria' | 'all'` (default `'all'`): a failed locator prints an ARIA
snapshot and/or `prettyDOM` HTML of the subtree it searched. This directly
softens the AGENTS.md finding that a failing retrying matcher costs ~15s and
says nothing — the timeout still costs, but the output finally shows what the
DOM held. Nothing to adopt in test code; consider `'aria'` if `'all'` proves
noisy for our large fixtures.

### Trace View — provider-independent replay, plus `mark()`

`browser.traceView: true` (experimental) records every action, assertion and
lifecycle step with DOM snapshots, replayable from the browser UI, Vitest UI,
or the HTML reporter — headless CI failures included. This is Vitest-native
and separate from 4.1's Playwright `browser.trace` (whose guide moved to
`playwright-traces.md`; both coexist).

Two annotation hooks make it ours:

- `page.mark(name, options?)` from tests — also a callback form that opens a
  trace *group* around a body.
- `context.mark(name, { kind })` inside **custom commands** — which means the
  `mouseDown` / `mouseMove` / `mouseUp` commands in
  `packages/core/vitest.browser.commands.ts` can annotate each gesture step:

```ts
export const mouseDown: BrowserCommand<[x: number, y: number]> = async (context, x, y) => {
  await context.mark(`mouseDown @ ${x},${y}`, { kind: 'action' })
  const { page, x: px, y: py } = await toPageCoordinates(context, x, y)
  await page.mouse.move(px, py)
  await page.mouse.down()
}
```

The split-drag `beforeEach` chains (Slider, Splitter) become self-documenting
in a replay. `context.mark` is a no-op when tracing is off, so the annotation
can land unconditionally.

### `utils.aria` — the ARIA tree as a queryable value (experimental)

```ts
import { utils } from 'vitest/browser'

const tree = utils.aria.generateAriaTree(document.body)
const yaml = utils.aria.renderAriaNode(tree)
```

The machinery under ARIA snapshots, exposed programmatically. Candidate uses
here: census-style assertions that *diff* the accessibility tree between
states (menu closed vs open) without one snapshot per state, and probe output
that is semantically meaningful instead of `outerHTML` dumps. Experimental —
pin expectations to behavior we verify, not to the docs.

### `vi.when` + `toHaveBeenExhausted`

Declarative per-argument mock behaviors with consumable budgets:

```ts
vi.when(spy)
  .calledWith('theme')
  .thenReturn('light') // indefinite fallback
  .thenReturn('dark', { times: 2 }) // consumed first, LIFO

expect(spy).toHaveBeenExhausted() // all limited behaviors consumed
```

NavigationMenu's hoisted `@vueuse/core` factory with per-test
`vi.mocked(useDebounceFn).mockImplementation(...)` swaps is the natural
beneficiary — argument-matched behaviors replace hand-rolled dispatch, and
`toHaveBeenExhausted` asserts a choreographed mock was fully consumed rather
than merely called. DX, not new coverage; adopt opportunistically.

### Shared Vite server for inline projects

v5 makes inline projects share the root Vite server by default. Our
three-project split (`node` / `unit` / `browser`) currently pays per-project
startup. *[unverified: whether the browser project participates and what it
saves — measure suite wall-clock before/after at upgrade time; the baseline
today is 25.80s total.]*

---

## Part 3 — Breaking sweeps, with measured blast radius

### 1. `clearMocks: true` becomes the default

`vi.clearAllMocks()` now runs before every test: call history
(`mock.calls`, `mock.results`) is wiped, **implementations are kept**. That
second half matters: NavigationMenu's `mockImplementation` swaps survive
unchanged. What breaks is the cross-test accumulation pattern AGENTS.md
explicitly blessed ("`toHaveBeenCalledTimes(1)`, then `(2)` still port
unchanged").

**Measured blast radius — 7 browser files, and this is now FIXED.** An earlier
draft of this section predicted 8 from a grep. Setting `clearMocks: true` on
the browser project under 4.1.10 and running the suite gave the real number:

```
Combobox, Listbox, NumberField, RadioGroup, Select, Slider, Switch
  — 7 files, 7 tests, each at its `toHaveBeenCalledTimes(2)` assertion
```

**`Checkbox` is not affected**, because its second hook performs *both*
submits itself and clears the spy at `Checkbox.browser.test.ts:231`. It was
already the self-contained pattern the other seven needed. (Mechanism, read
from v5 source: `clearModuleMocks` is called from `onBeforeTryTask`
(`runtime/runners/test.ts:177`), which `runtime/runner/run.ts:628` invokes
*before* the `beforeEach` chain at `:635` — so a hook that records its own
calls is safe; only history carried from a *previous test* is wiped.)

Resolved by taking the second option below rather than the recommended first:

- ~~`clearMocks: false` in the root config~~ — no longer needed; and
- **each test now owns its count** (`times(1)` + `mock.results[0]`), with
  `handleSubmit.mockClear()` in the form block's `beforeEach`. The assertion
  count per test is unchanged, so `port:parity` stays clean (87/87), and the
  block name `'should trigger submit once'` — false in all seven — became
  true. Verified green both with and without `clearMocks: true`.

The jsdom originals still carry the ladder. They are the retained comparison
suite, so that is left alone deliberately.

### 2. `render` becomes async in `vitest-browser-vue`

**Blocked on an unpublished package.** `vitest-browser-vue` has no v5 release:
latest is **2.1.0**, peering `vitest: ^4.0.0-0`, and all 89 browser files
import its `render`. The upgrade cannot be done supported until a v5-compatible
release ships. It will *probably* work under a peer override — the package
consumes only `page`, `server` and `utils` from `vitest/browser` plus
`beforeEach` from `vitest`, and all four survive in v5 (checked against
`packages/browser/context.d.ts` @ `v5.0.0-rc.1`, where `utils` also gains an
experimental `aria` namespace) — but that is an override, not support.
*[the override itself is unverified — not attempted]*

Every one of the 90 browser files calls `render()` synchronously — in
`setup()` helpers, `beforeEach` hooks, and the shared `src/test/browser.ts`
adapter used by the five largest ports. The change is mechanical
(`await render(...)`, helpers become async, callers await them) and
codemod-able; the adapter concentrates the change for its five consumers.
Note our own AGENTS.md finding that 4.1's `render` thenable does **not** call
`nextTick` — re-verify what awaiting v5's promise actually settles, and
whether any port's carefully-preserved synchronous read after `render`
changes meaning. *[unverified until the upgrade branch runs]*

### 3. `expect.poll` rejects on timeout; unawaited async assertions fail

Both are hardening we want, and both can flush latent flakiness out of the
ported wait loops:

- a poll that only passed on a late attempt now fails with
  `didn't resolve in time` — any `expect.poll` calibrated tight (virtualizer
  settling in Combobox, the render-ladder waits) may need explicit `timeout`
  raises rather than silent late passes;
- a forgotten `await` on `expect.element(...)` / `toMatchFileSnapshot`
  becomes a test failure instead of a warning. The ports were audited for
  this during migration, but the guarantee becomes mechanical.

### 4. Small print

- **`testNamePattern` joins with `' > '`** — affects `-t` invocations that
  span suite/test boundaries; our port scripts match names structurally, but
  any documented `vitest -t 'suite test'` recipes need the new separator.
- **Reports/artifacts move to a `.vitest` directory**; `toMatchScreenshot`
  gets `browser.expect.toMatchScreenshot.screenshotDirectory` (n/a — no
  screenshots here). Check nothing hardcodes old output paths.
- **Locators passed to custom commands are serialized as objects** — our
  mouse commands take plain numbers, unaffected (measured: signature check).
- **Fake timers now mock `Temporal`**, automock behavior in the browser
  changed, benchmarking API rewritten — none used here.

---

## Upgrade plan, in order

**Steps 0a–0c are done** — landed on 4.1.10, suite green, all three oracles
clean (186 files / 3441 passing + 20 expected fails; `port:parity` 87/87).
They were the parts of the upgrade that could be paid for in advance, and each
is an improvement on its own terms:

- **0a. The 7 order-coupled form tests own their counts.** Green with *and*
  without `clearMocks: true`, so the v5 default needs no override.
- **0b. The 7 zero-padding assertions are exact.** Green under a faithful
  port of v5's strict `toHaveTextContent`.
- **0c. `useBodyScrollLock`'s `vi.mock` is hoisted to the top level.** This
  was already printing a deprecation warning on every 4.1 run; it is an error
  in v5.
- **0d. `browser.locators.exact: true` is on** in both the `browser` and
  `cross-browser` configs (it exists since 4.1.3). Measured blast radius
  before fixing: 1496 pass, 2 fail, both Menubar's
  `getByRole('menuitem', { name: 'New Tab' })` against the name `New Tab ⌘ T`
  — fixed by naming the full string. The v5 bump will not change locator
  semantics for this suite any more.

What remains, once `vitest-browser-vue` ships a v5-compatible release (see
Part 3 §2 — this is the blocker, not the codemod):

1. Branch, bump `vitest`/`@vitest/browser-playwright` to the v5 RC
   (npm is at `5.0.0-rc.2`; the reference clone is pinned at `rc.1`).
   `clearMocks: false` is **not** needed.
2. Run the **async-`render` codemod** (adapter first, then the 89 files).
3. Full three-project run. Triage what is left: tight `expect.poll` timeouts
   (raise explicitly). Substring-reliant locators are already gone (0d).
4. Re-pin the reference clone (`pinned/5.x`) and update AGENTS.md: the
   substring-family gotchas become historical notes, and the retrying-matcher
   timing rules get re-verified against v5's `expect.element` source.
5. As follow-up passes: enable `traceView` locally; adopt `mark()` in the
   mouse commands; try `repeats` in place of the hand-rolled
   "N isolated runs" determinism checks.

## Verdict

v5 unlocks no test we cannot write today — the 4.1 backlog in
`IMPROVING-PORTED-TESTS.md` stays the priority for *new* value. What v5
changes is the defaults: exact locators and strict `toHaveTextContent` turn
this repo's two most-documented silent-vacuity hazards into non-issues, and
`errorFormat` + Trace View fix the debugging story. Upgrade **before** the
4.1 improvement backlog gets large: every improved test written against
exact-by-default locators is one less to re-audit afterwards.
