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
// KNOWN LIMITATION — read before trusting a green result:
// istanbul currently reports no `.vue` files at all in this repo, in either
// environment. Every entry is a `.ts` module. That is pre-existing (the
// committed coverage report has 0 of 215 entries as `.vue`) and not something
// browser mode introduced, but it means this oracle currently sees the
// composables and utilities a component pulls in, NOT its SFC bodies. The
// script fails loudly rather than silently under-reporting.

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const CORE = resolve(HERE, '../..')
const SRC = join(CORE, 'src')

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

// Either a component name (the common case) or an explicit browser file, for
// comparing a port against an original that is not its exact name-sibling.
const target = positional[0]
const isPath = target.includes('.browser.test.ts')
const name = isPath ? target.split('/').filter(Boolean).at(-2) : target
const dir = join(SRC, name)
const browserTest = isPath ? resolve(CORE, target) : join(dir, `${name}.browser.test.ts`)
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
  const run = spawnSync('npx', [
    'vitest',
    'run',
    `--project=${project === 'jsdom' ? 'unit' : 'browser'}`,
    relative(CORE, testFile),
    '--coverage',
    '--coverage.provider=istanbul',
    '--coverage.reporter=json',
    `--coverage.reportsDirectory=${reportDir}`,
  ], { cwd: CORE, encoding: 'utf8' })

  const reportPath = join(reportDir, 'coverage-final.json')
  if (!existsSync(reportPath)) {
    process.stderr.write(`\n${project} run produced no coverage report — the test file probably failed to run:\n`)
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

for (const file of files) {
  const a = jsdom.lines.get(file) || new Set()
  const b = browser.lines.get(file) || new Set()
  const onlyA = [...a].filter(l => !b.has(l)).sort((x, y) => x - y)
  const onlyB = [...b].filter(l => !a.has(l)).sort((x, y) => x - y)
  const both = [...a].filter(l => b.has(l)).length

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
process.stdout.write(`  lost by the port     ${lostTotal}\n`)
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

if (gained.length) {
  process.stdout.write('\n  GAINED — reached only by the port:\n')
  for (const { file, lines } of gained)
    process.stdout.write(`    ${file}  L${lines.join(', L')}\n`)
}

if (!keep)
  rmSync(outRoot, { recursive: true, force: true })

process.exit(lostTotal > 0 ? 1 : 0)
