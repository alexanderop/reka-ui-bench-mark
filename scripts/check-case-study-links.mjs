import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const documents = [
  'README.md',
  'AGENTS.md',
  'PORTING.md',
  'MIGRATING-TO-BROWSER-MODE.md',
  'VITEST-BROWSER-MODE-COOKBOOK.md',
  'PERFORMANCE.md',
  'A11Y-FINDINGS.md',
  'IMPROVING-PORTED-TESTS.md',
  'IMPROVING-PORTED-TESTS-VITEST-5.md',
  'CONTRIBUTING.md',
]

const failures = []

for (const document of documents) {
  const source = readFileSync(resolve(root, document), 'utf8')

  for (const match of source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const rawTarget = match[1].trim().replace(/^<|>$/g, '')
    if (/^(?:https?:|mailto:|#)/.test(rawTarget))
      continue

    const target = decodeURIComponent(rawTarget.split('#')[0])
    if (!target)
      continue

    const path = resolve(root, dirname(document), target)
    if (!existsSync(path)) {
      const line = source.slice(0, match.index).split('\n').length
      failures.push(`${document}:${line}: ${rawTarget}`)
    }
  }
}

if (failures.length) {
  console.error(`Broken local case-study links:\n${failures.map(failure => `- ${failure}`).join('\n')}`)
  process.exitCode = 1
}
