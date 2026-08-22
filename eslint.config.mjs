import antfu from '@antfu/eslint-config'

export default antfu(
  {
    vue: {
      overrides: {
        'vue/max-attributes-per-line': ['error', {
          singleline: 1,
          multiline: 1,
        }],
      },
    },
    typescript: true,
    markdown: {
      overrides: {
        'vue/max-attributes-per-line': 'off', // in documentation we allow more attributes per line
      },
    },
  },
  {
    ignores: [
      '*.js',
      // Code blocks inside the browser-mode docs. They quote third-party build
      // output verbatim (so `module` must not become `node:module`) and use
      // deliberately partial snippets to illustrate a pattern, which the TS
      // parser cannot help but reject. The prose in these files is still
      // linted — only the extracted blocks are skipped.
      'AGENTS.md/**',
      'CLAUDE.md/**',
      'PORTING.md/**',
      'MIGRATING-TO-BROWSER-MODE.md/**',
    ],
  },
  {
    rules: {
      'ts/no-non-null-asserted-optional-chain': 'off',
      'ts/ban-ts-comment': 'warn',
      'ts/consistent-type-definitions': 'off',
      'ts/no-unsafe-function-type': 'off',
      'ts/no-unused-expressions': 'off',
      'ts/no-empty-object-type': 'off',
      'symbol-description': 'off',
      'no-console': 'warn',
      'import/first': 'off',
      'import/order': 'off',
      'style/max-statements-per-line': ['error', { max: 2 }],
      'vue/one-component-per-file': 'off',
      'unicorn/prefer-dom-node-text-content': 'off',
      'unicorn/prefer-number-properties': 'off',
      'unused-imports/no-unused-vars': 'off',
      'regexp/no-super-linear-backtracking': 'off',
      'markdown/heading-increment': 'off',
      'markdown/no-multiple-h1': 'off',
    },
  },
  {
    // Markdown processors expose fenced examples as virtual child files.
    // Console calls there are documentation, not package runtime logging.
    files: ['**/*.md/**'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    // Both interfaces extend PopoverContentEmits, which declares
    // openAutoFocus. The template rule cannot follow the imported extension.
    files: [
      'packages/core/src/DatePicker/DatePickerContent.vue',
      'packages/core/src/DateRangePicker/DateRangePickerContent.vue',
    ],
    rules: {
      'vue/require-explicit-emits': 'off',
    },
  },
  {
    files: ['*.story.vue'],
    rules: {
      'no-console': 'off',
      'no-alert': 'off',
      'unused-imports/no-unused-vars': 'off',
    },
  },
  {
    files: ['**/package.json'],
    rules: {
      // Wrecks the order of `files` otherwise, and breaks the exclusion patterns
      // pnpm has no issues with that, but npm does and doesn't apply the correct config
      'jsonc/sort-array-values': 'off',
    },
  },
)
