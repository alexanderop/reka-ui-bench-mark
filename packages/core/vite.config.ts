import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import { playwright } from '@vitest/browser-playwright'
import tailwindcss from 'tailwindcss'
import { defineConfig } from 'vitest/config'
import tailwindConfig from './tailwind.browser.config.js'
import { mouseDown, mouseMove, mousePress, mouseUp } from './vitest.browser.commands.ts'

/**
 * Test files that need no DOM at all, and therefore never needed jsdom.
 *
 * The migration's goal is to delete jsdom outright, not to keep it for the
 * cheap cases: every file that touches the DOM goes to browser mode, and every
 * file that does not comes here instead. Identified by scanning all 97 files
 * for DOM signals and then *verified by running them* in `environment: 'node'`
 * with no setup file — 10 files, 571 tests, all green.
 *
 * This list only exists while the migration is in flight. The end state is
 * `*.test.ts` = node, `*.browser.test.ts` = browser, and no `unit` project at
 * all; until then the jsdom project has to exclude these explicitly or they
 * would run twice.
 */
const NODE_TESTS = [
  './src/Drawer/utils.test.ts',
  './src/Splitter/utils/callPanelCallbacks.test.ts',
  './src/Splitter/utils/units.test.ts',
  './src/Splitter/utils/validation.test.ts',
  './src/date/calendar.test.ts',
  './src/index.test.ts',
  './src/shared/color/gradient.test.ts',
  './src/shared/color/utils.test.ts',
  './src/shared/useNonce.test.ts',
  './src/shared/useSingleOrMultipleValue.test.ts',
]

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

    // Three runners over the same source tree. `extends: true` pulls in the
    // plugins and the `@` alias above; everything environment-specific has to
    // be declared per project, because the browser project must NOT inherit
    // the jsdom setup file (canvas mock, jest-dom matchers, getComputedStyle
    // patch) — none of it applies in a real browser and some of it collides.
    //
    // `unit` is the one being deleted. It shrinks as files move to `browser`
    // (DOM-dependent) or `node` (not), and the migration is finished when its
    // include list matches nothing.
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: NODE_TESTS,
          exclude: ['**/node_modules/**'],
          // Deliberately no setupFiles: `vitest.setup.ts` exists entirely to
          // paper over jsdom (canvas mock, jest-dom matchers, a
          // getComputedStyle patch). A file that needs none of that needs none
          // of that.
        },
      },
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          include: ['./**/*.test.{ts,js}'],
          // without this the glob above also swallows the browser tests, and
          // the node ones would run twice — once per environment
          exclude: ['**/node_modules/**', '**/*.browser.test.ts', ...NODE_TESTS],
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
            // `actionTimeout` is a *failure*-cost lever, not a speed one; the
            // green suite runs the same with or without it. Without it,
            // `processTimeoutOptions` (vitest 4.1.10,
            // browser/src/client/tester/tester-utils.ts:193-223) hands a
            // failing locator action or `expect.element` the *remaining test
            // timeout* — which browser mode defaults to 15000ms, not 5000
            // (resolveConfig.ts:935). Measured: a failing assertion cost
            // 14918ms. Setting this makes that path return early, so a failing
            // action costs 2s and a failing `expect.element` falls back to
            // expect.poll's own 1000ms default (measured 1025ms).
            //
            // 2000 rather than 1000 for headroom: the suite is green at 1000,
            // 1 file fails at 500 and 12 fail at 300, so the slowest legitimate
            // wait here is ~500-1000ms and CI hardware is slower than this.
            provider: playwright({ actionTimeout: 2000 }),
            headless: true,
            instances: [{ browser: 'chromium' }],
            // `page.mouse` is stateful and page-level; the locator API's only
            // drag primitive (`dropTo`) is atomic and iframe-local. These commands
            // let a gesture be split across `beforeEach` hooks — see
            // `vitest.browser.commands.ts`.
            commands: { mouseDown, mouseMove, mousePress, mouseUp },
          },
        },
      },
    ],
  },
})
