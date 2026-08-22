import { expect } from 'vitest'
import { configureAxe } from 'vitest-axe'
import * as matchers from 'vitest-axe/matchers'
import './vitest.browser.css'

const COMPILER_DECODE_WARNING = '[@vue/compiler-core] decodeEntities option is passed but will be ignored in non-browser builds.'
const RESIZE_OBSERVER_WARNING = 'ResizeObserver loop completed with undelivered notifications.'

const consoleFilterKey = '__rekaUiBrowserConsoleFilter'
const browserGlobal = globalThis as typeof globalThis & { __rekaUiBrowserConsoleFilter?: true }

if (!browserGlobal[consoleFilterKey]) {
  const originalWarn = console.warn.bind(console)
  const originalError = console.error.bind(console)

  // Runtime-compiled test fixtures make Vue Test Utils pass the browser-only
  // decode hook through the bundled compiler. Vue logs this exact
  // infrastructure warning once per fixture even though the template compiles
  // correctly. Preserve every application warning.
  console.warn = (...args) => {
    if (args.length === 1 && args[0] === COMPILER_DECODE_WARNING)
      return
    originalWarn(...args)
  }

  // Firefox and WebKit stringify the same standards-defined ResizeObserver
  // deferral event before forwarding it to console.error. The cross-browser
  // config records the exact onUnhandledError verdict; keep the duplicate log
  // quiet without touching any other error.
  console.error = (...args) => {
    const message = args[0] instanceof Error ? args[0].message : String(args[0])
    if (message === RESIZE_OBSERVER_WARNING)
      return
    originalError(...args)
  }

  browserGlobal[consoleFilterKey] = true
}

// Setup for the `browser` vitest project. Deliberately *not* `vitest.setup.ts`
// — that one loads `vitest-canvas-mock`, `@testing-library/jest-dom/vitest`
// (browser mode ships its own fork of those matchers) and a `getComputedStyle`
// patch for a jsdom bug Chrome does not have. None of it applies here and some
// of it collides.
//
// What *is* shared with the jsdom setup is the axe wiring, so the ported
// accessibility tests read identically to their originals. Both `vitest-axe`
// specifiers are aliased to browser-safe shims under `shims/vitest-axe/` —
// see `vite.config.ts` for why.

expect.extend(matchers)

configureAxe({
  globalOptions: {
    rules: [{
      id: 'region',
      enabled: false,
    }],
  },
})
