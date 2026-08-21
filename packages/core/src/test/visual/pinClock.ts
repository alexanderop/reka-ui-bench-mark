import { afterEach, beforeEach, vi } from 'vitest'

/**
 * Pin `Date` for every test in the file, leaving timers, rAF and
 * `performance` real. For stories whose rendered output depends on *today* —
 * a calendar with no value opens on the current month, `now()` placeholders
 * carry the current time — this is what makes the reference deterministic.
 *
 * Only `Date` is faked: the default `toFake` set would freeze
 * `requestAnimationFrame` and starve floating-ui and ResizeObserver
 * pipelines (see the fake-timers gotcha in AGENTS.md). `shouldAdvanceTime`
 * keeps `Date.now()` moving from the pinned instant, so nothing that
 * measures elapsed time sees a frozen clock.
 */
export function pinClock(now: Date) {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now, shouldAdvanceTime: true })
  })
  afterEach(() => {
    vi.useRealTimers()
  })
}

/** Noon UTC, so every timezone from UTC−11 to UTC+11 agrees on the calendar date. */
export const PINNED_TODAY = new Date(Date.UTC(2024, 1, 14, 12))
