import { expect, it } from 'vitest'

// Harness smoke test. Deliberately imports nothing: if this passes, Playwright
// launched, the tester iframe booted and the project split routed the file to
// the browser runner. If it fails, the problem is config, not a test.
//
// The two assertions are the point of the whole exercise — `Slider.test.ts`
// has to hand-mock both of these before it can run under jsdom.
it('should run in a real browser', () => {
  expect(typeof window.ResizeObserver).toBe('function')
  expect(typeof HTMLElement.prototype.setPointerCapture).toBe('function')
})
