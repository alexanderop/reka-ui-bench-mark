import { resolve } from 'node:path'
import process from 'node:process'
import vue from '@vitejs/plugin-vue'
import { playwright } from '@vitest/browser-playwright'
import tailwindcss from 'tailwindcss'
import { defineConfig } from 'vitest/config'
import tailwindConfig from './tailwind.browser.config.js'
import { copyPaste, mouseDown, mouseMove, mousePress, mouseUp, touchSwipe } from './vitest.browser.commands.ts'

/**
 * The browser corpus on the engines it was *not* written against.
 *
 * Same full functional `*.browser.test.ts` corpus, same CSS shim, same axe shims and custom
 * commands as the `browser` project in `vite.config.ts` — but Firefox and
 * WebKit instead of Chromium, one instance per `CROSS_BROWSERS` entry. Kept out
 * of the default config on purpose: the ports are developed and kept green on
 * Chromium, the cross-browser run is where engine differences are *recorded*
 * (`cross-browser.expectations.ts`), and running three engines in one process
 * contends for CPU badly enough to fail Chromium tests that are green alone
 * (measured: 11 Chromium failures in a 3-engine run, 0 with Chromium alone).
 *
 *   CROSS_BROWSERS=firefox pnpm test:cross-browser        # one engine
 *   pnpm test:cross-browser                               # firefox,webkit
 */
const ENGINES = (process.env.CROSS_BROWSERS ?? 'firefox,webkit')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean) as Array<'chromium' | 'firefox' | 'webkit'>

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
      'vitest-axe/matchers': resolve(import.meta.dirname, 'shims/vitest-axe/matchers.ts'),
      'vitest-axe': resolve(import.meta.dirname, 'shims/vitest-axe/index.ts'),
    },
  },
  css: {
    postcss: {
      plugins: [tailwindcss(tailwindConfig)],
    },
  },
  test: {
    name: 'cross-browser',
    globals: true,
    globalSetup: './vitest.global.ts',
    include: ['./**/*.browser.test.ts'],
    exclude: ['**/node_modules/**', '**/*.visual.browser.test.ts'],
    setupFiles: ['./vitest.browser.setup.ts', './vitest.cross-browser.setup.ts'],
    // ColorArea's 'thumb gains focus when dragging starts' dispatches a synthetic
    // pointerdown with `pointerId: 1`; Firefox numbers the mouse 0, so the
    // component's `setPointerCapture(1)` throws out of the event handler as an
    // unhandled error — the same fact the expectation row for that test records
    // (FINDINGS.tsv cross-browser#firefox-mouse-pointerid-0). Filter exactly
    // that message and nothing else, so the run can report the test verdict
    // rather than die on the side effect.
    onUnhandledError(error) {
      if (error.message === 'Element.setPointerCapture: Invalid pointer id')
        return false
    },
    // One file at a time. Firefox and WebKit route keyboard and focus to the
    // *active* tab, and Vitest runs files in parallel tabs of one context —
    // so focus-dependent tests (segment focusout snapping, Tab order, a
    // pointerdown that should focus a thumb) fail when another file is
    // running beside them and pass alone. Measured on the whole corpus:
    // Firefox 30 failures parallel → 18 serial, WebKit 13 → 12, and every
    // failure that vanished was a focus or keyboard-routing assertion.
    // Serial costs ~2.5× wall clock (Firefox 35s → 87s, WebKit 21s → 81s).
    fileParallelism: false,
    browser: {
      enabled: true,
      provider: playwright({
        actionTimeout: 2000,
        contextOptions: {
          // Chromium and Firefox inherit `process.env.TZ` from the Vitest
          // process; WebKit does not and reports the host zone (measured:
          // `Europe/Berlin` in every ZonedDateTime test). Configure it.
          timezoneId: 'America/New_York',
          // Same as the `browser` project: keep the outer page the size of
          // the tester iframe so `page.mouse` commands are not CSS-scaled.
          viewport: { width: 414, height: 896 },
        },
      }),
      headless: true,
      // Same as the `browser` project — exact text/name matching by default.
      locators: { exact: true },
      instances: ENGINES.map(browser => ({ browser })),
      commands: { copyPaste, mouseDown, mouseMove, mousePress, mouseUp, touchSwipe },
    },
  },
})
