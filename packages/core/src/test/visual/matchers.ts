import { expect } from 'vitest'

/**
 * Default pixel slack for geometry assertions: half a device pixel of layout
 * rounding on each of two edges, plus a little for sub-pixel transforms.
 * Every visual sheet used to redeclare this as `TOLERANCE = 1.5`.
 */
export const PX_TOLERANCE = 1.5

declare module 'vitest' {
  interface Matchers<T = any> {
    /**
     * `|received - expected| <= tolerance` (default `PX_TOLERANCE`, 1.5px).
     * Works synchronously and under `expect.poll`.
     */
    toBeNear: (expected: number, tolerance?: number) => void
  }
}

expect.extend({
  toBeNear(received: unknown, expected: number, tolerance: number = PX_TOLERANCE) {
    const { isNot, utils } = this
    if (typeof received !== 'number' || Number.isNaN(received)) {
      return {
        pass: false,
        message: () => `expected a finite number, received ${utils.printReceived(received)}`,
      }
    }
    const delta = Math.abs(received - expected)
    return {
      pass: delta <= tolerance,
      actual: received,
      expected,
      message: () =>
        `expected ${utils.printReceived(received)} ${isNot ? 'not ' : ''}to be within ±${tolerance} of ${utils.printExpected(expected)} (off by ${delta.toFixed(3)})`,
    }
  },
})
