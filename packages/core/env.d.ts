/// <reference types="vite/client" />
/// <reference types="vitest/globals" />
/// <reference types="vitest/jsdom" />
/// <reference types="@testing-library/jest-dom/vitest" />
/// <reference types="../../.histoire/node_modules/@histoire/plugin-vue/components" />

import type { AxeMatchers } from 'vitest-axe/matchers'
import 'vitest'
import 'vitest/browser'

declare module 'vitest' {
  export interface Assertion extends AxeMatchers {}
  export interface AsymmetricMatchersContaining extends AxeMatchers {}
}

declare module 'vitest/browser' {
  interface BrowserCommands {
    copyPaste: (sourceSelector: string, targetSelector: string, expectedText: string) => Promise<void>
    mouseDown: (x: number, y: number) => Promise<void>
    mouseMove: (x: number, y: number) => Promise<void>
    mousePress: () => Promise<void>
    mouseUp: () => Promise<void>
    touchSwipe: (points: Array<{ x: number, y: number }>) => Promise<void>
  }
}
