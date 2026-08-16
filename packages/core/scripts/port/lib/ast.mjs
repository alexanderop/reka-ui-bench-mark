// Shared AST helpers for the browser-mode port tooling.
//
// Everything here is deliberately parser-based rather than regex-based: the
// suites use `it.each`, template-literal names and nested describes, all of
// which a regex gets wrong in ways that quietly under-report.

import { readFileSync } from 'node:fs'
import ts from 'typescript'

const DESCRIBE = new Set(['describe', 'suite'])
const IT = new Set(['it', 'test'])

/**
 * Leftmost identifier of a callee chain: `it.each([...])` -> `it`.
 */
function rootName(expr) {
  let node = expr
  while (node) {
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))
      node = node.expression
    else if (ts.isCallExpression(node))
      node = node.expression
    else if (ts.isTaggedTemplateExpression(node))
      node = node.tag
    else
      break
  }
  return node && ts.isIdentifier(node) ? node.text : null
}

/**
 * Modifiers applied to a callee chain, outermost last: `it.skip.each` -> ['skip', 'each'].
 */
function modifiers(expr) {
  const mods = []
  let node = expr
  while (node) {
    if (ts.isCallExpression(node)) { node = node.expression }
    else if (ts.isTaggedTemplateExpression(node)) { node = node.tag }
    else if (ts.isPropertyAccessExpression(node)) {
      mods.unshift(node.name.text)
      node = node.expression
    }
    else {
      break
    }
  }
  return mods
}

/**
 * Test title as written. Template substitutions are kept as `${expr}` so that a
 * jsdom title and its browser port still compare equal.
 */
function titleOf(node) {
  if (!node)
    return '<none>'
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    return node.text
  if (ts.isTemplateExpression(node)) {
    let out = node.head.text
    for (const span of node.templateSpans)
      out += `\${${span.expression.getText()}}${span.literal.text}`
    return out
  }
  return `<dynamic:${node.getText().slice(0, 40)}>`
}

/**
 * Count `expect`-rooted calls in a subtree. `expect(a).toBe(b)` is one
 * assertion, not two, so we count the outermost call of a chain and stop
 * descending into its callee.
 */
function countAssertions(root) {
  let n = 0
  const visit = (node) => {
    if (ts.isCallExpression(node) && rootName(node.expression) === 'expect') {
      n++
      node.arguments.forEach(visit)
      return
    }
    ts.forEachChild(node, visit)
  }
  ts.forEachChild(root, visit)
  return n
}

/**
 * The `@finding <key>` tag from a test's leading comments, if any.
 *
 * This is what separates "this port found a real bug" from "this port was
 * quietly given up on". A quarantined test (`.fails` / `.skip`) is only
 * accepted when it points at a row in FINDINGS.tsv, so the escape hatch always
 * costs you a written finding.
 */
const FINDING_TAG = /@finding\s+(\S+)/

function findingOf(node, text) {
  for (const range of ts.getLeadingCommentRanges(text, node.getFullStart()) ?? []) {
    const match = FINDING_TAG.exec(text.slice(range.pos, range.end))
    if (match)
      return match[1]
  }
  return null
}

/**
 * Parse a vitest file into a flat list of tests, each carrying its full
 * describe path, its modifiers and how much it actually asserts.
 */
export function parseTestFile(file) {
  const text = readFileSync(file, 'utf8')
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const tests = []
  const suites = []

  const walk = (node, stack) => {
    if (ts.isCallExpression(node)) {
      const root = rootName(node.expression)
      const mods = modifiers(node.expression)
      const body = node.arguments.at(-1)

      if (DESCRIBE.has(root)) {
        const next = [...stack, titleOf(node.arguments[0])]
        suites.push({ path: next, mods })
        if (body)
          walk(body, next)
        return
      }

      if (IT.has(root)) {
        tests.push({
          path: [...stack, titleOf(node.arguments[0])],
          key: [...stack, titleOf(node.arguments[0])].join(' > '),
          mods,
          skipped: mods.includes('skip') || mods.includes('todo'),
          // `.fails` still runs the body — it asserts the test fails — so it
          // keeps its coverage. It is quarantine, not omission, but it is an
          // escape hatch either way and gets checked like one.
          expectedToFail: mods.includes('fails'),
          finding: findingOf(node, text),
          assertions: body ? countAssertions(body) : 0,
          line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        })
        return
      }
    }
    ts.forEachChild(node, child => walk(child, stack))
  }

  walk(source, [])
  return { file, text, tests, suites }
}
