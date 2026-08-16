// Structural parity between a jsdom test file and its browser-mode port.
//
// This is oracle #1. A ported file that goes green proves nothing on its own —
// the failure mode of this whole migration is a test that survives the port by
// quietly asserting less. This checker refuses three specific ways that
// happens:
//
//   INVENTED  a test in the browser port whose name is not in the jsdom file
//             (renamed, or made up to replace one that would not port)
//   WEAKENED  a matched test that now runs fewer `expect`s than the original
//   SKIPPED   a test marked .skip/.todo in the port but not in the original
//
// Missing tests are reported as progress, not failure, since the port is
// incremental by design. `--complete` flips that: use it to certify a file as
// fully ported.
//
//   node scripts/port/parity-names.mjs               # every ported pair
//   node scripts/port/parity-names.mjs Slider        # one component
//   node scripts/port/parity-names.mjs Slider --complete
//   node scripts/port/parity-names.mjs --json

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { parseTestFile } from './lib/ast.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(HERE, '../../src')
const FINDINGS = resolve(HERE, '../../../../FINDINGS.tsv')

/**
 * Keys recorded in FINDINGS.tsv (first column). A quarantined test must name
 * one of these, so `.fails` / `.skip` can never be a silent way out.
 */
function loadFindingKeys() {
  if (!existsSync(FINDINGS))
    return new Set()
  return new Set(
    readFileSync(FINDINGS, 'utf8')
      .split('\n')
      .slice(1)
      .map(line => line.split('\t')[0]?.trim())
      .filter(Boolean),
  )
}

const findingKeys = loadFindingKeys()

const RE_BROWSER_TEST = /\.browser\.test\.ts$/

const args = process.argv.slice(2)
const complete = args.includes('--complete')
const asJson = args.includes('--json')
const targets = args.filter(a => !a.startsWith('--'))

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules')
      continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory())
      walk(full, acc)
    else if (RE_BROWSER_TEST.test(entry))
      acc.push(full)
  }
  return acc
}

let pairs = walk(SRC).map(browser => ({
  browser,
  jsdom: browser.replace(RE_BROWSER_TEST, '.test.ts'),
}))

if (targets.length) {
  pairs = pairs.filter(p => targets.some(t => p.browser.includes(`/${t}/`) || p.browser.includes(`/${t}.browser.test.ts`)))
  if (!pairs.length) {
    process.stderr.write(`no browser-mode port found for: ${targets.join(', ')}\n`)
    process.exit(2)
  }
}

function compare(pair) {
  // A browser file with no jsdom original is not a port — the harness smoke
  // test, or genuinely new coverage. There is nothing to compare it against, so
  // it is reported and skipped rather than failed.
  if (!existsSync(pair.jsdom))
    return { pair, unpaired: true }

  const jsdom = parseTestFile(pair.jsdom)
  const browser = parseTestFile(pair.browser)

  const byKey = new Map()
  for (const t of jsdom.tests) {
    // duplicate titles exist; keep them as a queue so counts still line up
    if (!byKey.has(t.key))
      byKey.set(t.key, [])
    byKey.get(t.key).push(t)
  }

  const invented = []
  const weakened = []
  const skipped = []
  const unrecorded = []
  const quarantined = []
  const matched = []

  for (const t of browser.tests) {
    const queue = byKey.get(t.key)
    if (!queue || !queue.length) {
      invented.push(t)
      continue
    }
    const original = queue.shift()
    matched.push({ original, port: t })
    if (t.assertions < original.assertions)
      weakened.push({ original, port: t })

    // A port may quarantine a test that fails because it found a real bug —
    // that is a result, not a defeat, and the suite should stay green so
    // coverage and the rest of the batch keep working. The price is a written
    // finding: `@finding <key>` naming a row in FINDINGS.tsv. Without one this
    // is indistinguishable from giving up, so it is still a failure.
    const isQuarantined = (t.skipped && !original.skipped) || (t.expectedToFail && !original.expectedToFail)
    if (!isQuarantined)
      continue

    if (!t.finding)
      skipped.push({ original, port: t })
    else if (!findingKeys.has(t.finding))
      unrecorded.push({ original, port: t })
    else
      quarantined.push({ original, port: t })
  }

  const missing = [...byKey.values()].flat()

  return {
    pair,
    counts: {
      jsdom: jsdom.tests.length,
      browser: browser.tests.length,
      matched: matched.length,
      jsdomAssertions: jsdom.tests.reduce((n, t) => n + t.assertions, 0),
      browserAssertions: browser.tests.reduce((n, t) => n + t.assertions, 0),
    },
    invented,
    weakened,
    skipped,
    unrecorded,
    quarantined,
    missing,
  }
}

const results = pairs.map(compare)

if (asJson) {
  process.stdout.write(`${JSON.stringify(
    results.map(r => ({
      ...r,
      pair: { browser: relative(SRC, r.pair.browser), jsdom: relative(SRC, r.pair.jsdom) },
    })),
    null,
    2,
  )}\n`)
}

let failed = 0
let unpaired = 0

for (const r of results) {
  const name = relative(SRC, r.pair.browser)
  if (r.unpaired) {
    if (!asJson)
      process.stdout.write(`· ${name}  not a port — no jsdom counterpart, nothing to check\n`)
    unpaired++
    continue
  }

  const c = r.counts
  const drift = r.invented.length + r.weakened.length + r.skipped.length + r.unrecorded.length
  const incomplete = complete && r.missing.length
  const ok = !drift && !incomplete

  if (!asJson) {
    process.stdout.write(
      `${ok ? '✓' : '✗'} ${name}  ${c.matched}/${c.jsdom} tests, ${c.browserAssertions}/${c.jsdomAssertions} assertions\n`,
    )
  }

  if (r.invented.length) {
    process.stdout.write(`    INVENTED — not present in the jsdom original (${r.invented.length}):\n`)
    for (const t of r.invented)
      process.stdout.write(`      L${t.line}  ${t.key}\n`)
  }
  if (r.weakened.length) {
    process.stdout.write(`    WEAKENED — fewer assertions than the original (${r.weakened.length}):\n`)
    for (const { original, port } of r.weakened)
      process.stdout.write(`      L${port.line}  ${port.key}  (${original.assertions} → ${port.assertions})\n`)
  }
  if (r.skipped.length) {
    process.stdout.write(`    SKIPPED — quarantined in the port but not the original, with no \`@finding\` tag (${r.skipped.length}):\n`)
    for (const { port } of r.skipped)
      process.stdout.write(`      L${port.line}  ${port.key}\n`)
  }
  if (r.unrecorded.length) {
    process.stdout.write(`    UNRECORDED — \`@finding\` names a key that is not in FINDINGS.tsv (${r.unrecorded.length}):\n`)
    for (const { port } of r.unrecorded)
      process.stdout.write(`      L${port.line}  ${port.key}  → ${port.finding}\n`)
  }
  if (r.quarantined.length && !asJson) {
    process.stdout.write(`    FINDING — quarantined because the port found a real bug (${r.quarantined.length}):\n`)
    for (const { port } of r.quarantined)
      process.stdout.write(`      L${port.line}  ${port.key}  → ${port.finding}\n`)
  }
  if (r.missing.length && !asJson) {
    const label = complete ? 'MISSING — --complete was requested' : 'not ported yet'
    process.stdout.write(`    ${label} (${r.missing.length}):\n`)
    for (const t of r.missing.slice(0, complete ? Infinity : 5))
      process.stdout.write(`      L${t.line}  ${t.key}\n`)
    if (!complete && r.missing.length > 5)
      process.stdout.write(`      … ${r.missing.length - 5} more\n`)
  }

  if (!ok)
    failed++
}

if (!asJson && results.length > 1) {
  const checked = results.length - unpaired
  process.stdout.write(`\n${checked - failed}/${checked} pairs clean${unpaired ? `, ${unpaired} unpaired` : ''}\n`)
}

process.exit(failed ? 1 : 0)
