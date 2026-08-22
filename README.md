# Reka UI: jsdom to Vitest Browser Mode

This fork is a completed, evidence-backed case study of moving a real Vue component library away
from jsdom as its test destination. It is based on [Reka UI](https://github.com/unovue/reka-ui),
not intended as a replacement distribution of the library.

The original suite had 97 test files:

- 87 DOM-dependent files now have colocated Vitest Browser Mode counterparts running in Chromium.
- 10 DOM-free files run in a plain Node project with no browser or jsdom setup.
- The 87 original jsdom files remain runnable as a comparison corpus. Their presence is
  intentional; migration progress is measured by whether every contract has a browser or Node
  destination, not by deleting the originals.

The result is a concrete answer to a practical question: which mocks disappear in a real browser,
which tests become more meaningful, and what does that cost?

## Start here

The smallest useful before/after example is Slider:

- [Original jsdom test](packages/core/src/Slider/Slider.test.ts)
- [Browser Mode port](packages/core/src/Slider/Slider.browser.test.ts)
- [Browser project configuration](packages/core/vite.config.ts)
- [Browser-only setup](packages/core/vitest.browser.setup.ts)

The port deletes the `ResizeObserver`, `scrollIntoView`, and pointer-capture mocks. A mutation that
removes real pointer capture fails the browser test while the jsdom test still passes because its
own mock claims capture succeeded.

For the complete account, read [Migrating a component test suite from jsdom to Vitest Browser
Mode](MIGRATING-TO-BROWSER-MODE.md).

## Run it

Prerequisites: Node 22 or newer and pnpm 10. The committed lockfile pins the versions used for the
recorded results: Vitest 4.1.10, Playwright 1.62.1, `vitest-browser-vue` 2.1.0, and Vue 3.5.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm exec playwright install chromium

# The migration destination
pnpm --filter reka-ui test:browser

# All three projects: Node, retained jsdom, and Chromium
pnpm --filter reka-ui exec vitest run
```

On a fresh Linux CI runner, install Chromium and its system dependencies with
`pnpm exec playwright install --with-deps chromium`.

Useful focused commands:

```bash
pnpm --filter reka-ui exec vitest run --project=node
pnpm --filter reka-ui exec vitest run --project=unit
pnpm --filter reka-ui exec vitest run --project=browser src/Slider/Slider.browser.test.ts

pnpm --filter reka-ui port:inventory
pnpm --filter reka-ui port:parity Slider --complete
pnpm --filter reka-ui port:checklist Slider
pnpm --filter reka-ui port:coverage Slider
```

## Current verified corpus

| Project | Purpose | Files | Result |
|---|---|---:|---:|
| `node` | Tests that need no DOM | 10 | 571 passing |
| `unit` | Retained jsdom comparison | 87 | 1,444 passing |
| `browser` | Chromium destination plus unpaired browser contracts | 111 | 1,554 passing + 28 expected failures |

Across the projects, 208 files run independently with 3,569 passing tests and 28 intentional
`it.fails` quarantines. `port:inventory` reports 97/97 original files with a non-jsdom destination,
and `port:parity --complete` reports 87/87 browser/jsdom pairs structurally clean.

Expected failures are findings, not ignored breakage: each one executes, names a row in
[`FINDINGS.tsv`](FINDINGS.tsv), and turns red when the underlying bug or fixture issue is fixed.

## What to read

| Document | Purpose |
|---|---|
| [MIGRATING-TO-BROWSER-MODE.md](MIGRATING-TO-BROWSER-MODE.md) | Public field guide: setup, translation patterns, browser truths, and failure modes |
| [VITEST-BROWSER-MODE-COOKBOOK.md](VITEST-BROWSER-MODE-COOKBOOK.md) | Focused recipes for writing strong Browser Mode tests |
| [PERFORMANCE.md](PERFORMANCE.md) | Measured suite, file, render, locator, and real-input costs |
| [A11Y-FINDINGS.md](A11Y-FINDINGS.md) | Accessibility-tree findings that axe alone did not detect |
| [PORTING.md](PORTING.md) | Historical execution manual, sequencing, parity oracles, and completed task log |
| [PORT-INVENTORY.tsv](PORT-INVENTORY.tsv) | Machine-generated destination inventory for all 97 original files |
| [FINDINGS.tsv](FINDINGS.tsv) | Raw evidence log for ports, browser findings, and quarantines |
| [IMPROVING-PORTED-TESTS.md](IMPROVING-PORTED-TESTS.md) | Post-migration reference-quality audit and improvements |
| [IMPROVING-PORTED-TESTS-VITEST-5.md](IMPROVING-PORTED-TESTS-VITEST-5.md) | Measured upgrade notes and future Vitest 5 work, not current setup guidance |
| [AGENTS.md](AGENTS.md) | Repository-specific operating instructions and detailed gotchas for agents |

## Design choices worth copying

- Split Node, jsdom, and browser environments into explicit Vitest projects.
- Give Browser Mode its own setup file; do not inherit jsdom patches or DOM mocks.
- Keep original and ported test names identical, then check the trees mechanically.
- Delete mocks that compensate for a missing browser API; retain mocks that construct the tested
  scenario and record why.
- Drive ordinary input through locators and `userEvent`; construct events only for payload
  contracts that trusted input cannot express.
- Use real browser coverage as a gap finder, not a percentage target.
- Keep platform-specific visual references in an isolated project and controlled container.
- Run the finished Chromium corpus on Firefox and WebKit to separate browser assumptions from
  product behavior.

## Upstream project

For Reka UI installation, product documentation, releases, and contribution guidance, use the
[upstream Reka UI repository](https://github.com/unovue/reka-ui) and
[reka-ui.com](https://reka-ui.com). Changes in this fork are research and test-infrastructure work.

The upstream package README remains at [packages/core/README.md](packages/core/README.md).
