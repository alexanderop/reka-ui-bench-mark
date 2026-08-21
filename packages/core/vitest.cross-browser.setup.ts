import type { RunnerTask, RunnerTestCase } from 'vitest'
import type { CrossBrowserExpectation } from './cross-browser.expectations'
import { afterAll, beforeEach } from 'vitest'
import { server } from 'vitest/browser'
import findingsTsv from '../../FINDINGS.tsv?raw'
import { EXPECTATIONS } from './cross-browser.expectations'

// Setup for the `cross-browser` project, loaded *after* `vitest.browser.setup.ts`
// (same CSS shim, same axe wiring). The only thing it adds is the expectation
// table: engine-specific `fails`/`passes` flags applied to the otherwise
// unchanged browser test files. See `cross-browser.expectations.ts`.

const ENGINE = server.browser
const PLATFORM = server.platform

// Same rule as `port:parity`: a quarantine must name a recorded finding. The
// TSV is imported raw so the check runs in the browser without a Node script.
const findingKeys = new Set(
  findingsTsv.split('\n').slice(1).map(line => line.split('\t')[0]).filter(Boolean),
)
const unrecorded = EXPECTATIONS.filter(e => !findingKeys.has(e.finding))
if (unrecorded.length) {
  throw new Error(
    `cross-browser.expectations.ts names ${unrecorded.length} finding key(s) missing from FINDINGS.tsv:\n${
      unrecorded.map(e => `  ${e.engine} ${e.file} :: ${String(e.test)} → ${e.finding}`).join('\n')}`,
  )
}

function applies(e: CrossBrowserExpectation, file: string) {
  return e.engine === ENGINE
    && (!e.platform || e.platform === '*' || e.platform === PLATFORM)
    && e.file === file
}

function fullName(task: RunnerTestCase): string {
  const names: string[] = []
  for (let t: RunnerTask | undefined = task; t && t !== task.file; t = t.suite)
    names.unshift(t.name)
  return names.join(' > ')
}

const matched = new Set<CrossBrowserExpectation>()
let currentFile: string | undefined

beforeEach((ctx) => {
  const task = ctx.task as RunnerTestCase
  const file = task.file.name
  currentFile = file
  const name = fullName(task)
  for (const e of EXPECTATIONS) {
    if (!applies(e, file))
      continue
    if (typeof e.test === 'string' ? e.test !== name : !e.test.test(name))
      continue
    matched.add(e)
    if (e.expect === 'skip') {
      ctx.skip(`cross-browser: nondeterministic on ${ENGINE} — FINDINGS.tsv#${e.finding}`)
      return
    }
    // Read by the runner after the test body ran (runner/src/run.ts:765), so
    // flipping it here is enough to invert the verdict — or to un-invert an
    // `it.fails` that does not reproduce on this engine.
    task.fails = e.expect === 'fails'
  }
})

afterAll(() => {
  // Set by the first `beforeEach`; a file whose tests all skipped never sets it
  // and has nothing to check.
  const file = currentFile
  if (!file)
    return
  const stale = EXPECTATIONS.filter(e => applies(e, file) && !matched.has(e))
  if (stale.length) {
    throw new Error(
      `${stale.length} cross-browser expectation(s) for ${ENGINE}/${PLATFORM} matched no test in ${file} — renamed test, or a finding that is no longer reproducible:\n${
        stale.map(e => `  ${String(e.test)} → ${e.finding}`).join('\n')}`,
    )
  }
})
