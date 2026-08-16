# PORT-PROMPTS.md — the two prompts the fan-out runs on

`PORTING.md` §6 specifies the per-file loop: one implementer, one reviewer, separate context
windows, then the machine decides. This file holds the actual prompts, because the most
transferable lesson from the Bun playbook is **fix the prompt, not the code** — and you cannot
fix a prompt that was improvised into an agent call and then thrown away.

When a batch produces a bad port, the change goes here, and the batch re-runs. Every edit to
this file should say what went wrong in the changelog at the bottom.

`{COMPONENT}` is the component key (`Separator`, `shared/useForwardProps`, …).
`{FILE}` is the jsdom file, repo-relative from `packages/core/src/`.

---

## Implementer prompt

> You are porting one jsdom test file in the reka-ui fork at
> `/Users/alexanderopalic/Projects/reka-ui-bench-mark` to Vitest Browser Mode.
>
> **Your file: `packages/core/src/{FILE}`. Port it to `packages/core/src/{COMPONENT}.browser.test.ts`.**
>
> **Read `AGENTS.md` first, in full.** It has the translation table and the gotchas list, and
> the gotchas are all things that already cost someone an hour. Then read
> `PORTING.md` §2 (the three oracles), §5 (the verdict column — note `found-gap`, for when the
> port is green and that is precisely the problem) and §6 (the rules for agents). Do not skip these on the
> grounds that your file looks small — the smallest file ported so far, a 79-line `Label` test,
> produced three findings.
>
> ### What you produce
>
> 1. `packages/core/src/{COMPONENT}.browser.test.ts`
> 2. One or more rows appended to `FINDINGS.tsv` at the repo root.
>
> **The findings row is not paperwork, it is the deliverable.** A batch that produces green
> files and no findings has failed. If the port genuinely taught you nothing, say that in the
> row and say what you checked to conclude it — "ported cleanly" on its own is a non-answer.
>
> ### Hard rules — these are machine-enforced, you will not get away with breaking them
>
> - **Verbatim `describe` and `it` names.** `port:parity` diffs the name tree and fails on any
>   name in your port that is not in the original. Do not rename, do not "clarify", do not fix
>   a typo.
> - **Never weaken an assertion to get a green tick.** Softening `toHaveAttribute` into
>   `toBeInTheDocument`, disabling an axe rule, deleting the assertion that fails — these are
>   the same move, and this entire apparatus exists to catch it. `port:parity` counts `expect`
>   calls per test and fails on any test that now runs fewer than the original.
> - **If the port fails because it found something real, quarantine it — do not fix it.**
>   ```ts
>   // @finding {FILE}#some-key
>   it.fails('exact original name', async () => {
>     // body unchanged — do NOT weaken the assertion that fails
>   })
>   ```
>   `.fails`, not `.skip`, so the body still runs and still contributes coverage, and so the
>   test turns red the day someone fixes the bug. The `@finding` key must exist in the first
>   column of `FINDINGS.tsv` or `port:parity` fails the file. Quarantine always costs you a
>   written finding; that is the point.
> - **Change nothing but test files.** Not component source, not story fixtures, not config.
>   A port that surfaces a real bug is a success, and its deliverable is a finding plus a
>   quarantined test, never a patch.
> - **Never `git stash`, `git reset`, `git checkout`, or any git command that does not commit a
>   named file.** Other agents are working in this tree concurrently and you will destroy their
>   work.
> - **Never leave the `unit` (jsdom) project broken.** It runs alongside the browser project on
>   purpose. You are adding a file, not replacing one — **keep the original `.test.ts`.**
> - Run vitest scoped to your file only. Never run the full suite.
>
> ### Two things that will bite you immediately
>
> - **`render` throws on `attachTo`.** Drop the option; do not translate it to
>   `container: document.body`. If every test in your original mounts with
>   `attachTo: document.body`, a literal port crashes on the first one.
> - **`getByText` matches a SUBSTRING here.** `@testing-library`'s matches the whole string. Pass
>   `{ exact: true }`. `getByText('checked')` otherwise returns the element reading `unchecked`,
>   and your toggle test passes against a component that never toggles.
> - **A locator is lazy — `getBy*` does not throw.** In a `@testing-library` original the throw *is*
>   the assertion. Translate a bare `getByTestId(…)` to
>   `await expect.element(…).toBeInTheDocument()`, or the test has no assertion left.
> - **Portalled content (Dialog, Popover, Select, Tooltip, Toast, menus) is reachable from BOTH
>   `screen.getBy*` and `page.getBy*`** — they return the same node. `render`'s helpers bind to
>   `baseElement`, which defaults to `document.body`. Only `screen.container` and `screen.locator`
>   are container-scoped. The trap runs the other way: because the helpers are document-scoped,
>   `screen.getBy*` also matches **other renders** in the same test.
> - **A `attributes('x')` assertion may be testing jsdom, not the platform.** Vue writes a DOM
>   *property* rather than an attribute whenever `key in el`, and jsdom's IDL setters reflect into
>   the content attribute where Chromium's often do not. If an attribute assertion fails in the
>   browser, check `el.x` before concluding the port is broken — and quarantine rather than
>   switching the assertion to the property.
>
> ### The part that is actually hard
>
> A ported test that goes green proves nothing — it may be green because it asserts nothing.
> Assume that of your own work and go looking. Two specific things to check before you claim
> the file is done:
>
> - **Was the original test vacuous?** `Slider`'s axe test called `axe()` synchronously after
>   `mount()`, before Vue flushed, so the only interactive element still had `display: none`,
>   axe skipped it, and the rule came back `inapplicable`. A green test asserting nothing. If
>   your file has an axe test, **probe `results.passes` / `results.inapplicable` /
>   `results.incomplete` in BOTH environments** and say in the finding which rules actually ran.
>   Three notes, all learned by measurement:
>   - **Read `incomplete` too.** Under jsdom `color-contrast` lands in `incomplete` with *zero
>     nodes*, not in `inapplicable`. A census reading only the other two buckets reports "the rule
>     ran" when nothing was examined.
>   - **Expect the answer to be "not vacuous."** `Slider` was vacuous for a specific reason — an
>     element hidden at mount time. `Progress` and `Toolbar` both turned out fine. A negative
>     result here is the normal one and is worth stating plainly.
>   - **`color-contrast` is usually the only rule browser mode adds**, and it is not a formality:
>     `Progress` measured 4.85:1 against a 4.5:1 threshold.
> - **Could the test fail at all?** Separate from vacuity, and more damning. Mutate the component
>   — delete the attribute or handler the test is about — and check the test goes red. `Separator`'s
>   only test survives **deleting `role="separator"` entirely**: zero violations *and* zero passes,
>   green either way. If your test cannot fail, that is a `found-gap` row.
> - **Is your ported test vacuous?** If a test asserts a negative ("does not focus", "does not
>   emit"), check that it can distinguish — construct the positive case in a throwaway probe,
>   confirm it behaves differently, then delete the probe. `Label`'s two negative click tests
>   would both have passed against a component that did nothing at all.
> - **Did a retrying matcher widen a timing assertion?** This is the likeliest way a mechanically
>   correct T2 port gets quietly weaker, and **the oracle cannot catch it** — the assertion count
>   goes up, not down. `Progress` has `describe('after 200ms')` with a synchronous
>   `expect(wrapper.html()).toContain(…)`; translated to `await expect.element(…)` it passes
>   anywhere inside the sleep *plus* the retry budget, and would stay green if the fixture flipped
>   at 900ms. When a `describe` name mentions a duration, assert **twice** — retrying matcher to
>   settle the flush, then the original's exact synchronous read.
>
> **A green oracle is not the finish line.** All three files in the first batch came back
> `0 lost, 0 gained`, and every real result came from probing past the oracles — mutating the
> component to see whether the test could fail, reading the istanbul map for code no test reaches
> (`Toolbar` found an entire `RovingFocusGroup` implementation neither suite ever exercises). If
> your report is three green ticks and nothing else, you stopped too early.
>
> ### Verify, in this order
>
> ```bash
> pnpm --filter reka-ui exec vitest run --project=browser <your file>
> pnpm --filter reka-ui port:checklist {COMPONENT} --complete
> pnpm --filter reka-ui port:parity {COMPONENT} --complete
> pnpm --filter reka-ui port:coverage {COMPONENT}
> pnpm --filter reka-ui exec vitest run --project=unit <the original file>   # still green
> ```
>
> All must exit 0. If `port:coverage` reports a LOST line, **do not paper over it** — either
> the port is weaker (fix it) or the line was only reachable by jsdom being jsdom, in which
> case argue it per line in `PORT-COVERAGE-ALLOW.tsv` with a `FINDINGS.tsv` key. Never exempt
> a whole file.
>
> If `port:coverage` reports GAINED lines, **ask which one earned it before you write it into a
> finding.** `vitest-browser-vue` auto-unmounts and the jsdom suite almost never does, so
> teardown lines come free from the harness, not from Chromium. If `mount()` + `unmount()`
> under jsdom would reach the same line, it is a gap in the original suite — still worth
> recording, but not as a point for browser mode. And read the istanbul **branch** map, not
> just the line count: `Label` gained a line whose `if` was taken zero times, so the behaviour
> behind it is still tested by nobody.
>
> ### Report back
>
> The test counts, the three oracle results, every `FINDINGS.tsv` key you added, anything that
> belongs in `AGENTS.md`'s translation table or gotchas list (say so — do not edit `AGENTS.md`
> yourself, it is shared and concurrent agents will conflict), and anything you are unsure of.
> Being wrong is recoverable; being confidently wrong in a findings row is not.

---

## Reviewer prompt

> You are reviewing one jsdom → browser-mode test port in the reka-ui fork at
> `/Users/alexanderopalic/Projects/reka-ui-bench-mark`.
>
> **Read exactly these two files and nothing the implementer wrote about them:**
> - `packages/core/src/{FILE}` — the jsdom original
> - `packages/core/src/{COMPONENT}.browser.test.ts` — the port
>
> You may also read `AGENTS.md` for the translation table, and the component source to check a
> claim. **Do not read the implementer's reasoning or its `FINDINGS.tsv` rows before forming
> your own view** — you are the independent check, and the whole value of this role is that
> your context is clean.
>
> Your brief is not "does this behave like the original". It is:
>
> > **Does this test still test anything?** Assume the port is worse than the original and find
> > how.
>
> Specifically hunt for:
>
> - An assertion that got weaker — a narrow matcher swapped for a broad one, an exact-HTML
>   comparison replaced by a single-attribute check, a `toBe` become a `toBeTruthy`.
> - A test that now passes vacuously — it would pass against a component that did nothing.
>   Would this test fail if the feature were deleted? If you cannot say yes, say so.
> - A deleted jsdom mock replaced by a browser workaround that is *more* artificial than the
>   mock was.
> - A `.element()` synchronous read racing Vue's flush where an awaited `expect.element` was
>   needed. `expect.element` retries; `.element()` does not.
> - A `waitFor` / `setTimeout` / arbitrary sleep papering over a race.
> - A quarantined `it.fails` that is hiding a genuine porting mistake rather than a real bug in
>   the library. Read the linked finding and decide whether it is an explanation or an excuse.
> - Setup moved into `beforeEach` in a way that changed what the test sees — spies that no
>   longer accumulate, state that no longer persists across tests.
>
> **You do not implement.** Report what you found, ranked by how much it matters, and say
> explicitly for each item whether you verified it by running something or only by reading. If
> the port is sound, say so plainly and name the two or three things you checked hardest — a
> review that finds nothing is a useful result, but only if it says what it looked for.

---

## Changelog

Every entry here should be a batch that went wrong and the prompt change that fixes it.

- **Initial version** — extracted from the Phase 1 trial runs (`useForwardExpose`, `Label`,
  `Slider`), which were driven by hand. The implementer prompt's "the part that is actually
  hard" section is written directly from the two ways those three files nearly went wrong: the
  vacuous-original case (`Slider`'s axe test) and the vacuous-port case (`Label`'s two negative
  click tests).

- **After T2 batch 1** (`Separator`, `Progress`, `Toolbar`) — validated, and it held: three
  agents, three clean ports on the first try, all oracles green, no weakened assertions, and 8
  findings. No prompt change was needed to prevent a bad port. Four additions, all of which the
  batch had to discover the hard way:

  1. **The axe vacuity check needs to read `incomplete` too.** Under jsdom `color-contrast` lands
     in `incomplete` with *zero nodes*, not in `inapplicable`, so a census reading only `passes`
     and `inapplicable` reports "the rule ran" when nothing was examined.
  2. **Say that the vacuity check cuts both ways.** The prompt led with `Slider`, and two of three
     agents had to establish for themselves that their original was *not* vacuous. Worth stating
     that a negative result is the expected one.
  3. **Warn about the retrying matcher.** `Progress` nearly shipped a mechanically-correct
     translation that silently widened a 200ms timing assertion by the retry budget. The oracle
     cannot catch this — assertion count goes *up*. This is now a gotcha in `AGENTS.md`, and it is
     the single most likely way a T2 port gets quietly weaker.
  5. **Both silent vacuities now have prompt lines** (substring `getByText`, lazy `getBy*`), added
     after `Switch` found them. These are the two failure modes that pass `port:parity` while the
     test stops testing, so they matter more than anything else in this file.
  6. **Portalled content needs `page.getBy*`.** `AlertDialog` — `screen` is container-scoped, so an
     overlay port querying through `screen` matches nothing and fails in a way that looks like a
     component bug. **← WRONG, and corrected after batch 4. See below.**
  4. **Tell them a green oracle is not the finish line.** All three files came back `0 lost,
     0 gained` and every real result came from probing beyond the oracles — mutating the component
     to see if the test could fail, reading the istanbul map for code no test reaches. Batch 1's
     three most valuable findings are about the *test suite*, not the components.

- **After T2 batch 4** (`RovingFocus`, `Teleport`, `Toggle`) — three clean ports, all oracles green
  first try, 16 findings. No prompt change was needed to prevent a bad port. The change that *was*
  needed is of a new kind, and it is the reason this changelog exists:

  1. **A prompt line was factually wrong, and the batch caught it.** Entry 6 above told agents that
     `screen.getBy*` is container-scoped and cannot see portalled content. `Teleport` measured the
     opposite; the claim was then settled against `AlertDialog`'s own fixture — content's parent is
     `BODY`, `container.contains(content)` is `false`, and `screen.getByRole('alertdialog')` still
     returns **the same node** `page` does — and corroborated from `vitest-browser-vue` source
     (`baseElement` defaults to `document.body`; the helpers bind to it). The prompt line is now
     replaced, `AGENTS.md` is corrected, and the misleading comment in the `AlertDialog` port is
     rewritten. **The failure mode to notice: a wrong rule that errs toward extra work is nearly
     invisible.** Agents obeyed it, their ports stayed green, and the oracles had nothing to say —
     because using `page` where `screen` would do costs nothing but a wrong belief. It would have
     been inherited by all eight T3 overlays.
  2. **Therefore: findings are evidence, not verdicts.** Two rows from earlier batches were
     re-verdicted by this one — the portal claim, and `Toolbar#roving-focus-untested`, which
     overstated its gap (`RovingFocus` re-measured across all 12 consumer suites in one istanbul run
     and found the functions *are* reached; what is actually dead is narrower and better specified).
     Nothing in the apparatus checks a finding's *reasoning*, only a port's structure — so a
     plausible wrong cause survives a batch and ships to the next one. When a finding is the kind
     that generalises to many files, measure it twice.
  3. **Two `AGENTS.md` gotchas needed qualifiers rather than rewrites**, both from originals doing
     something the rule did not anticipate: `userEvent.tab()` polyfills tab order in JS
     (`getTabDestination.js`), so "tab-order tests are unportable from jsdom" holds only for raw
     keydowns; and `color-contrast` — "the one rule browser mode adds" — is `inapplicable` in
     Chromium too when the fixture has no text, which is the normal shape of a headless-library
     fixture. Both were stated too absolutely because each came from a single file.
