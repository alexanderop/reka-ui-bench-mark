import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import { playwright } from '@vitest/browser-playwright'
import tailwindcss from 'tailwindcss'
import { defineConfig } from 'vitest/config'
import tailwindConfig from './tailwind.browser.config.js'

/**
 * Visual story sheets are deliberately separate from the browser migration
 * corpus. Their PNG references are browser/platform-specific and need a
 * controlled update workflow; functional browser and coverage runs should not
 * start depending on whichever OS last refreshed an image.
 */
/**
 * An element screenshot cannot paint what lies below the tester iframe's own
 * box: a sheet taller than the viewport comes back full-height but white
 * below the fold (measured: the 1368px ColorArea demo sheet at a 1000px
 * viewport). Histoire demo sheets run to ~1650px, so the iframe — and the
 * outer Playwright page, to avoid scaling — are this tall. Width stays 900:
 * sheets are a fixed 760px and Tailwind's `sm:` breakpoint is already met.
 * Both helpers assert the sheet fits before capturing.
 */
const VIEWPORT_HEIGHT = 3600

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
    },
  },
  css: {
    postcss: {
      plugins: [tailwindcss(tailwindConfig)],
    },
  },
  test: {
    name: 'visual',
    include: ['./**/*.visual.browser.test.ts'],
    // Chrome fires this benign error event when one frame's layout changes
    // faster than ResizeObserver can deliver (ScrollArea's mount does: the
    // measured thumb var lands while the corner is still sizing). It is a
    // "notifications deferred to next frame" warning, not an app error —
    // filter exactly it, nothing else.
    onUnhandledError(error) {
      if (error.message.includes('ResizeObserver loop completed with undelivered notifications'))
        return false
    },
    exclude: ['**/node_modules/**'],
    setupFiles: './vitest.visual.setup.ts',
    browser: {
      enabled: true,
      provider: playwright({
        actionTimeout: 2000,
        // Vitest 4.1.10 does not apply the instance viewport to Playwright's
        // outer context when the browser UI is disabled. Without this, the
        // tester iframe is CSS-scaled and element screenshots are downsampled.
        contextOptions: {
          viewport: { width: 900, height: VIEWPORT_HEIGHT },
        },
      }),
      headless: true,
      instances: [{
        browser: 'chromium',
        viewport: { width: 900, height: VIEWPORT_HEIGHT },
      }],
    },
  },
})
