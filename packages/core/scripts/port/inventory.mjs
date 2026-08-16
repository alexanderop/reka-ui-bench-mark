// Builds PORT-INVENTORY.tsv — one row per jsdom test file, describing *why*
// that file is hard to port and which tier it belongs to.
//
// This is the `LIFETIMES.tsv` analogue from the Bun-in-Rust port: the document
// that lets you shard the work and predict cost before spending any of it.
//
//   node scripts/port/inventory.mjs            # write ../../PORT-INVENTORY.tsv
//   node scripts/port/inventory.mjs --stdout   # print instead
//   node scripts/port/inventory.mjs --summary  # tier/mock rollup

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { parseTestFile } from './lib/ast.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const CORE = resolve(HERE, '../..')
const SRC = join(CORE, 'src')
const OUT = resolve(CORE, '../../PORT-INVENTORY.tsv')

const RE_TEST_FILE = /\.test\.ts$/
const RE_BROWSER_TEST = /\.browser\.test\.ts$/
const RE_STORY_IMPORT = /from\s+['"`]\.\/story\//
const RE_PURE_DIR = /^(?:shared|date)\//
const RE_NODE_TESTS_BLOCK = /const NODE_TESTS = \[([\s\S]*?)\]/
const RE_NODE_TESTS_ENTRY = /'\.\/src\/(.+?)'/g

/**
 * The files already running in the `node` project, read out of the vitest
 * config rather than duplicated here.
 *
 * This has to come from the config or the inventory lies: a file that left
 * jsdom for `node` is *done*, and counting it as an unported T2 keeps the
 * progress bar from ever reaching zero. The config is the only place that
 * decides which environment a file actually runs in, so it is the only honest
 * source. Parsed as text — executing vite.config.ts from a plain node script
 * would drag in the vue plugin and Tailwind for no reason.
 */
function readNodeTests() {
  const config = readFileSync(join(CORE, 'vite.config.ts'), 'utf8')
  const block = config.match(RE_NODE_TESTS_BLOCK)
  if (!block)
    throw new Error('vite.config.ts: no `const NODE_TESTS = [...]` — the node project moved or was renamed; fix this script rather than letting the inventory under-report')
  const files = Array.from(block[1].matchAll(RE_NODE_TESTS_ENTRY), m => m[1])
  if (!files.length)
    throw new Error('vite.config.ts: NODE_TESTS parsed as empty — refusing to report every node file as unported')
  return new Set(files)
}

const NODE_TESTS = readNodeTests()

/**
 * Browser APIs the file *replaces*. Presence of one of these is the whole
 * argument for porting the file: in a real browser the stub is deleted.
 */
const STUBS = {
  ResizeObserver: /(?:globalThis|window|global)\.ResizeObserver\s*=|vi\.stubGlobal\(\s*['"`]ResizeObserver/,
  pointerCapture: /prototype\.(?:has|set|release)PointerCapture\s*=/,
  scrollIntoView: /prototype\.scrollIntoView\s*=/,
  getBoundingClientRect: /prototype\.getBoundingClientRect\s*=|\.getBoundingClientRect\s*=\s*(?:vi\.fn|\()/,
  getComputedStyle: /(?:globalThis|window|global)\.getComputedStyle\s*=|vi\.stubGlobal\(\s*['"`]getComputedStyle/,
  matchMedia: /(?:globalThis|window|global)\.matchMedia\s*=|vi\.stubGlobal\(\s*['"`]matchMedia/,
  IntersectionObserver: /(?:globalThis|window|global)\.IntersectionObserver\s*=|vi\.stubGlobal\(\s*['"`]IntersectionObserver/,
  animation: /prototype\.(?:animate|getAnimations)\s*=/,
  DOMRect: /(?:globalThis|window|global)\.DOMRect\s*=/,
}

/** Browser APIs merely referenced — weaker signal, but still layout-dependent. */
const TOUCHES = {
  ResizeObserver: /ResizeObserver/,
  pointerCapture: /PointerCapture/,
  scrollIntoView: /scrollIntoView/,
  rects: /getBoundingClientRect|DOMRect|offsetWidth|offsetHeight|clientWidth|clientHeight/,
  coords: /client[XY]|page[XY]|offset[XY]|screen[XY]/,
  computedStyle: /getComputedStyle/,
  rAF: /requestAnimationFrame/,
  focusApi: /document\.activeElement|\.focus\(\)|\.blur\(\)/,
}

/**
 * Things that make a port a rewrite rather than a translation. `vi.spyOn` is
 * deliberately NOT here — it works unchanged in browser mode, so it is only a
 * flag.
 */
const HOSTILE = {
  fakeTimers: /vi\.useFakeTimers/,
  moduleMock: /vi\.mock\(/,
  snapshot: /toMatchSnapshot|toMatchFileSnapshot|toMatchInlineSnapshot/,
}

const OTHER = {
  axe: /vitest-axe|toHaveNoViolations|\baxe\(/,
  spyOn: /vi\.spyOn\(/,
  pointerEvents: /pointer(?:down|move|up|enter|leave|cancel)/i,
  keyboardEvents: /keydown|keyup|keypress|userEvent\.keyboard/,
  ssr: /renderToString|@vue\/server-renderer/,
  teleport: /Teleport|teleport/,
}

function hits(text, table) {
  return Object.entries(table).filter(([, re]) => re.test(text)).map(([k]) => k)
}

function walkTests(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules')
      continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory())
      walkTests(full, acc)
    else if (RE_TEST_FILE.test(entry) && !RE_BROWSER_TEST.test(entry))
      acc.push(full)
  }
  return acc
}

/**
 * Tier, most-constraining first.
 *
 * T0 wins over everything, including T4: `shared/useNonce` is tagged hostile
 * for its `vi.mock` and it does not matter, because the file needs no DOM and
 * module mocking works fine in a node environment. Needing no DOM is a property
 * of the file; every other tier is a difficulty estimate for a port that still
 * has to happen.
 *
 * Below T0 the tiers sequence the work rather than decide whether it happens:
 * T4 files need a rewrite rather than a port, T3 files are the ones that
 * justify the whole exercise, and T1 files are expected to be boring — which
 * is a prediction about what they teach, not a reason to skip them.
 */
function tierOf(row) {
  if (row.isNode)
    return 'T0-node'
  if (row.hostile.length)
    return 'T4-hostile'
  if (row.stubs.length || row.touches.includes('rects') || row.touches.includes('coords'))
    return 'T3-payoff'
  if (!row.hasStory && RE_PURE_DIR.test(row.file))
    return 'T1-pure'
  return 'T2-mechanical'
}

const rows = walkTests(SRC).sort().map((full) => {
  const file = relative(SRC, full)
  const dir = dirname(full)
  const { text, tests, suites } = parseTestFile(full)

  const hasStory = existsSync(join(dir, 'story'))
  const usesStory = RE_STORY_IMPORT.test(text)
  const browserPort = full.replace(RE_TEST_FILE, '.browser.test.ts')

  const row = {
    file,
    component: relative(SRC, dir) || '.',
    tests: tests.length,
    assertions: tests.reduce((n, t) => n + t.assertions, 0),
    suites: suites.length,
    lines: text.split('\n').length,
    hasStory,
    mountsStory: usesStory,
    stubs: hits(text, STUBS),
    touches: hits(text, TOUCHES),
    hostile: hits(text, HOSTILE),
    other: hits(text, OTHER),
    isNode: NODE_TESTS.has(file),
    ported: existsSync(browserPort),
  }
  // A file off jsdom is off jsdom. The `node` ones got there without a port,
  // and the migration is finished when nothing is left on `unit` — not when
  // every file has a `.browser.test.ts`.
  row.done = row.isNode || row.ported
  row.tier = tierOf(row)
  return row
})

const COLUMNS = [
  ['file', r => r.file],
  ['tier', r => r.tier],
  ['tests', r => r.tests],
  ['assertions', r => r.assertions],
  ['lines', r => r.lines],
  ['story', r => (r.mountsStory ? 'mounts' : r.hasStory ? 'exists' : 'none')],
  ['stubs', r => r.stubs.join(',') || '-'],
  ['touches', r => r.touches.join(',') || '-'],
  ['hostile', r => r.hostile.join(',') || '-'],
  ['flags', r => r.other.join(',') || '-'],
  ['ported', r => (r.isNode ? 'node' : r.ported ? 'yes' : 'no')],
]

const tsv = [
  COLUMNS.map(([name]) => name).join('\t'),
  ...rows.map(r => COLUMNS.map(([, get]) => String(get(r))).join('\t')),
].join('\n')

if (process.argv.includes('--stdout')) {
  process.stdout.write(`${tsv}\n`)
}
else {
  writeFileSync(OUT, `${tsv}\n`)
  process.stdout.write(`wrote ${relative(process.cwd(), OUT)} — ${rows.length} files\n`)
}

if (process.argv.includes('--summary') || !process.argv.includes('--stdout')) {
  const by = key => rows.reduce((m, r) => {
    for (const v of [].concat(r[key]).filter(Boolean))
      m[v] = (m[v] || 0) + 1
    return m
  }, {})

  const tiers = by('tier')
  const order = ['T0-node', 'T1-pure', 'T2-mechanical', 'T3-payoff', 'T4-hostile']
  const line = (label, inTier) => process.stdout.write(
    `${label.padEnd(16)} ${String(inTier.length).padStart(5)}  ${String(inTier.reduce((n, r) => n + r.tests, 0)).padStart(5)}  ${String(inTier.filter(r => r.done).length).padStart(4)}\n`,
  )
  process.stdout.write('\ntier             files  tests  off jsdom\n')
  for (const t of order)
    line(t, rows.filter(r => r.tier === t))
  line('TOTAL', rows)

  // The number that actually measures the migration: what the `unit` project
  // still matches. It only goes down, and reaching zero is the whole goal.
  const left = rows.filter(r => !r.done)
  process.stdout.write(
    `\nstill on jsdom: ${left.length} files / ${left.reduce((n, r) => n + r.tests, 0)} tests\n`,
  )
  if (tiers['T0-node'] !== NODE_TESTS.size) {
    process.stdout.write(
      `WARNING: vite.config.ts lists ${NODE_TESTS.size} NODE_TESTS but ${tiers['T0-node'] || 0} matched a real file — a path is stale\n`,
    )
  }

  const stubs = by('stubs')
  process.stdout.write('\nstubs deleted by porting (the deliverable):\n')
  for (const [k, v] of Object.entries(stubs).sort((a, b) => b[1] - a[1]))
    process.stdout.write(`  ${k.padEnd(24)} ${v}\n`)

  const hostile = by('hostile')
  process.stdout.write('\nhostile features:\n')
  for (const [k, v] of Object.entries(hostile).sort((a, b) => b[1] - a[1]))
    process.stdout.write(`  ${k.padEnd(24)} ${v}\n`)
}
