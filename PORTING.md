# PORTING.md — how the jsdom → browser-mode port actually runs

This is the operating manual for **removing jsdom from this repo**. All 97 jsdom test files
move: the 87 that touch the DOM go to Vitest Browser Mode, and the 10 that do not go to a
plain `node` project, which is the only exemption and is defined by a property of the file
rather than a judgement about value. The migration is finished when the `unit` project's
include list matches nothing.
`AGENTS.md` says *what this fork is for* and holds the translation table and the gotchas.
This document says *how the work is sequenced, what proves it worked, and what you do next*.

Read [Do this next](#do-this-next) if you just want the task list.

---

## 1. Why this needs a strategy at all

The obvious plan — "point an agent at each test file and ask it to rewrite it in browser
mode" — fails in a specific, predictable way, and it is worth understanding that failure
before anything else.

This effort is modelled on the [Bun-in-Rust rewrite](https://bun.com/blog/rewriting-bun-in-rust):
fan out many agents, have separate agents adversarially review the work, use a machine to
decide whether the result is correct. That worked because of one property Bun had:

> **The TypeScript test suite stayed fixed while the code moved underneath it.**

That gave them an *oracle* — a machine that answers "did this port preserve behavior?"
without a human reading the code. 1.4M assertions, all platforms green, merge the million
lines you didn't read.

**We do not have that property.** Here the tests *are* the thing being ported. Nothing is
holding still. Which means:

> A ported browser test that goes green proves nothing. It may be green because it
> asserts nothing.

That is not a hypothetical failure mode — it is the *default* one. An agent asked to make
`Slider.browser.test.ts` pass will, when a test is awkward, quietly drop an assertion,
soften `toHaveAttribute` into `toBeInTheDocument`, or rename the test to something it can
satisfy. Every one of those goes green. Fan out 64 agents against 97 files with no oracle
and you get 97 green files and zero information.

So the first job was not sharding or worktrees. It was **building an oracle**. That is
done — see the next section.

### The second reason: green files are not the deliverable

Per `AGENTS.md`, this fork exists to *learn browser mode* and to *record where jsdom was
the right call*. A fan-out that emits only ported test files throws that away. Every unit of
work here has to emit a **finding**, not just a file. See [FINDINGS.tsv](#5-findingstsv--the-actual-output).

---

## 2. The oracle — three checks, already built

Tooling lives in `packages/core/scripts/port/`. All of it is AST-based (TypeScript compiler
API), not regex, so `it.each`, template-literal names and nested describes are counted
correctly.

### 2.1 Structural parity — `port:parity`

```bash
pnpm --filter reka-ui port:parity            # every ported pair
pnpm --filter reka-ui port:parity Slider     # one component
pnpm --filter reka-ui port:parity Slider --complete
```

Compares the `describe`/`it` name tree and per-test `expect` count between
`X.test.ts` and `X.browser.test.ts`. **Exits 1** on any of:

| Failure | Means |
|---|---|
| `INVENTED` | a test in the port whose name is not in the original — renamed, or made up to replace one that would not port |
| `WEAKENED` | a matched test that now runs fewer `expect`s than the original |
| `SKIPPED` | quarantined (`.fails`/`.skip`/`.todo`) in the port but not the original, with no `@finding` tag — faking progress |
| `UNRECORDED` | an `@finding` tag naming a key that is not in `FINDINGS.tsv` — a fabricated excuse |

### Quarantine — when the port fails because it found a real bug

This will happen often; it is the point of the exercise. A red suite is useless as a
baseline, though — the next batch cannot tell its own breakage from inherited noise, and it
drags coverage runs down with it. So a test that fails **because the port found something**
gets quarantined rather than fixed or deleted:

```ts
// @finding Slider/Slider.test.ts#axe
it.fails('should pass axe accessibility tests', async () => {
```

Two rules, both machine-enforced:

1. **`.fails`, not `.skip`, unless the test cannot run at all.** `.fails` asserts the test
   fails, so the body still executes and still contributes coverage — which `.skip` throws
   away — and it flips **red the moment someone fixes the bug**, telling you the finding is
   stale. `.skip` is for tests that crash the runner or hang.
2. **`@finding <key>` is mandatory, and `<key>` must exist in the first column of
   `FINDINGS.tsv`.** Quarantine without a written finding is indistinguishable from giving
   up, so `port:parity` rejects it. This is what keeps the escape hatch honest: using it
   always costs you a finding.

A quarantined test is reported under `FINDING` and does **not** fail the run. Assertions are
still counted, so you cannot quarantine *and* gut a test.

Tests *missing* from the port are reported as **progress, not failure** — the port is
incremental by design. `--complete` flips that, and is how you certify a file as fully
ported.

#### The checklist view — `port:checklist`

```bash
pnpm --filter reka-ui port:checklist Slider
pnpm --filter reka-ui port:checklist Slider --complete       # exit 1 if anything is missing
pnpm --filter reka-ui port:checklist Slider --missing-only   # just the gaps
```

`port:parity` answers *"did the port weaken what it took"* and caps its missing list at five
names. This prints the **whole original tree in source order**, every node marked ✓ or ✗, with
quarantine tags inline. It is the "what do I port next" view, and the thing to run before
claiming a file is done:

```
✓ Slider/Slider.browser.test.ts   39/39 its, 15/15 describes

    ✓ given default Slider
      ✓ it should pass axe accessibility tests   .fails → Slider/Slider.test.ts#axe
      ✗ when disabled   ← L40 not ported
```

It also checks one thing `port:parity` structurally cannot: **`describe` blocks themselves.**
There they are only ever compared as part of an `it`'s key path, so a suite holding no tests —
all of them commented out, which `Slider` does twice — can vanish from a port without anything
noticing, and an invented suite goes unnoticed until it acquires a test. Verified against a
synthetic pair: `parity-names` reported neither the dropped empty `describe` nor the invented
one; the checklist reported both.

Same exit-code contract: missing is progress unless `--complete`, invented always fails.

This is why `AGENTS.md` requires verbatim `describe`/`it` names. That rule is now
machine-enforced, and it is the whole basis of the check.

### 2.2 Coverage parity — `port:coverage`

```bash
pnpm --filter reka-ui port:coverage Slider
pnpm --filter reka-ui port:coverage Slider --scope Slider   # component dir only
```

Runs both projects under istanbul, diffs the set of covered lines, **exits 1 if the browser
port reaches fewer lines than the jsdom original did**. Stronger than 2.1: name parity
proves the port kept its shape, this proves it still reaches the same code.

It also reports lines **gained**, which is where the thesis gets tested. Real result from a
single browser test mounting the Slider fixture:

```
GAINED — reached only by the port:
  shared/useSize.ts  L19, L24, L27, L31, L32, L34, L37, L38, L48
```

That is the real `ResizeObserver` path. Under jsdom the stub means those lines never
execute. One test, and the argument for the whole exercise is a number.

#### It retries once, and you want to know why

`collect()` re-runs a project whose report file never appeared. Concurrent agents each spawn
their own vitest, and a browser-project run that loses the race for Chromium dies without writing
a report — which from the script's side is indistinguishable from a port that does not compile.
Measured during T2 batch 1: one run in four exited 2 while three re-runs of the identical command
were clean. The retry is not papering over flake in the *tests*; it is stopping an agent from
"fixing" a file that was never broken. If both attempts fail, it still exits 2 with the output.

#### Allowed losses — `PORT-COVERAGE-ALLOW.tsv`

Occasionally a lost line is the *right* outcome, because jsdom only reached it by being jsdom.
The first one found: `Slider/utils.ts:109`, `linearScale`'s `input[0] === input[1]`
short-circuit. jsdom takes that branch on every pointer test, because the slider measures 0×0
so `rect.width - thumbWidth` is 0; the browser takes L110-111, the actual interpolation. The
jsdom suite reported that line as covered, and the arithmetic the component ships was never
executed.

"The browser covers less" is also exactly what a gutted port looks like, so the exemption works
like `@finding` — per line, and it costs you a written finding:

```
component  file             line  finding                                          why
Slider     Slider/utils.ts  109   Slider/Slider.test.ts#linear-scale-degenerate    jsdom-only zero-geometry branch
```

An allowance naming a key that is not in `FINDINGS.tsv` is reported as `UNRECORDED` and still
exits 1. Never exempt a whole file.

#### Gained lines need scrutiny too

The oracle exists to catch a port that lost something, so `GAINED` reads as free evidence for
the thesis. It is not. `shared/useForwardExpose` gained exactly one line —
`useForwardExpose.ts:68`, the `if (!ref) return` detach path — and **the browser had nothing to
do with it.** `vitest-browser-vue` registers `beforeEach(cleanup)` and `cleanup()` calls
`wrapper.unmount()`, so every ported test tears its component down; the jsdom original mounts
ten times and never unmounts once. A throwaway jsdom test doing `mount()` then
`wrapper.unmount()` covers the same line (istanbul hit count 1, measured).

So before writing a gained line into a finding, ask **whether the harness or the environment
earned it.** If `mount()` + `unmount()` under jsdom reproduces it, it is a gap in the original
suite, not a point for browser mode. Both are worth recording — but not as the same thing.

#### Files outside `src/<Component>/`

`port:coverage` used to resolve `src/<name>/<name>.browser.test.ts` and nothing else, so it
could not address a single composable — `shared/useForwardExpose.test.ts` lives directly in
`src/shared/`, as do all 13 T1 files and four of T4. It now falls back to searching `src/` for
`<name>.browser.test.ts`, and derives the component key from the **filename** rather than the
parent directory (`shared/` holds many unrelated ports, so the directory is not an identity).
`port:coverage useForwardExpose` works; the explicit-path form is unchanged.

### 2.3 Mutation — manual, T3 files only

For the mock-deleting files the claim is "the mock was hiding a real gap." Prove it: break
the component the way the mock papered over, then confirm **the browser test fails and the
jsdom test still passes**. That divergence is the finding.

**Do it on T2 files too — this advice used to say don't, and that was wrong.** It cost about a
minute on `Viewport` and produced that file's best row: renaming the attribute the component ships
turns three of five tests red and leaves the fourth green, because
`renders a <style> sibling whose text mentions [data-reka-viewport]` compares a string literal in
the template against a string literal in the test and nothing ties the injected stylesheet to the
element it selects. `Separator` is the same story — deleting `role="separator"` outright leaves its
only test green. **On a T2 file the mutation is cheap and it is often the only thing that
distinguishes a real test from a decorative one.** What stays T3-only is the *mock-deleting* form
of the claim, where you also have to show the jsdom test cannot fail.

**Done once, for `Slider`, and it worked.** Deleting `target.setPointerCapture(event.pointerId)`
from `SliderImpl.vue`'s `pointerdown` handler makes the browser port's
`should emit valueCommit on wrapper` fail and leaves the jsdom test green — its own
`hasPointerCapture: vi.fn().mockImplementation(id => id)` answers yes for a capture that was
never taken. The jsdom test cannot fail that mutation, in any version of the component.
Recorded as `Slider/Slider.test.ts#mutation`.

Cost: about two minutes. Edit the source, run **one** test in each project
(`vitest run --project=browser <file> -t "<name>"`), revert with the editor — not `git checkout`
— and confirm with `git diff --stat` that the source is clean again.

---

## 3. The inventory — `PORT-INVENTORY.tsv`

```bash
pnpm --filter reka-ui port:inventory
```

Regenerates `PORT-INVENTORY.tsv` at the repo root: one row per jsdom test file, with the
stubs it installs, the browser APIs it touches, whether it mounts a story fixture, whether a
port exists, and its tier. This is the `LIFETIMES.tsv` analogue from the Bun playbook — the
document that lets you shard the work and predict cost *before* spending any of it.
Regenerate it after every batch; the `ported` column is the progress bar.

```
tier             files  tests  off jsdom
T0-node             10    144    10
T1-pure              9     63     1
T2-mechanical       44    767     1
T3-payoff           23    448     1
T4-hostile          11    146     0
TOTAL               97   1568    13

still on jsdom: 84 files / 1368 tests
```

(1568 counts `it` call-sites; `it.each` expands to more at runtime, which is why the suite
reports ~2017 and why T0's 144 call-sites are the 571 tests quoted everywhere else.)

**The last line is the progress bar, and it is the only number that measures the goal.** The
column is `off jsdom`, not `ported`: a T0 file got there without a port, and the migration ends
when the `unit` project matches nothing — not when every file has a `.browser.test.ts`. `T0-node`
is read out of `NODE_TESTS` in `vite.config.ts` rather than re-derived, because the config is the
only thing that decides which environment a file actually runs in; a stale path there prints a
warning instead of quietly shrinking the tier.

Stubs that porting deletes — this is the deliverable, quantified:

| Stub | Files |
|---|---|
| `ResizeObserver` | 20 |
| `hasPointerCapture` / `setPointerCapture` | 10 |
| `scrollIntoView` | 6 |
| `getComputedStyle` | 5 |
| `getBoundingClientRect` | 3 |

### The tiers

**The tiers now order the work; they no longer decide whether it happens.** They were written
to answer "which files are worth porting", which was the right question when browser mode was
a second tier being evaluated. The question now is only "does this file touch the DOM" — see **T0-node** below — and
everything that does gets ported eventually. Read the tiers as difficulty and sequencing, and
as a prediction of how much each file will *teach*.

**T0-node (10 files, 571 tests) — DONE, and not a port at all.** Files that touch no DOM:
`Drawer/utils`, `Splitter/utils/{callPanelCallbacks,units,validation}`, `date/calendar`,
`index`, `shared/color/{gradient,utils}`, `shared/useNonce`, `shared/useSingleOrMultipleValue`.
They run in the `node` project with no environment and no setup file. This is the only exempt
category, it is defined by a property of the file rather than a judgement about value, and it
was **verified by running them**, not by grepping. 28% of the suite left jsdom for the cost of
a config block.

**T1-pure (13 files, 161 tests → 8 remaining)** — `shared/*` composables. Four of the thirteen
turned out to be DOM-free and moved to T0; `useForwardExpose` is ported; the remaining **8 are
DOM-dependent and are queued for browser mode**: `component/Arrow`, `getActiveElement`,
`useArrowNavigation`, `useComposing`, `useForwardProps`, `useForwardScopeId`,
`useIsUsingKeyboard`, `useSelectionBehavior`.
**Expect these to be boring, and port them anyway.** `T1-pure#tier-audit` checked the four
non-pure ones against the specific way each could have been passing for the wrong reason, and
all four came back negative — including `getActiveElement`, whose entire body is a shadow-DOM
retargeting loop that jsdom turns out to walk exactly as Chromium does. The measured cost of a
T1 port is ~1.5× wall clock for no new coverage. That is the honest price of deleting jsdom,
not an argument against doing it.

**T2-mechanical (49 files, 811 tests)** — attribute and role assertions, no stubs, no
geometry. The translation table in `AGENTS.md` handles these almost literally. Highest agent
leverage; this is the bulk of the work and the least interesting part of it.

**T3-payoff (23 files, 448 tests)** — every file that installs a stub or depends on
geometry: `Slider`, `ColorArea`, `ColorSlider`, `Combobox`, `Autocomplete`, `Select`,
`Listbox`, `Drawer`, `Checkbox`, … **This is where the thesis lives.** Mutation-verify these.
Every one of them should produce a finding.

**T4-hostile (12 files, 148 tests)** — these are rewrites, not ports:
- snapshots (5): `AspectRatio`, `Avatar`, `Popper`, `ScrollArea`, `Tree`
- `vi.mock` (4): `ConfigProvider`, `NavigationMenu`, `shared/useBodyScrollLock`, `shared/useNonce`
- fake timers (4): `Select`, `NavigationMenu`, `shared/useGraceArea`, `shared/useTypeahead`

Snapshots taken in jsdom will not match a real browser's DOM — expect to regenerate or
abandon them. `vi.mock` of a module works in browser mode but often mocks the very thing the
browser would do for real, which makes the port pointless as written. Do these last, by
hand.

Note `vi.spyOn` is **not** hostile — it works unchanged in browser mode, and is only a flag
in the TSV.

---

## 4. What we are deliberately *not* copying from the Bun playbook

**The scale.** Bun was 535k lines, 11 days, ~$165k, 64 concurrent agents. This is 23k lines
of test code across 97 files. Four worktrees × 16 agents is disproportionate — and here it is
actively harmful: every browser-mode worker spawns a Chromium, so parallel agents running
vitest fight over CPU and produce flake that looks exactly like porting bugs. **Use few,
large shards.** One agent per file, a handful at a time.

**Big-bang.** Bun ported everything at once because incremental means bridge code you hope
to delete later. We have a milder version of the same situation: jsdom goes away in the end,
but nothing has to be deleted to get there — the `unit` project simply shrinks until its
include list matches nothing. The three projects run side by side meanwhile, and the only
scaffolding is that shrinking exclude list. Incremental by tier is free, so take it.

**What we keep:** the prep documents, the trial run before the fan-out, split-context
adversarial review, failures-as-a-work-queue, and — the most transferable lesson in the whole
post — **fix the prompt, not the code.** When agents start weakening tests to make them
green, do not hand-fix the file. Add the rejection rule and re-run the batch.

---

## 5. FINDINGS.tsv — the actual output

Bun's workflow did not need this. Ours does: per `AGENTS.md`, "a finding that jsdom was the
right call for this file is a real result." Every ported file appends one row to
`FINDINGS.tsv` at the repo root:

```
file	verdict	stubs_deleted	stubs_kept	coverage_delta	notes
Slider/Slider.test.ts	ported	ResizeObserver,pointerCapture,scrollIntoView	-	+9/-0	real ResizeObserver covers useSize.ts L19-48; pointer tests need locator.dropTo, not synthetic pointerId
```

`verdict` is one of:

| Verdict | Meaning |
|---|---|
| `ported` | browser version is at least as strong; the jsdom file is now redundant |
| `ported-weaker` | it runs, but something was lost — say what in `notes` |
| `found-bug` | the port is faithful and **fails because it found something real**; the test is quarantined and this row is what its `@finding` tag points at |
| `found-gap` | the port is **green**, and in getting it green you proved something real is **untested or broken** — but rule 7 forbids the patch and an added `it` would be `INVENTED`, so there is nothing to quarantine |
| `node` | the file touches no DOM, so it moved to the `node` project instead — it never needed jsdom and does not need a browser either |
| `blocked` | cannot port yet; `notes` says what is missing |

> **`found-gap` was added after the first T2 batch**, which produced four rows that had to be
> filed as `ported` — a verdict meaning "fine" — while actually recording a real a11y violation
> (`Progress#indeterminate-untested`), a roving-focus implementation no test ever reaches
> (`Toolbar#roving-focus-untested`), an axe test that survives deleting the component's only
> attribute (`Separator#axe-near-vacuous`), and a component whose one job is asserted only in
> the negative (`Label#no-positive-case`). Burying those under `ported` is how the deliverable
> gets lost, since `FINDINGS.tsv` is the output and the test files are the byproduct. The four
> rows have been re-verdicted.
>
> Note what `found-gap` is *not*: it is not a softer `found-bug` for when you could not get the
> port green. If the port fails, quarantine it and use `found-bug`. `found-gap` is for the more
> insidious case — **everything passes and that is the problem.**

> **`stay-jsdom` is retired.** It was the right verdict while browser mode was a
> second tier being evaluated on its merits. It is not reachable now: the goal is to
> remove jsdom from the repo, so "the port gains nothing" is a note about *value*, not
> a reason to leave a file behind. Every DOM-touching file goes to `browser`; every
> DOM-free file goes to `node`. Rows written before this change have been re-verdicted,
> with the original reasoning kept in `notes` — the cost measurements are still true and
> still worth reading, they just no longer decide anything.

**This file is the project's output. The test files are a byproduct.** If a batch produces
green files and no rows here, the batch failed.

### FINDINGS.tsv feeds the public guide

`FINDINGS.tsv` is the raw log — one row per file, terse, machine-read (`port:parity` resolves
`@finding` tags against its first column). It is not the thing anyone outside this repo will
read.

`MIGRATING-TO-BROWSER-MODE.md` is. Whenever a row here turns out to generalise beyond the
component it came from, write the generalised version into that guide. A finding that only
ever lives in a TSV cell has been recorded, not communicated — and the guide is the artifact
this fork exists to produce. Negative results included: "we tried the browser and jsdom was
the right call" is more useful to a reader than another success story.

---

## 6. The per-file loop

One implementer, one reviewer, separate context windows. The reviewer never implements; the
implementer never reviews its own work.

**The two prompts live in `PORT-PROMPTS.md`.** They are a file rather than something typed per
batch for one reason: the most transferable lesson in the Bun post is *fix the prompt, not the
code*, and you cannot fix a prompt that was improvised into an agent call and discarded. When a
batch produces a weakened port, the change goes there and the batch re-runs — and the file has a
changelog so the next reader learns what went wrong rather than just inheriting the fix.

**Implementer gets:** the jsdom file, `AGENTS.md` (translation table + gotchas), the file's
row from `PORT-INVENTORY.tsv`. Produces `X.browser.test.ts` plus a `FINDINGS.tsv` row.

**Reviewer gets:** both files and nothing else — none of the implementer's reasoning. Its
brief is *not* Bun's "does this behave like the original." It is:

> **Does this test still test anything?** Assume the port is worse than the original and
> find how. Look for: an assertion that got weaker; a deleted mock replaced by an even more
> artificial browser workaround; a test that now passes vacuously; a `.element()` sync read
> racing Vue's flush where an awaited `expect.element` was needed.

**Then the machine decides:** `port:parity <Component>` and `port:coverage <Component>` must
both exit 0, and `port:checklist <Component>` says how much of the original is actually there.
Human judgement is for the finding, not for whether the port is sound.

### Rules for agents (learned the hard way, mostly by Bun)

1. **Never `git stash`, `git reset`, or any git command that does not commit a specific
   file.** Concurrent agents will destroy each other's work.
2. **Never leave the `unit` project broken.** The two projects run side by side on purpose.
   `pnpm --filter reka-ui exec vitest run --project=unit` must stay green at all times.
3. **Keep the original file.** Deletion is a per-component decision for later.
4. **Verbatim `describe`/`it` names.** If a name turns out to be a lie, fix the *test* so
   the name becomes true — do not rename. `port:parity` enforces this.
5. **If a ported test needs a new mock to pass, it belongs in `FINDINGS.tsv`, not in the
   file.** (This is the local form of Bun's "if you need a paragraph-long comment to justify
   the workaround, the code is wrong.")
6. Run vitest scoped to one file. Do not run the full suite inside an agent.
7. **Never change anything but test files.** Not component source, not story fixtures. When a
   port surfaces a real bug — and it will, that is the point — the deliverable is a
   `FINDINGS.tsv` row and a quarantined test, **not a patch.** A ported test that fails
   because it found something is a success.
8. **Never restore a green tick by weakening an assertion.** Disabling an axe rule, softening a
   matcher, or deleting the assertion that fails are all the same move, and it is the one
   failure mode this whole apparatus exists to catch. Quarantine it instead — see
   [Quarantine](#quarantine--when-the-port-fails-because-it-found-a-real-bug). Keep the
   assertion exactly as strong as it was; `it.fails` is what makes the suite green, not a
   softer expectation.

---

## Do this next

### Phase 0 — unblock. ✅ COMPLETE.

These were the equivalent of Bun's cyclic-dependency split: prerequisites that make the work
queue meaningful. Two of them were blockers hit while building the tooling.

State on exit: `unit` **97 files / 2015 tests green**. `browser` **3 files / 4 tests green, of
which 1 is an expected failure** — the Slider axe test, quarantined under the convention below
because it found a real bug. Both oracles run, both now see `.vue` bodies, and `port:parity`
exits 0.

- [x] **B1 — fix `vitest-axe` in the browser. Blocked 62 of 97 files. DONE.**
      Confirmed cause: `vitest-axe/dist/index.js:9` does `createRequire(import.meta.url)` then
      `require("axe-core")`; Vite externalises `node:module`, so the import throws before any
      test runs. `vitest-axe/matchers` separately pulls in `chalk`.
      Fixed with browser-safe shims in `packages/core/shims/vitest-axe/{index,matchers}.ts`,
      aliased in the `browser` project only, wrapping `axe-core` directly and dropping
      `createRequire` / `lodash-es` / `chalk`. `vitest.browser.setup.ts` calls `expect.extend`
      and mirrors the jsdom `configureAxe` options. Ported files keep the original import.
      `AGENTS.md`'s wrong "settled question" is corrected.
      **It immediately paid for itself** — see the axe row in `FINDINGS.tsv`. The jsdom axe
      test for Slider was vacuous (axe ran before Vue flushed, thumb still `display: none`,
      rule `inapplicable`), and the browser port surfaces a real violation. That test is
      **left failing on purpose**; the fix belongs in the story fixture, which is out of scope.

- [x] **B2 — `.vue` files are never instrumented. ROOT-CAUSED AND FIXED.**
      It was a version mismatch, not a config problem: `@vitest/coverage-istanbul@3.2.7`
      pinned against `vitest@4.1.10`. The 3.x provider filters through `test-exclude` with
      `extension: this.options.extension` — but vitest 4 **removed `coverage.extension` from
      the config schema**, so that is `undefined` and `test-exclude` falls back to its own
      default (`.js .cjs .mjs .ts .tsx .jsx`, no `.vue`). `shouldInstrument` then rejected
      every SFC silently. The 4.x provider dropped `test-exclude` for a glob-based
      `isIncluded` defaulting to `'**'`, with no extension filter at all.
      Fixed by bumping to `@vitest/coverage-istanbul@^4.1.10`. Verified: **13 `.vue` files
      instrumented in both projects**, previously 0, and `port:coverage Slider` now reports
      real SFC lines (`SliderImpl.vue`, `SliderRoot.vue`, `SliderVertical.vue`, …) on both
      sides — including a browser-only gain at `SliderThumbImpl.vue:40`.
      Note this also means **every coverage number this repo has ever published excluded
      every component.**

- [x] **B3 — the CSS shim. DONE.**
      Measured before fixing: the Slider fixture is **exactly 0×0** in Chromium without CSS,
      and `locator.click()` throws. Not "~0×0" — zero.
      Rather than hand-write a shim for the 641 distinct utility classes across the 97 story
      fixtures, the `browser` project now compiles Tailwind for real:
      `tailwind.browser.config.js` (trimmed copy of the Histoire config) →
      `vitest.browser.css` → imported by `vitest.browser.setup.ts`, wired via `css.postcss`
      on that project only. Fixture now measures 200×20 and clicks.
      Two deliberate deviations, documented in the config: **no animations** (so elements
      settle instantly for Playwright's actionability checks, matching jsdom's behaviour) and
      **colours kept** (axe's `color-contrast` rule is inert under jsdom but live in Chromium
      and needs real computed colours). `.histoire/style.css`'s `@layer components` block is
      mirrored, since several fixtures reference `.accordion-*` by name.
      `src/css-shim.browser.test.ts` is a permanent guard: if it fails, fix the CSS pipeline
      before touching any port.

### Phase 1 — trial run. Three files, by hand or one agent each.

Bun did 3 files before 1,448. The output of this phase is **not three ported files** — it is
the corrections to `AGENTS.md` and to the reviewer prompt.

- [x] **One T1 file (`shared/useForwardExpose`) — DONE. Verdict `stay-jsdom`, with numbers.**
      10/10 tests, 18/18 assertions, `port:parity --complete` and `port:checklist --complete`
      both clean, `port:coverage` loses nothing. Ported first try with no surprises, which is
      itself the result: a file that mocks nothing has nothing to delete, so the port is near
      character-identical to the original and the whole exercise bought one line of coverage
      that the browser did not earn (see below).
      Cost, steady state over 3 runs each: **1.11s → 1.72s total wall clock (1.5×)**, vitest
      `Duration` 539ms → 1.17s (2.2×), test execution 17ms → 45ms (2.7×).
      **The tier's stated rationale was wrong even though its conclusion was right.** §3 says a
      pure-function test "pays Chromium startup for it" — but a cold Chromium launch measured
      ~0.6s here, which is not a tax worth organising a migration around. Don't skip T1 because
      browser mode is slow; skip it because the port gains nothing.
      **Two things came out of it that outlive the file**, both in `FINDINGS.tsv`:
      `#auto-unmount` (the harness covers teardown the jsdom suite never did — and coverage
      *gains* need the same per-line scrutiny §2.2 demands of losses), and the
      `port:coverage` path fix in §2.2 below.
- [x] **One T2 file (`Label`) — DONE, 7/7, and it was a clean mechanical port.**
      `port:parity --complete`, `port:checklist --complete` and `port:coverage` all clean on the
      first run; 1 line gained, 0 lost; no stubs to delete, because the original installs none.
      `Checkbox` was the other candidate and was the wrong one — it is tiered T3 for its
      ResizeObserver stub, and the point of this box was to rehearse the *boring* path before
      committing 44 files to it.
      **The result that matters: "mechanical" did not mean "uninformative."** Three findings out
      of a 79-line file, and only one of them is about `Label`:
      `#click-fires-no-mousedown` is the generalisable one — `HTMLElement.click()` and VTU's
      `trigger('click')` dispatch a click and nothing else, so **every `mousedown`/`pointerdown`/
      focus handler in the library is unreachable from a jsdom test that clicks.** It also
      carries the counter-lesson: the gained line's `if` branch is `[0,2]`, never taken, so the
      behaviour behind the newly-covered line is still tested by nobody. Read the branch map,
      not the line count.
      `#empty-label-unclickable` is the practical one — an empty `<label>` is 0px wide, and
      Playwright will not click it, so the original's gesture cannot occur at all in a browser.
      `#no-positive-case` is a gap in the original suite that the port is forbidden to fix.
      **Two translation-table gaps came out of it**, both now in `AGENTS.md`: there is no
      `.html()` on a `vitest-browser-vue` result (the original is a `@testing-library/vue` file,
      and four of its seven tests assert exact HTML), and the `document.body.innerHTML = ''`
      teardown habit is simply deleted.
- [x] **Finish `Slider` (T3). DONE — 39/39.**
      `port:parity Slider --complete` and `port:coverage Slider` both exit 0. All five jsdom
      stubs deleted. 16 lines gained (`shared/useSize.ts` L19-48, `SliderThumbImpl.vue:40`,
      `Slider/utils.ts` L67-70 + L110-111), 1 lost and argued
      (`#linear-scale-degenerate`). Mutation-verified per §2.3 (`#mutation`).
      Five rows in `FINDINGS.tsv`; two of them are structural deviations from the original
      rather than bugs (`#form-submit-button`, `#home-end-name`).
      What it cost beyond the test file itself: three custom mouse commands
      (`vitest.browser.commands.ts`) so a gesture can be split across `beforeEach` hooks, and
      the `PORT-COVERAGE-ALLOW.tsv` mechanism in §2.2. Both are reusable by the rest of T3.
      **One rule needed relaxing.** Rule 4 says "if a name is a lie, fix the test so the name
      becomes true." Under `when vertical > when inverted` the original has
      `it('home should set value to 100')` asserting `0` — but the *assertion* is right (Home is
      semantic per ARIA APG and ignores `inverted`) and only the name is wrong. Applying rule 4
      literally would fail a correct component. Ported verbatim, recorded as `#home-end-name`.
      Rule 4 should read: fix the test when the name describes something that does not happen;
      when the name is simply mislabelled, port verbatim and write it down. Renaming stays
      banned either way.
- [x] **Update `AGENTS.md` gotchas with whatever these three taught you. DONE.**
      Slider's: atomic `dropTo`, `includeHidden`, `render` auto-unmount, inline templates
      compile. `useForwardExpose`'s: the auto-unmount coverage trap and its "do not book that
      as a browser-mode win" counter-rule. `Label`'s: two translation-table rows (there is no
      `.html()`; the `document.body.innerHTML` teardown is deleted) plus the two gotchas that
      generalise furthest — `.click()` fires only a click, and a zero-size element cannot be
      clicked.
      **The other output of Phase 1 was the prompts themselves**, which had been improvised per
      file and thrown away. They are now written down in `PORT-PROMPTS.md` — see §6.

### Phase 2 — fan out, tier by tier.

Order matters: T2 builds confidence in the loop cheaply, T3 is where the value is.

- [ ] **T2** (44 files, 12 done — count from `PORT-INVENTORY.tsv`, which supersedes the earlier 49) — batches of ~8, run as **3 concurrent agents at a time**, not 8.
      Every browser worker spawns a Chromium and they starve each other; see the `port:coverage`
      retry note in §2.2. After each batch: `port:inventory`, `port:parity` across all pairs,
      spot-read two files yourself.
      **Batch 1 — `Separator`, `Progress`, `Toolbar` — DONE, 8 tests, all oracles clean first
      try, zero coverage delta on all three.** The mechanical part of T2 is genuinely mechanical.
      The findings are not: 8 rows from 3 small files, and **the three most valuable ones are
      about the test suite rather than about the components.** `Separator#axe-context-detached-mount`
      applies to all 62 axe files (jsdom audits a detached copy, browser mode the live element, so
      rule counts legitimately differ). `Progress#retry-widens-timing` is a weakening the oracle
      cannot catch — a retrying matcher makes `describe('after 200ms')` pass anywhere in the sleep
      plus the retry budget. `Toolbar#roving-focus-untested` found an entire `RovingFocusGroup`
      implementation no test in either suite ever reaches.
      Three of the three also came back **0 lines gained**, against `Label`'s +1 — because none of
      these components has teardown code and none of the tests click. The `#auto-unmount` freebie
      is not universal.
      **Batch 2 — `Viewport`, `FocusGuards`, `VisuallyHidden`.** `Viewport`'s nonce assertion did
      fail in Chromium and is quarantined, **but the predicted cause was wrong** and the real one is
      worth more. It is not the spec's nonce hiding (that needs a header-delivered CSP and *empties*
      the attribute rather than removing it). It is that **Vue writes a DOM property instead of an
      attribute whenever `key in el`, and jsdom's IDL setter reflects into the content attribute
      while Chromium's does not** — so the assertion, and its comment claiming jsdom "exposes the
      attribute reliably", were testing jsdom. That generalises to every `attributes('x')` assertion
      on a prop-path binding and is the most systematic T2 hazard found so far.
      `FocusGuards` corrected a **factual error** in the translation table: `render` *throws* on
      `attachTo`, so the three files in this batch that mount with it would each have crashed on a
      literal port.
      **`VisuallyHidden` produced the batch's most consequential finding, and it is about the
      library rather than the harness.** `VisuallyHidden.vue:19` sets `aria-hidden="true"`
      **unconditionally** — the ternary tests a union type that admits only its two members — so
      sr-only text nested inside a control silently vanishes from the accessibility tree. Two
      independent accname implementations agree: `<button><VisuallyHidden>Save</VisuallyHidden></button>`
      is an axe `button-name` violation and `getByRole('button', { name: 'Save' })` matches zero.
      Direct `aria-labelledby` IDREFs still resolve, which is how `Tooltip` uses it, so most library
      usage is fine. Upstream v2 is byte-identical, so it is not a fork artifact.
      The same file also shows why its own test cannot fail: with `!important` overrides making the
      element fully visible, both original assertions still pass, because they read the **inline
      style string** and never the computed result. Recorded, not fixed — rule 7.
      **Batch 3 — `AlertDialog`, `Switch` — DONE, and between them they found the two silent
      vacuities that most threaten this whole effort**, because both leave the assertion count
      unchanged and therefore **pass `port:parity` while the test stops testing**:
      (1) `getByText` defaults to a **substring** match in vitest locators where
      `@testing-library`'s defaults to whole-string — `getByText('checked')` returns one element
      whose text is `unchecked`, so both of `Switch`'s toggle tests would have passed against a
      switch that never toggles; (2) **a locator is lazy**, so a bare `getBy*` — which in a
      `@testing-library` original *is* the assertion, via its throw — asserts nothing.
      **Swept every completed port for both.** Lazy-locator class clean; the four non-`exact`
      `getByText` calls all target correctly, verified by probe (`getByText` resolves to the
      deepest element containing the text, so `Label`'s clicks land on the `<label>`, not the
      wrapping div whose `textContent` is identical).
      `AlertDialog` also supplied what looked like the translation-table row that would have silently
      gutted every overlay port — "portalled content needs `page.getBy*`, not container-scoped
      `screen.getBy*`" — **which batch 4 then proved false**; see below. It did find a real axe
      violation on open (4.07:1 against 4.5:1, shim ruled out by diffing the palette against the
      Histoire config).
      `Switch`'s mutation matrix is the best T3-style evidence yet from a T2 file: `.prevent` on
      the Enter handler is load-bearing and **jsdom structurally cannot test it**, because in
      Chromium Enter on a `<button>` also synthesises a click, so without `preventDefault` the
      switch toggles twice and lands back where it started — browser red, jsdom green.
      **Batch 4 — `RovingFocus`, `Teleport`, `Toggle` — DONE, 20 tests, all oracles clean first try,
      16 findings. Its distinctive output is that it corrected two earlier batches rather than only
      adding to them**, which is a result about the apparatus and not about any component.
      `Teleport` disproved the batch-3 portal rule: `render`'s `getBy*` helpers bind to `baseElement`,
      which defaults to `document.body`, so `screen.getBy*` **does** reach teleported content and
      returns the same node `page` does — verified from `vitest-browser-vue` source and re-measured
      against `AlertDialog`'s own fixture (parent `BODY`, `container.contains` false, `screen` still
      matches 1). Only `screen.container` / `screen.locator` are container-scoped. The hazard runs
      the other way: document-scoped helpers also match **other renders** in the same test.
      **Note the shape of that error — it errs toward extra work, so nothing catches it.** Ports
      obeying it stayed green, because using `page` where `screen` would do costs nothing but a
      wrong belief; the oracles check structure, never a finding's reasoning. It was one batch away
      from being inherited by all eight T3 overlays. The apparatus rule that follows: **when a
      finding generalises to many files, measure it twice.**
      `RovingFocus` re-verdicted `Toolbar#roving-focus-untested` the same way — one istanbul run over
      all 12 consumer suites (149 tests) shows `handleFocus`/`handleKeydown`/`focusFirst` *are*
      reached; what is actually dead is narrower and now specified per branch (Home/End/PageUp/PageDown
      `[0,28]`, RTL `[48,0]`, `focusFirst`'s loop `[0,44]`, the public `allowShiftKey` prop). It also
      qualified the tab-order gotcha: `userEvent.tab()` **polyfills** sequential focus in JS, so an
      original that tabs that way ports one-for-one — the "unportable from jsdom" rule only ever
      applied to raw keydowns. And it found the best single argument for browser mode in T2 so far:
      RovingFocus's entire `isClickFocus` mouse-entry path (the Safari workaround) has **hit count 0
      across all 149 jsdom tests** and one `locator.click()` covers all four sites.
      `Toggle` returned the clean negative it was batched for — neither `Switch` vacuity applies,
      because the original is pure `@vue/test-utils` with no `@testing-library` query in it, which is
      a one-grep check worth doing first. It cost two deviations (a `beforeAll` `<style>`, since a
      contentless `<button>` is 0×0 — the second such case, and the default shape of a headless
      fixture; and `click({ force: true })` on the disabled control, since Playwright will not click
      a disabled element). Both revealed harness-shaped assertions: **VTU's `trigger` is a no-op on
      disabled elements**, so "clicking a disabled X does nothing" asserted VTU's guard, not the
      platform's. Two library-level `found-gap`s came with it — `togglePressed()` has no disabled
      guard, so `<Toggle as="div" disabled>` toggles freely, and the hidden form input is rendered
      without `:checked`, so a `Toggle` in a form **never submits a value** (`FormData.get` is `null`
      before and after toggling on, measured).
- [ ] **T3** (23 files) — one at a time, mutation-verified. Every file gets a
      `FINDINGS.tsv` row with a real observation, not "ported cleanly."
- [x] **T0** (10 files, 571 tests) — **DONE.** The DOM-free files now run in the `node`
      project. Identified by scanning all 97 for DOM signals, then verified by running them
      with `environment: 'node'` and no setup file. See `node-project#dom-free-files`.
- [ ] **T1** (8 remaining) — **REOPENED.** The earlier "closed, 12 skipped" decision was made
      under the old premise and is withdrawn; 4 of those 12 went to T0 and the other 8 are
      DOM-dependent, so they get ported like everything else. Expect them to be boring:
      `T1-pure#tier-audit` checked the four non-pure ones for vacuous assertions and found
      none, and the measured cost is ~1.5× wall clock for no new coverage. Port for jsdom
      removal, not for findings. Order: `useForwardProps`, `useForwardScopeId`, `useComposing`,
      `useSelectionBehavior` (mount-and-assert, mechanical), then `component/Arrow`,
      `getActiveElement`, `useArrowNavigation`, `useIsUsingKeyboard` (real input / focus).
- [ ] **T4** (12 files) — by hand, last. Decide per file whether a rewrite is worth it.

### Phase 3 — the write-up.

- [ ] Answer the deferred performance question from `AGENTS.md` — reframed, since browser mode
      is now the destination rather than a candidate: **what does an all-browser suite cost?**
      Measure the whole thing, not one file. The per-file numbers so far (~1.5× wall clock,
      ~0.6s cold Chromium) say it is affordable; the suite-level number is the one that decides
      whether CI needs sharding.
- [ ] **Delete the `unit` project and jsdom itself** — the point of the exercise. That means
      dropping `environment: 'jsdom'`, `vitest.setup.ts` (canvas mock, jest-dom matchers, the
      `getComputedStyle` patch) and the `jsdom` dependency, then confirming nothing else in the
      repo reaches for them.
- [ ] Per-component deletion decisions: which jsdom test files are now redundant.
- [ ] Roll `FINDINGS.tsv` up into prose. That is the artifact this fork exists to produce.

---

## Command reference

```bash
# porting tools
pnpm --filter reka-ui port:inventory              # regenerate PORT-INVENTORY.tsv + summary
pnpm --filter reka-ui port:parity                 # structural parity, all pairs
pnpm --filter reka-ui port:parity Slider --complete
pnpm --filter reka-ui port:checklist Slider       # describe/it tree, ✓ / ✗ per node
pnpm --filter reka-ui port:checklist Slider --missing-only
pnpm --filter reka-ui port:coverage Slider        # coverage parity for one component
                                                  # exemptions: PORT-COVERAGE-ALLOW.tsv

# tests
pnpm --filter reka-ui exec vitest run                    # all three projects
pnpm --filter reka-ui exec vitest run --project=node     # no DOM at all — the exempt files
pnpm --filter reka-ui exec vitest run --project=unit     # jsdom — shrinking; must never break
pnpm --filter reka-ui exec vitest run --project=browser  # the destination
```

| Project | Files | Tests |
|---|---|---|
| `node` | 10 | 571 |
| `unit` (jsdom) | 87 | 1444 |
| `browser` | 13 | 95 + 3 expected fail |

Baseline before this effort: **99 files / 2017 tests passing.**
Current: **110 files / 2110 passing + 3 expected fail.**

**Read `unit` carefully — it is not the progress bar yet.** It dropped 10 files to `node` and
will not drop another one until Phase 3, because ports keep their original alongside them on
purpose. Until those per-component deletion decisions, progress is the `still on jsdom` line
from `port:inventory`: files that are neither in the `node` project nor have a
`.browser.test.ts` next to them. That number is **76 files / 1328 `it` call-sites** as of the end
of the first T2 round (8 files ported). `unit`'s file count becomes the real measure only once deletions start, and it
has to reach zero either way.
