import { blackA, grass, green, indigo, mauve, purple, red, slate, teal, violet } from '@radix-ui/colors'
import plugin from 'tailwindcss/plugin'

// Tailwind config used *only* by the `browser` vitest project, to compile
// `vitest.browser.css`. See `vite.config.ts`.
//
// Why this exists: the story fixtures under `src/**/story/_*.vue` are styled
// with Tailwind classes, but Tailwind is only ever compiled by Histoire
// (`.histoire/tailwind.config.js`). Nothing compiled it for tests. Under jsdom
// that was invisible, because every rect is 0x0 regardless. In a real browser
// the components collapse to ~0x0 and **Playwright refuses to click a
// zero-size element**, which blocks every geometry-dependent test.
//
// This is a deliberately trimmed copy of the Histoire config. Two differences,
// both intentional:
//
//  1. **No keyframes / animation theme, and no `tailwindcss-animate`.** The
//     `animate-*` classes therefore compile to nothing and elements settle
//     instantly. That is both what jsdom did (so ported tests keep behaving
//     the same) and what we want from Playwright, whose actionability checks
//     wait for an element to stop moving before clicking it. Reka's
//     `usePresence` already handles `animation-name: none`.
//  2. **`content` points at this package**, not at a sibling directory.
//
// The colours are kept. They cost nothing, they make the rendered fixture
// match what Histoire shows, and axe's `color-contrast` rule — which is inert
// under jsdom but very much alive in Chromium — needs real computed colours to
// return a meaningful answer.

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./src/**/*.vue'],
  theme: {
    extend: {
      colors: {
        ...blackA,
        ...mauve,
        ...violet,
        ...green,
        ...grass,
        ...red,
        ...indigo,
        ...purple,
        ...teal,
        ...slate,
      },
      transitionDuration: {
        250: '250ms',
      },
    },
  },
  plugins: [
    plugin(({ matchUtilities }) => {
      matchUtilities({
        perspective: value => ({
          perspective: value,
        }),
      })
    }),
  ],
}
