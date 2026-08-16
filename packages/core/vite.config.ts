import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import { playwright } from '@vitest/browser-playwright'
import tailwindcss from 'tailwindcss'
import { defineConfig } from 'vitest/config'
import tailwindConfig from './tailwind.browser.config.js'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },

  test: {
    globals: true,
    coverage: {
      provider: 'istanbul', // or 'v8'
    },
    globalSetup: './vitest.global.ts',

    // Two runners over the same source tree. `extends: true` pulls in the
    // plugins and the `@` alias above; everything environment-specific has to
    // be declared per project, because the browser project must NOT inherit
    // the jsdom setup file (canvas mock, jest-dom matchers, getComputedStyle
    // patch) — none of it applies in a real browser and some of it collides.
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          include: ['./**/*.test.{ts,js}'],
          // without this the glob above also swallows the browser tests
          exclude: ['**/node_modules/**', '**/*.browser.test.ts'],
          setupFiles: './vitest.setup.ts',
          server: {
            deps: {
              inline: ['vitest-canvas-mock'],
            },
          },
          environmentOptions: {
            jsdom: {
              resources: 'usable',
            },
          },
        },
      },
      {
        extends: true,
        // `vitest-axe` cannot load in a browser: its dist does
        // `createRequire(import.meta.url)` to reach `axe-core`, and Vite
        // externalises `node:module`, so the import throws before any test
        // runs. `vitest-axe/matchers` separately pulls in `chalk`. Both are
        // redirected to browser-safe shims that talk to `axe-core` directly —
        // which is browser-native, and is what axe is *for*. Aliased here
        // rather than in the ported test files so those keep the same imports
        // as their jsdom originals.
        //
        // This block *adds to* the root `resolve.alias` rather than replacing
        // it — verified — so `@` does not need re-declaring here.
        resolve: {
          alias: {
            'vitest-axe/matchers': resolve(__dirname, 'shims/vitest-axe/matchers.ts'),
            'vitest-axe': resolve(__dirname, 'shims/vitest-axe/index.ts'),
          },
        },
        // Compile the story fixtures' Tailwind classes. Nothing else does, and
        // without it the fixtures render at exactly 0x0 and Playwright refuses
        // to click them. Scoped to this project so the jsdom run stays
        // untouched. `src/css-shim.browser.test.ts` guards this.
        css: {
          postcss: {
            plugins: [tailwindcss(tailwindConfig)],
          },
        },
        test: {
          name: 'browser',
          include: ['./**/*.browser.test.ts'],
          exclude: ['**/node_modules/**'],
          setupFiles: './vitest.browser.setup.ts',
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
})
