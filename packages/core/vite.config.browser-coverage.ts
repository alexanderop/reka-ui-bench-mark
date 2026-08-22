import { defineConfig, mergeConfig } from 'vitest/config'
import baseConfig from './vite.config.ts'

/**
 * Production coverage from the Chromium Browser Mode corpus only.
 *
 * `coverage.include` is intentionally explicit so unloaded production files
 * remain visible as gaps. The exclusions keep fixtures and test
 * infrastructure out of the product signal; `--project=browser` lives in the
 * package command so this report never merges jsdom or node coverage.
 */
export default mergeConfig(baseConfig, defineConfig({
  test: {
    coverage: {
      include: ['src/**/*.{ts,vue}'],
      exclude: [
        'src/**/*.{test,spec}.{ts,tsx,js,jsx,vue}',
        'src/**/*.test-d.ts',
        'src/**/*.story.*',
        'src/**/story/**',
        'src/**/stories/**',
        'src/test/**',
        'src/**/__test__/**',
        'src/**/__tests__/**',
        'src/**/__snapshots__/**',
        'src/**/__screenshots__/**',
        'src/**/*.snap',
        'shims/**',
        'vite.config.visual.ts',
        'vitest.visual.setup.ts',
      ],
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage/browser-production',
    },
  },
}))
