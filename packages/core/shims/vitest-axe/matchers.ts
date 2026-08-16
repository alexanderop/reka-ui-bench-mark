import type { AxeResults, ImpactValue, Result } from 'axe-core'

// Browser-safe replacement for `vitest-axe/matchers`, aliased in the `browser`
// vitest project only (see `vite.config.ts`).
//
// The published matcher imports `chalk` for colouring, which pulls Node's
// `process`/`tty` into the bundle. Vitest already colours its own diffs, and
// `this.utils` gives us the same `matcherHint` / `printReceived` helpers the
// original imported from `jest-matcher-utils` — so the formatting below is the
// original's, with `chalk.grey` / `.yellow` / `.blue` dropped and nothing else
// changed.

interface MatcherContext {
  utils: {
    matcherHint: (name: string) => string
    printReceived: (value: unknown) => string
  }
}

export interface NoViolationsMatcherResult {
  actual: Result[]
  message: () => string | undefined
  pass: boolean
}

export interface AxeMatchers {
  /**
   * A custom matcher that can check aXe results for violations.
   */
  toHaveNoViolations: () => NoViolationsMatcherResult
}

function filterViolations(violations: Result[], impactLevels?: ImpactValue[]): Result[] {
  if (impactLevels && impactLevels.length > 0)
    return violations.filter(v => impactLevels.includes(v.impact!))

  return violations
}

/**
 * A custom matcher that can check aXe results for violations.
 *
 * @param results an instance of aXe's results object
 */
export function toHaveNoViolations(
  this: MatcherContext,
  results: AxeResults,
): NoViolationsMatcherResult {
  if (typeof results.violations === 'undefined')
    throw new TypeError('No violations found in aXe results object')

  const { matcherHint, printReceived } = this.utils

  const violations = filterViolations(
    results.violations,
    results.toolOptions ? (results.toolOptions as any).impactLevels : [],
  )

  const lineBreak = '\n\n'
  const horizontalLine = '─'.repeat(8)

  const formattedViolations = violations
    .map(violation => violation.nodes
      .map((node) => {
        const selector = node.target.join(', ')

        return `Expected the HTML found at $('${selector}') to have no violations:${lineBreak}`
          + `${node.html}${lineBreak}`
          + `Received:${lineBreak}`
          + `${printReceived(`${violation.help} (${violation.id})`)}${lineBreak}`
          + `${node.failureSummary}${lineBreak}`
          + `${violation.helpUrl ? `You can find more information on this issue here: \n${violation.helpUrl}` : ''}`
      })
      .join(lineBreak))
    .join(lineBreak + horizontalLine + lineBreak)

  const pass = formattedViolations.length === 0

  return {
    actual: violations,
    pass,
    message: () => pass
      ? undefined
      : `${matcherHint('.toHaveNoViolations')}\n\n${formattedViolations}`,
  }
}
