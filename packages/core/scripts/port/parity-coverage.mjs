// Coverage-set parity between a jsdom test file and its browser-mode port.
//
// This is oracle #2, and the stronger of the two. Name/assertion parity proves
// the port kept the same shape; this proves it still reaches the same code. If
// the browser port executes fewer lines of the component than the jsdom
// original did, it tests strictly less — regardless of how green it is.
//
//   node scripts/port/parity-coverage.mjs Slider
//   node scripts/port/parity-coverage.mjs Slider --scope Slider   # component only
//   node scripts/port/parity-coverage.mjs Slider --keep           # keep raw reports
//
// One exemption exists, and it is deliberately expensive: a line that jsdom
// only reaches *because* it is jsdom (a zero-geometry branch, say) can be
// listed in PORT-COVERAGE-ALLOW.tsv, but only against a key that exists in
// FINDINGS.tsv. See the `allowances` block below.
//
// KNOWN LIMITATION — read before trusting a green result:
// istanbul currently reports no `.vue` files at all in this repo, in either
// environment. Every entry is a `.ts` module. That is pre-existing (the
// committed coverage report has 0 of 215 entries as `.vue`) and not something
// browser mode introduced, but it means this oracle currently sees the
// composables and utilities a component pulls in, NOT its SFC bodies. The
// script fails loudly rather than silently under-reporting.

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const CORE = resolve(HERE, '../..')
const SRC = join(CORE, 'src')
const ROOT = resolve(CORE, '../..')
const FINDINGS = join(ROOT, 'FINDINGS.tsv')
const ALLOW = join(ROOT, 'PORT-COVERAGE-ALLOW.tsv')

function readTsv(file) {
  if (!existsSync(file))
    return []
  return readFileSync(file, 'utf8')
    .split('\n')
    .slice(1)
    .map(line => line.split('\t').map(cell => cell.trim()))
    .filter(cells => cells[0])
}

/**
 * Lines the port is allowed to lose.
 *
 * Some jsdom coverage is an artefact of jsdom, not of the test: a branch that
 * only runs because every rect is 0x0 is not coverage a real browser can or
 * should reproduce. Losing it is a result, not a regression — but "the browser
 * covers less" is also exactly what a gutted port looks like, so the exemption
 * is machine-checked and costs a written finding, the same way `@finding` does
 * in parity-names.mjs.
 *
 * PORT-COVERAGE-ALLOW.tsv: component <tab> file <tab> line <tab> finding <tab> why
 */
const findingKeys = new Set(readTsv(FINDINGS).map(cells => cells[0]))
const allowances = readTsv(ALLOW).map(([component, file, line, finding, why]) => ({
  component,
  file,
  line: Number(line),
  finding,
  why,
}))

const RE_BROWSER_TEST = /\.browser\.test\.ts$/
const RE_ANY_TEST = /\.(?:browser\.)?test\.ts$/

const args = process.argv.slice(2)
const keep = args.includes('--keep')

function flag(flagName) {
  const i = args.indexOf(flagName)
  return i === -1 ? null : args[i + 1]
}

const scope = flag('--scope')
const jsdomOverride = flag('--jsdom')
const consumed = new Set([scope, jsdomOverride].filter(Boolean))
const positional = args.filter(a => !a.startsWith('--') && !consumed.has(a))

if (positional.length !== 1) {
  process.stderr.write(
    'usage: parity-coverage.mjs <Component|path/to/X.browser.test.ts>'
    + ' [--jsdom <file>] [--scope <substring>] [--keep]\n',
  )
  process.exit(2)
}

/**
 * Find `<name>.browser.test.ts` anywhere under src/.
 *
 * The common case is `src/<Component>/<Component>.browser.test.ts`, but the
 * composables do not follow it — `shared/useForwardExpose.test.ts` lives
 * directly in `src/shared/`, with no directory of its own. That is 13 of the
 * 13 T1 files plus four of T4, so the fallback is not an edge case.
 */
function findBrowserTest(base) {
  const direct = join(SRC, base, `${base}.browser.test.ts`)
  if (existsSync(direct))
    return direct
  const stack = [SRC]
  while (stack.length) {
    const dirPath = stack.pop()
    for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
      const full = join(dirPath, entry.name)
      if (entry.isDirectory())
        stack.push(full)
      else if (entry.name === `${base}.browser.test.ts`)
        return full
    }
  }
  return direct // report the conventional path in the "not found" error
}

// Either a component name (the common case) or an explicit browser file, for
// comparing a port against an original that is not its exact name-sibling.
const target = positional[0]
const isPath = target.includes('.browser.test.ts')
// Derive the name from the file itself, not its parent directory: `shared/`
// holds many unrelated ports, so the directory is not an identity.
const name = isPath
  ? target.split('/').at(-1).replace(RE_BROWSER_TEST, '')
  : target
const browserTest = isPath ? resolve(CORE, target) : findBrowserTest(name)
const jsdomTest = jsdomOverride
  ? resolve(CORE, jsdomOverride)
  : browserTest.replace(RE_BROWSER_TEST, '.test.ts')

for (const [label, file] of [['jsdom', jsdomTest], ['browser', browserTest]]) {
  if (!existsSync(file)) {
    process.stderr.write(`no ${label} test at ${relative(CORE, file)}\n`)
    process.exit(2)
  }
}

const outRoot = join(CORE, 'coverage/port-parity', name)
rmSync(outRoot, { recursive: true, force: true })
mkdirSync(outRoot, { recursive: true })

function collect(project, testFile) {
  const reportDir = join(outRoot, project)
  const reportPath = join(reportDir, 'coverage-final.json')

  // Retried once on purpose. Concurrent agents each spawn their own vitest, and a
  // browser-project run that loses the race for Chromium/the vite server dies without
  // writing a report — which is indistinguishable, from here, from a port that does not
  // compile. Measured during the first T2 batch: one run in four exited 2 while three
  // re-runs of the identical command were clean. A false failure here is expensive,
  // because the agent reading it goes and "fixes" a file that was never broken.
  let run
  for (let attempt = 1; attempt <= 2; attempt++) {
    rmSync(reportDir, { recursive: true, force: true })
    run = spawnSync('npx', [
      'vitest',
      'run',
      `--project=${project === 'jsdom' ? 'unit' : 'browser'}`,
      relative(CORE, testFile),
      '--coverage',
      '--coverage.provider=istanbul',
      '--coverage.reporter=json',
      `--coverage.reportsDirectory=${reportDir}`,
    ], { cwd: CORE, encoding: 'utf8' })

    if (existsSync(reportPath))
      break
    if (attempt === 1)
      process.stderr.write(`${project} run produced no coverage report — retrying once (concurrent runs can starve a browser worker)\n`)
  }

  if (!existsSync(reportPath)) {
    process.stderr.write(`\n${project} run produced no coverage report, twice — the test file probably failed to run:\n`)
    process.stderr.write(`${(run.stdout || '') + (run.stderr || '')}\n`)
    process.exit(2)
  }

  const raw = JSON.parse(readFileSync(reportPath, 'utf8'))
  const lines = new Map() // relative file -> Set<line>
  let vueEntries = 0

  for (const [abs, entry] of Object.entries(raw)) {
    const rel = relative(SRC, abs)
    if (rel.startsWith('..'))
      continue
    if (RE_ANY_TEST.test(rel))
      continue
    if (scope && !rel.includes(scope))
      continue
    if (rel.endsWith('.vue'))
      vueEntries++

    const covered = new Set()
    for (const [id, hits] of Object.entries(entry.s)) {
      if (hits > 0 && entry.statementMap[id])
        covered.add(entry.statementMap[id].start.line)
    }
    if (covered.size)
      lines.set(rel, covered)
  }

  return { lines, vueEntries, failed: run.status !== 0 }
}

process.stdout.write(`collecting jsdom coverage for ${name}…\n`)
const jsdom = collect('jsdom', jsdomTest)
process.stdout.write(`collecting browser coverage for ${name}…\n`)
const browser = collect('browser', browserTest)

const files = [...new Set([...jsdom.lines.keys(), ...browser.lines.keys()])].sort()

let lostTotal = 0
let gainedTotal = 0
let sharedTotal = 0
const lost = []
const gained = []
const allowed = []
const unrecorded = []

/** The allowance covering this lost line, if any — and whether it is honest. */
function allowanceFor(file, line) {
  return allowances.find(a => a.component === name && a.file === file && a.line === line)
}

for (const file of files) {
  const a = jsdom.lines.get(file) || new Set()
  const b = browser.lines.get(file) || new Set()
  const onlyB = [...b].filter(l => !a.has(l)).sort((x, y) => x - y)
  const both = [...a].filter(l => b.has(l)).length

  const onlyA = []
  for (const line of [...a].filter(l => !b.has(l)).sort((x, y) => x - y)) {
    const allowance = allowanceFor(file, line)
    if (!allowance)
      onlyA.push(line)
    else if (findingKeys.has(allowance.finding))
      allowed.push({ file, line, allowance })
    else
      unrecorded.push({ file, line, allowance })
  }

  lostTotal += onlyA.length
  gainedTotal += onlyB.length
  sharedTotal += both

  if (onlyA.length)
    lost.push({ file, lines: onlyA })
  if (onlyB.length)
    gained.push({ file, lines: onlyB })
}

process.stdout.write(`\n${name} — covered-line parity${scope ? ` (scope: ${scope})` : ''}\n`)
process.stdout.write(`  files instrumented   jsdom ${jsdom.lines.size}, browser ${browser.lines.size}\n`)
process.stdout.write(`  lines in both        ${sharedTotal}\n`)
process.stdout.write(`  lost by the port     ${lostTotal}${allowed.length ? ` (+${allowed.length} allowed)` : ''}\n`)
process.stdout.write(`  gained by the port   ${gainedTotal}\n`)

if (!jsdom.vueEntries && !browser.vueEntries) {
  process.stdout.write(
    '\n  ⚠ no .vue files were instrumented in either run. This oracle is only\n'
    + '    seeing .ts modules, so it cannot see the component SFCs themselves.\n'
    + '    Treat a clean result here as necessary but not sufficient.\n',
  )
}

if (lost.length) {
  process.stdout.write('\n  LOST — reached by the jsdom test, not by the port:\n')
  for (const { file, lines } of lost)
    process.stdout.write(`    ${file}  L${lines.join(', L')}\n`)
}

if (allowed.length) {
  process.stdout.write('\n  ALLOWED — lost on purpose, jsdom-only code paths (see PORT-COVERAGE-ALLOW.tsv):\n')
  for (const { file, line, allowance } of allowed)
    process.stdout.write(`    ${file}  L${line}  → ${allowance.finding}  ${allowance.why ?? ''}\n`)
}

if (unrecorded.length) {
  process.stdout.write('\n  UNRECORDED — allowance names a key that is not in FINDINGS.tsv:\n')
  for (const { file, line, allowance } of unrecorded)
    process.stdout.write(`    ${file}  L${line}  → ${allowance.finding}\n`)
}

if (gained.length) {
  process.stdout.write('\n  GAINED — reached only by the port:\n')
  for (const { file, lines } of gained)
    process.stdout.write(`    ${file}  L${lines.join(', L')}\n`)
}

if (!keep)
  rmSync(outRoot, { recursive: true, force: true })

process.exit(lostTotal > 0 || unrecorded.length > 0 ? 1 : 0)
