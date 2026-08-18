# PORTING.md — how the jsdom → browser-mode port actually runs

This is the operating manual for **giving every test a non-jsdom destination**. All 97 original
test files now have one: the 87 that touch the DOM have Vitest Browser Mode counterparts, and
the 10 that do not run in a plain `node` project. By explicit project-owner decision, the 87
original jsdom files remain runnable as a comparison corpus; completion means no contract lacks
a browser or node destination, not that the `unit` project is empty.
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
   fails, so the body executes up to the first failure and contributes that coverage — which
   `.skip` throws away — and it flips **red the moment the whole body passes**, telling you the
   finding is stale. It also absorbs any other assertion or hook failure for that test, so never
   leave unrelated assertions behind the expected failure. `.skip` is for tests that crash the
   runner or hang.
2. **`@finding <key>` is mandatory, and `<key>` must exist in the first column of
   `FINDINGS.tsv`.** Quarantine without a written finding is indistinguishable from giving
   up, so `port:parity` rejects it. This is what keeps the escape hatch honest: using it
   always costs you a finding.

A quarantined test is reported under `FINDING` and does **not** fail the run. Assertions are
still counted, but that alone does not keep them live: `it.fails` flips the whole test after the
first thrown assertion, so later assertions never run and unrelated failures are absorbed. If a
quarantined test has more than one assertion, relocate independent contracts to a hook shared by
at least one non-quarantined sibling (or an existing non-quarantined test shape). Count them before
quarantining; see the Collapsible finding.

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

The final batch exposed a second harness trap: `src/test/browser.ts`, the small VTU-compatible
adapter used by five large ports, was itself being counted as browser-only coverage. The oracle
now excludes that exact file, just as it excludes test files. Otherwise Autocomplete appeared to
gain 49 lines when only 25 belonged to production code, and TagsInput appeared to gain 29 when
the production gain was one.

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
T1-pure              9     63     9
T2-mechanical       44    767    44
T3-payoff           23    448    23
T4-hostile          11    146    11
TOTAL               97   1568    97

still on jsdom: 0 files / 0 tests
```

(1568 counts `it` call-sites; `it.each` expands to more at runtime, which is why the suite
reports ~2017 and why T0's 144 call-sites are the 571 tests quoted everywhere else.)

**The last line was the progress bar, and it reached zero.** The column is `off jsdom`, not
`ported`: a T0 file got there without a port, and the migration ends
when every DOM-dependent file has a browser counterpart. By explicit project-owner decision,
the original jsdom files remain runnable after the migration so both approaches can still be
diffed. `T0-node` is read out of `NODE_TESTS` in `vite.config.ts` rather than re-derived, because
the config is the
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

**T1-pure (13 files, 161 tests → DONE)** — `shared/*` composables. Four of the thirteen
turned out to be DOM-free and moved to T0; all nine DOM-dependent files are now ported:
`useForwardExpose`, `component/Arrow`, `getActiveElement`,
`useArrowNavigation`, `useComposing`, `useForwardProps`, `useForwardScopeId`,
`useIsUsingKeyboard`, `useSelectionBehavior`.
**Expect these to be boring, and port them anyway.** `T1-pure#tier-audit` checked the four
non-pure ones against the specific way each could have been passing for the wrong reason, and
all four came back negative — including `getActiveElement`, whose entire body is a shadow-DOM
retargeting loop that jsdom turns out to walk exactly as Chromium does. The measured cost of a
T1 port is ~1.5× wall clock for no new coverage. That is the honest price of deleting jsdom,
not an argument against doing it.

**T2-mechanical (44 files, 767 call-sites) — DONE.** Attribute and role assertions, no stubs, no
geometry. The translation table in `AGENTS.md` handles these almost literally. Highest agent
leverage; this is the bulk of the work and the least interesting part of it.

**T3-payoff (23 files, 448 tests)** — every file that installs a stub or depends on
geometry: `Slider`, `ColorArea`, `ColorSlider`, `Combobox`, `Autocomplete`, `Select`,
`Listbox`, `Drawer`, `Checkbox`, … **This is where the thesis lives.** Mutation-verify these.
Every one of them should produce a finding.

**T4-hostile (11 files, 146 call-sites) — DONE.** These were rewrites, not ports:
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
to delete later. We had a milder version: browser counterparts could land incrementally while
all three projects stayed green. The owner ultimately chose to retain the original jsdom files
as a runnable comparison corpus, so browser-counterpart inventory—not deletion—became the
completion measure. Incremental by tier was still free, so taking it was the right call.

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
> give every test a non-jsdom destination, so "the port gains nothing" is a note about
> *value*, not a reason to omit its browser counterpart. Every DOM-touching file goes to `browser`; every
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
3. **Keep the original file.** The project owner chose to retain all 87 jsdom originals as a
   runnable comparison corpus.
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

- [x] **T2** (44 files, all complete through batch 9 — count from `PORT-INVENTORY.tsv`, which supersedes the earlier 49) — batches of ~8, run as **3 concurrent agents at a time**, not 8.
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
      **Batch 5 — `Collapsible`, `Presence`, `Primitive` — DONE, 36 tests, 33 passing + 3
      expected failures; checklist, parity, focused runtime, and coverage gates all clean.**
      Coverage is Collapsible `+9/-0`, Presence `+6/-0`, Primitive `+0/-0`. Presence proves that
      jsdom's empty `animationName` turns an animation component into an instant-unmount component;
      Chromium reaches the real exit-animation path. Collapsible finds the platform-correct
      `hidden="until-found"` reflection and the more dangerous quarantine rule: one expected failure
      in a multi-assertion `it.fails` silently absorbs every unrelated failure in that test.
      Primitive catches a translation that looked equivalent on the live DOM but was weaker under
      mutation — a tag assertion cannot become a role assertion when the component chooses its own
      tag. The batch also invalidated the old retry recipe: retrying the condition immediately
      before a synchronous read pre-settles that very assertion. `Progress.browser.test.ts` and the
      shared guidance were corrected in this batch. A follow-up source audit removed all 14 actual
      `nextTick()` calls from completed browser ports: 2 were redundant before `expect.element`, 5
      became locator-existence waits, and 7 followed awaited real clicks. Presence's 500ms delayed-
      unmount mutation still fails both exact assertions, so the cleanup did not trade one-flush
      semantics for eventual success.
      **Batch 6 — `DateRangeField`, `Tabs`, `RadioGroup` — DONE, 32 `it` call-sites / 36 runtime
      tests, all green, nothing quarantined; every oracle clean first try** (coverage +5/-0, +16/-0,
      +26/-0). The batch was picked to answer two questions rather than to retire three files, and
      it answered both.
      **Question 1 — can the date family be ported at all?** It is 12 files holding 389 of the 664
      remaining T2 tests, several over 1000 lines, so `DateRangeField` (8 tests) went first as the
      template. The blocker is one line long and would have been misread by every one of them:
      **`userEvent.keyboard('{19}')` is not a keystroke.** vitest's Playwright provider checks the
      parsed key against a `VALID_KEYS` set and otherwise falls back to `insertText`, which fires no
      key events; a literal port passed 7 of 8 with the day segment silently never filling. Grepped
      to **8 sites in 4 files**, with the year sites (`{1980}`, `{2020}`, `{1111}`) flagged as needing
      per-site verification rather than a blind rewrite. Two results de-risk the rest of the family:
      `process.env.TZ` from `globalSetup` **does** reach Chromium (`America/New_York` measured inside
      the iframe on a Europe/Berlin host), so `ZonedDateTime` fixtures port unchanged; and `getByText`
      has **zero hits across the entire family**, so the substring vacuity is structurally absent for
      all 12. Segment traversal needed no geometry workaround and no gesture change.
      **Question 2 — does SSR work in the browser project?** Yes, unmodified, and `Accordion` is
      unblocked: `@vue/server-renderer`'s exports carry no `browser` condition, so Vite serves the
      esm-bundler string builder. `Tabs` did not take green as proof — it falsified both *negative*
      hydration assertions with a deliberately mismatched probe and mutation-verified the whole test
      by swapping `useId.ts`'s branch order. **The cost is not the SSR, it is the container**: an SSR
      test builds its own, `cleanup()` never removes it, and a live hydrated app then answers
      document-scoped queries for the rest of the file (`getByRole('tab')` returns 4, not 2). That is
      the instruction `Accordion` needs.
      **The batch's sharpest single finding is `Tabs#click-is-inert-in-jsdom`:** `TabsTrigger`
      activates on `@mousedown.left`, so under jsdom a VTU `trigger('click')` leaves the tab inactive
      with `TabsTrigger.vue:54` at hit count 0 — **clicking a tab does not change tabs there** — and
      neither suite has a click test, so the component's primary gesture is covered by nobody.
      **`RadioGroup` produced the batch's other general result, and it is about gestures:** a
      synthetic keypress has zero duration, so `{ArrowDown}` releases before the component's
      `setTimeout(0)` runs and selects nothing (1/15 vs 15/15 for the held form). `fireEvent.keyDown`
      never fires a keyup at all, which is why the keyup reset at `RadioGroupItem.vue:69` has hit
      count 0 across the whole jsdom file — the flag is stuck `true` for the rest of it. The held-key
      translation is therefore both the faithful one and the realistic one.
      **Two counterweights, both filed by the agents themselves, and both worth more than a win.**
      `Tabs` traced all 16 of its gained lines individually and found **every one is teardown** —
      `onUnmounted` hooks, unregister callbacks — i.e. the largest `GAINED` list T2 has produced was
      earned by `beforeEach(cleanup)` and not by Chromium. `RadioGroup` attributed its 26 per-describe:
      **Chromium earned 2, the harness earned 10**, one is incidental (`matchMedia` at module load via
      the `..` barrel, which jsdom lacks), and it found **no mutation that the browser catches and
      jsdom does not** — the win there is coverage and diagnosis, not a red test. It also filed two
      `found-gap`s where the port newly *covers* 20 lines of `focusFirst` while a no-op mutation of
      that same function leaves both suites green. Covered ≠ tested, for the third batch running.
      One open question, recorded rather than guessed: `duplicate-id-aria` audits 2 nodes under jsdom
      and 4 in Chromium, and the obvious explanations were ruled out.
      **Batch 7 — `Collection`, `Drawer/composables/useDrawerSnapPoints`, `Drawer`, `Stepper`,
      `Toast`, `ToggleGroup`, `Pagination`, `Editable` — DONE, 109 declared tests / 110 runtime,
      with two expected failures and every focused oracle clean.** Independent review changed the
      output materially: `Collection` now truly makes registration order differ from DOM order;
      five Drawer snap-math cases became mutation-sensitive; `Stepper` proves disabled input does
      not change selection despite Chromium blurring focus to BODY; `ToggleGroup` restored the
      original button-tag contract. `Toast` revealed that its old open axe audit never opened the
      delayed toast, then Chromium found two aria-hidden focus proxies and a 4.48:1 contrast issue.
      `Editable` found the batch's component bug: disabled Preview still enters edit mode. Drawer
      gained 36 lines from real geometry/input and carries six per-line jsdom-artifact allowances;
      the remaining files are coverage-neutral or small honest gains. The batch also added two
      generalized review rules: make a test's named premise real, and never treat a bundled mouse
      move as proof of a pointerdown handler.
      **Batch 8 — `ColorSwatch`, `ColorSwatchPicker`, `ColorField`, `Rating`, `TimeRangeField`,
      `MonthPicker`, `YearPicker`, `YearRangePicker`, `MonthRangePicker`, `DateRangePicker` — DONE,
      196 declared tests / 204 runtime, with one expected failure and every focused oracle clean.**
      Independent review again changed the result: exact values replaced self-fulfilling role/property
      queries and count-only date-range assertions; the DateRangePicker open axe audit now proves the
      calendar exists before auditing, and its closeOnSelect=false case proves selection happened.
      Chromium exposed ColorField's 1.4:1 input contrast and five misleading ColorSwatch warnings for
      supported transparent values. Real date input also established two reusable keyboard rules:
      impossible multi-character braced digits must become actual digit sequences, and held modifiers
      must be explicitly released because browser keyboard state survives later actions. Coverage stayed
      equal for six files; the meaningful gains came from real focus/input or a newly shipped open-state
      axe scenario, while Rating also documented barrel-import instrumentation and teardown-only gains.
      **Batch 9 — `Accordion`, `Calendar`, `DateField`, `DatePicker`, `Dialog`, `DismissableLayer`,
      `RangeCalendar`, `TimeField` — DONE, 327 declared tests / 329 runtime, 953 browser assertions
      versus 915 original, with every focused oracle clean. T2 is complete: all 44 mechanical files
      are off jsdom.** This batch made the review layer pay for itself repeatedly: exact segment text
      exposed substring assertions already true at `12`/`1980`; date/range tests now prove complete
      value and endpoint identity; disabled gestures prove delivery, prevention and unchanged state;
      open axe audits prove their popup/range premise first. Dialog's warning tests had been borrowing
      a warning from an outer instance because their click Promise was dropped, and its aria-hidden
      restoration hook is disabled under test mode in both projects. DismissableLayer replaced every
      fixed 1ms sleep with a named Vue/task boundary and now distinguishes deferred touch pointerdown
      from click using exact event identity. Accordion proved SSR hydration in-browser and cleans its
      manual container. The inventory now reports 68/97 files off jsdom, leaving only T3/T4.
- [x] **T3** (23/23 files complete) — one at a time, mutation-verified. Every file gets a
      `FINDINGS.tsv` row with a real observation, not "ported cleanly."
  - [x] **First payoff slice: `Slider`, `Combobox`, `useSize`, `Popover`, `Splitter`,
        `ContextMenu`, `Checkbox`.** `useSize` removes the observer replacement and mutation-proves both its
        synchronous initial-offset path and native callback. Popover removes the same stub but
        honestly records that its axe-only file still does not assert exact geometry; its open
        audit now waits for visible, positioned content and runs `aria-dialog-name`. Splitter
        deletes the callback registry/manual-fire apparatus; disabling native observation makes
        Chromium retain a 3.4375px sidebar while jsdom stays green, and review replaced a bare rAF
        with an emitted 300px initialization premise. ContextMenu uses a trusted right click and
        exact click-anchored Popper coordinates; mutating the trigger anchor to 0,0 fails only the
        browser port. Checkbox deletes a stale, unreachable ResizeObserver replacement and records
        the honest zero-payoff result; real submits and isolated form state replace its synthetic,
        order-dependent setup. All five new ports have clean focused oracles and independent review.
  - [x] **Final payoff slice — DONE.** `Autocomplete`, `ColorArea`, `ColorSlider`,
        `Drawer.snap`, `useSwipeDismiss`, `DropdownMenu`, `DropdownMenuFilter`, `FocusScope`,
        `HoverCard`, `Listbox`, `Menu`, `Menubar`, `NumberField`, `PinInput`, `TagsInput` and
        `Tooltip` close the tier. The ports delete the remaining compensating observer,
        pointer-capture, scrolling, layout and computed-style replacements. Trusted input
        exposed nine browser-only failing tests across eight findings covering contrast, pending
        hover focus and PinInput placeholder state; every faithful failure is quarantined with a
        live finding key.
- [x] **T0** (10 files, 571 tests) — **DONE.** The DOM-free files now run in the `node`
      project. Identified by scanning all 97 for DOM signals, then verified by running them
      with `environment: 'node'` and no setup file. See `node-project#dom-free-files`.
- [x] **T1** (8 reopened ports) — **DONE.** The earlier "closed, 12 skipped" decision was made
      under the old premise and is withdrawn; 4 of those 12 went to T0 and the other 8 are
      DOM-dependent, so they were ported like everything else. As predicted, most were boring:
      `T1-pure#tier-audit` checked the four non-pure ones for vacuous assertions and found
      none, and six of eight ports gained no lines. The exceptions were useful negative results:
      `Arrow`'s axe test is fully unfailable, `useArrowNavigation` exposed three structurally-equal
      wrong-node assertions, and independent review found masked guards in
      `useSelectionBehavior` and `getActiveElement`. All eight focused browser/unit runs and all
      three per-file oracles are clean. The inventory now reports all 9 T1 files off jsdom.
- [x] **T4** (11/11 files) — completed by hand after the four frontiers established the patterns.
      **Reordered: the four pattern-frontier files run first** — `Select` (fake timers × real
      input), `NavigationMenu` (`vi.mock` in the browser), `Combobox` (expectations derived from
      stubbed geometry; T3 but frontier), `ScrollArea` (snapshots of a really-positioned DOM) —
      so every pattern class has a worked precedent before the mechanical remainder is delegated.
  - [x] **`Select` — DONE, 29/29, all three oracles clean** (parity 40/38, coverage +40/−0 with
        21 argued allow lines). The frontier answers: `vi.useFakeTimers()` works in the tester
        iframe but freezes rAF/`performance` (default `toFake`), so positioning-dependent focus
        fires arbitrarily late — measured stealing focus mid-keystroke; modal
        `body { pointer-events: none }` is enforced by Chromium hit-testing, forced clicks
        included, so two original hooks were gestures no user can make; the outside-press
        dismiss path was zombie-covered in jsdom (bisected: 0 lines in isolation, all lines in
        the full file — deferred `setTimeout(0)` listener registration never fires inside one
        test's microtask hook chain); and the double-pointerup selection ritual evaporates under
        real clicks. Nine findings in `FINDINGS.tsv` under `Select/Select.test.ts*`.
  - [x] **`NavigationMenu` — DONE, 13/13 (one `it.fails`), all three oracles clean, coverage
        +100/−0** with no allow lines — the largest genuinely-earned GAINED list yet, because
        real hovers reach the enter/leave and viewport-measurement surface synthetic events
        never did. Frontier answers: `vi.mock` + `importActual` + per-test `mockImplementation`
        work in browser mode unchanged (probed before porting); a real mouse click cannot avoid
        hovering first, which rewrites what click tests mean on hover-triggered components; the
        frozen clock starves the ResizeObserver→CSS-var pipeline, making open menu content
        unhoverable under fake timers; and axe surfaced a real `aria-hidden-focus` violation on
        the focus proxy that jsdom filed under `incomplete`. Seven findings under
        `NavigationMenu/NavigationMenu.test.ts*`.
  - [x] **`Combobox` — DONE, 45/45 (one `it.fails`), all three oracles clean, coverage +13/−0
        with 2 argued allow lines.** The geometry frontier: the prototype rect stub feeding the
        virtualizer deletes 1:1 against the real 200px viewport (with the settle behaviour the
        stub hid — all rows mount, then trim, so the subset assertion owns the wait), the
        narrated blur simulations become one real click, and the file produced the migration's
        first **deliberately kept stub** (the popper describe's choreographed RO — construct,
        not compensate) plus its first **rebased numeric expectation** (slot renders 3/4 →
        4/4, measured deterministic). axe: the open popup fails AA contrast by 0.06,
        quarantined. Third bisected zombie-coverage instance (`ListboxRoot.vue:167` — covered
        by the full file, by no describe in isolation). Seven findings under
        `Combobox/Combobox.test.ts*`.
  - [x] **`ScrollArea` — DONE, 9/9, all three oracles clean, coverage +1/−0 with 4 argued allow
        lines.** The snapshot frontier: browser snapshots carry measured thumb geometry
        (locally deterministic, font-dependent across machines — normalize with a serializer if
        cross-machine CI ever matters), `scrollTop = 40` is a real scroll whose event the
        browser fires itself, and the prototype geometry stub turned out to be silently
        *authoring* the fixture (a headless scrollbar has no intrinsic thickness; the port
        declares the stub's 10px as real CSS). Fourth zombie-coverage instance plus a
        stub-timing artifact, both bisected. Five findings under
        `ScrollArea/ScrollArea.test.ts*`.

  **The frontier is closed.** All four pattern classes — fake timers × real input, `vi.mock`,
  stub-derived geometry/virtualization, and DOM snapshots — now have a completed, oracle-clean
  precedent, and every sharp edge found on the way is in `AGENTS.md`'s gotcha list. Those
  precedents carried through the remaining files in the final batch.

  **The tier is complete.** `AspectRatio`, `Avatar`, `ConfigProvider`, `Popper`, `Tree`,
  `useBodyScrollLock`, `useGraceArea` and `useTypeahead` joined the four frontier files. Snapshot,
  module-mock and fake-timer behavior all run in Chromium; all 87 DOM-dependent pairs now pass
  checklist, name/assertion parity and coverage parity.

### Phase 3 — the write-up. DONE.

- [x] **Measure the whole suite.** On this machine, Chromium runs 89 files / 1446 runtime tests
      (1426 passing + 20 expected failures) in **12.62s wall clock**. The retained jsdom project
      runs 87 files / 1444 tests in **11.16s**. Browser mode therefore costs about **1.13×** at
      suite scale, far below the 1.5× boring-file observation. All three projects together run
      186 files / 3461 tests in **25.80s**.
- [x] **Resolve jsdom retention.** The project owner explicitly chose to keep every original
      jsdom test. The `unit` project, `vitest.setup.ts` and jsdom dependency therefore remain;
      this is an intentional comparison corpus, not unfinished migration work.
- [x] **Resolve per-component deletion.** Retain all 87 originals beside their browser ports.
      `port:inventory` reports 97/97 files off jsdom because each DOM-dependent contract now has
      a browser destination, while the originals remain available for direct comparison.
- [x] **Roll findings into prose.** The completed record shows the recurring payoff: native
      layout/observer/pointer/focus paths replace compensating stubs; trusted gestures remove
      synthetic compatibility rituals and incidental zombie coverage; Chromium axe converts
      jsdom `incomplete` or blind color checks into actionable failures. The honest counterweight
      is equally clear: pure composables, fake-timer utilities and some snapshot ports gain no
      coverage and cost modestly more, but remain affordable at suite scale.

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
pnpm --filter reka-ui exec vitest run --project=unit     # retained jsdom comparison suite
pnpm --filter reka-ui exec vitest run --project=browser  # the destination
```

| Project | Files | Tests |
|---|---|---|
| `node` | 10 | 571 |
| `unit` (jsdom) | 87 | 1444 |
| `browser` | 89 | 1426 + 20 expected fail |

Baseline before this effort: **99 files / 2017 tests passing.**
Current: **186 files / 3441 passing + 20 expected fail**, 25.80s wall clock for all three projects.

**Read `unit` carefully — it is the retained comparison corpus, not the progress bar.** The
project owner chose to keep all 87 originals runnable. Progress is the `still on jsdom` line from
`port:inventory`: files that are neither in `node` nor have a browser counterpart. It is now
**0 files / 0 call-sites**, and all 87 browser/jsdom pairs are structurally and coverage clean.
