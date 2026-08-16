import { expect } from 'vitest'
import { configureAxe } from 'vitest-axe'
import * as matchers from 'vitest-axe/matchers'
import './vitest.browser.css'

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
