import { vi } from 'vitest'

export const handleSubmit = vi.fn((e) => {
  e.preventDefault()
  const formData = new FormData(e.target)
  return Object.fromEntries(formData as any)
})

export const sleep = (duration: number) => new Promise(resolve => setTimeout(resolve, duration))

/**
 * Where a browser test parks the real mouse, in tester-iframe CSS px.
 *
 * The pointer survives render cleanup (Vitest resets held keys before each
 * test, never the pointer — `docs/api/browser/interactivity.md:43-56`), so a
 * hover left over the previous fixture can pre-trigger the next one. The
 * `browser` project pins `contextOptions.viewport` to 414×896
 * (`vite.config.ts`), and every fixture renders top-left, so this point must
 * be on bare body outside all of them: x=390 clears the 200px fixtures, and
 * y=200 clears the 414×32 `RatingRoot`, whose preview resets on ITS
 * `mouseleave` — (390, 5) was inside it and only ever "worked" because the
 * unscaled harness threw the pointer out of the iframe altogether
 * (`FINDINGS.tsv` Rating/Rating.test.ts#leave-point-was-inside-the-root).
 */
export const PARK = { x: 390, y: 200 } as const
