import type { AxeResults, RunOptions, Spec } from 'axe-core'
import axeCore from 'axe-core'

// Browser-safe replacement for `vitest-axe`, aliased in the `browser` vitest
// project only (see `vite.config.ts`). The published package cannot load in a
// browser: `vitest-axe/dist/index.js:9` does
//
//   const require = createRequire(import.meta.url); const axeCore = require('axe-core')
//
// and Vite externalises `node:module`, so `createRequire` is undefined and the
// import throws before a single test runs.
//
// The irony is that the CommonJS hop is the only browser-hostile thing about
// it. `axe-core` itself is browser-native — running in a real browser is what
// axe is *for* — so importing it directly is both simpler and more correct.
// Everything below is a faithful port of `vitest-axe`'s `src/axe.ts`, minus
// `createRequire` and minus the `lodash-es` dependency.

const { configure, run } = axeCore

function isHTMLElement(value: unknown): value is HTMLElement {
  return !!value && typeof value === 'object' && 'tagName' in value && 'outerHTML' in value
}

const HTML_TAG_RE = /<[^>]+>/

function isHTMLString(value: unknown): value is string {
  return typeof value === 'string' && HTML_TAG_RE.test(value)
}

/**
 * Deep merge standing in for `lodash-es`' `merge`, which is all the original
 * used it for. Right-most wins; plain objects recurse, everything else
 * (including arrays) is replaced rather than merged index-wise. That last part
 * is a deliberate divergence from lodash — index-wise array merging is a
 * footgun and axe's run options key rules by id, so nothing here relies on it.
 */
function mergeOptions<T extends Record<string, any>>(base: T, override: T): T {
  const result: Record<string, any> = { ...base }

  for (const [key, value] of Object.entries(override)) {
    const existing = result[key]
    result[key]
      = isPlainObject(existing) && isPlainObject(value)
        ? mergeOptions(existing, value)
        : value
  }

  return result as T
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Attach `html` to the document so axe has something laid out to inspect, and
 * hand back a restore function. An element already in the document is used
 * as-is; anything else is written into `document.body` and rolled back after.
 */
function mount(html: Element | string): [Element, () => void] {
  if (isHTMLElement(html)) {
    if (document.body.contains(html))
      return [html, () => {}]
    html = html.outerHTML
  }

  if (isHTMLString(html)) {
    const originalHTML = document.body.innerHTML
    document.body.innerHTML = html
    return [document.body, () => { document.body.innerHTML = originalHTML }]
  }

  if (typeof html === 'string')
    throw new TypeError(`html parameter ("${html}") has no elements`)

  throw new TypeError('html parameter should be an HTML string or an HTML element')
}

/**
 * Small wrapper for `axe.run` that enables promises, applies default options
 * and injects the html to be tested.
 *
 * @param options `globalOptions` is passed to `axe.configure`; every other
 * property becomes a default for the returned runner.
 */
export function configureAxe(
  options: RunOptions & { globalOptions?: Spec } = {},
): (html: Element | string, additionalOptions?: RunOptions) => Promise<AxeResults> {
  const { globalOptions = {}, ...runnerOptions } = options

  configure(globalOptions)

  return function axe(html, additionalOptions = {}) {
    const [element, restore] = mount(html)

    return new Promise<AxeResults>((resolve, reject) => {
      run(element, mergeOptions(runnerOptions, additionalOptions), (err, results) => {
        restore()
        if (err)
          reject(err)
        else
          resolve(results)
      })
    })
  }
}

export const axe: ReturnType<typeof configureAxe> = configureAxe()

export { axeCore as AxeCore }
