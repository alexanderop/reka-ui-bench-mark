import type { CDPSession, Frame, Page } from 'playwright'
import type { BrowserCommand } from 'vitest/node'

// Custom browser commands for the `browser` vitest project.
//
// Why these exist: the locator API's only drag primitive is `dropTo()`, which
// presses, moves and releases in a single call. Some jsdom tests nest their
// describes around the *steps* of a gesture —
//
//   describe('after pointerdown') > describe('after pointermove') > describe('after pointerup')
//
// — with a `beforeEach` per step. `dropTo()` cannot be split across three hooks,
// and porting the gesture into one hook would make two of those describe names
// decorative. Playwright's `page.mouse` is stateful across calls, so exposing
// down / press / move / up separately keeps the ported structure honest.
//
// Coordinates are taken in the *tester iframe's* viewport — i.e. straight out
// of `getBoundingClientRect()` inside the test — and translated to page
// coordinates here. That translation is the whole reason this cannot live in
// the test file: `page.mouse` is page-level, and the tests run in an iframe.

interface PlaywrightMouseContext {
  page: { mouse: {
    move: (x: number, y: number) => Promise<void>
    down: () => Promise<void>
    up: () => Promise<void>
  } }
  iframe: { owner: () => { boundingBox: () => Promise<{ x: number, y: number } | null> } }
}

interface PlaywrightTouchContext {
  provider: { name: string, browserName?: string }
  page: Page
  frame: () => Promise<Frame>
  iframe: { owner: () => { boundingBox: () => Promise<{ x: number, y: number, width: number, height: number } | null> } }
}

interface PlaywrightFrameContext {
  provider: { name: string }
  page: Page
  frame: () => Promise<Frame>
}

export interface TouchPoint {
  x: number
  y: number
}

let clipboardQueue = Promise.resolve()

/**
 * Copy selected textarea text and paste it into a target with trusted keyboard
 * input, serialized across parallel tester pages that share the OS clipboard.
 */
export const copyPaste: BrowserCommand<[sourceSelector: string, targetSelector: string, expectedText: string]> = async (context, sourceSelector, targetSelector, expectedText) => {
  if (context.provider.name !== 'playwright')
    throw new Error(`copyPaste needs the playwright provider, got "${context.provider.name}"`)

  const previous = clipboardQueue
  let release!: () => void
  clipboardQueue = new Promise<void>((resolve) => {
    release = resolve
  })
  await previous

  try {
    const ctx = context as unknown as PlaywrightFrameContext
    const frame = await ctx.frame()
    const source = frame.locator(sourceSelector)
    await source.evaluate((element: HTMLTextAreaElement) => element.select())
    const selection = await source.evaluate((element: HTMLTextAreaElement) =>
      element.value.slice(element.selectionStart, element.selectionEnd))
    if (selection !== expectedText)
      throw new Error(`copyPaste selected ${JSON.stringify(selection)}, expected ${JSON.stringify(expectedText)}`)

    await ctx.page.keyboard.press('ControlOrMeta+C')
    await frame.locator(targetSelector).click()
    await ctx.page.keyboard.press('ControlOrMeta+V')
  }
  finally {
    release()
  }
}

async function toPageCoordinates(context: any, x: number, y: number) {
  if (context.provider.name !== 'playwright')
    throw new Error(`mouse commands need the playwright provider, got "${context.provider.name}"`)

  const ctx = context as unknown as PlaywrightMouseContext
  const box = await ctx.iframe.owner().boundingBox()
  if (!box)
    throw new Error('could not measure the tester iframe')

  return { page: ctx.page, x: box.x + x, y: box.y + y }
}

/** Move the mouse to a point, in tester-iframe viewport coordinates. */
export const mouseMove: BrowserCommand<[x: number, y: number]> = async (context, x, y) => {
  const { page, x: px, y: py } = await toPageCoordinates(context, x, y)
  await page.mouse.move(px, py)
}

/** Move to a point and press the primary button, leaving it held down. */
export const mouseDown: BrowserCommand<[x: number, y: number]> = async (context, x, y) => {
  const { page, x: px, y: py } = await toPageCoordinates(context, x, y)
  await page.mouse.move(px, py)
  await page.mouse.down()
}

/** Press the primary button at the mouse's current position without moving first. */
export const mousePress: BrowserCommand<[]> = async (context) => {
  const { page } = await toPageCoordinates(context, 0, 0)
  await page.mouse.down()
}

/** Release the primary button wherever the mouse currently is. */
export const mouseUp: BrowserCommand<[]> = async (context) => {
  const { page } = await toPageCoordinates(context, 0, 0)
  await page.mouse.up()
}

/**
 * Perform one trusted single-finger swipe in tester-iframe coordinates.
 *
 * This is deliberately a CDP escape hatch, not a synthetic TouchEvent helper:
 * `@vitest/browser@4.1.10/context.d.ts` exposes click, wheel and mouse-based
 * drag/drop on UserEvent (lines 189-367), but no touch gesture. The installed
 * Playwright provider implements Vitest's `cdp()` with
 * `page.context().newCDPSession(page)` and Chromium rejects that API on the
 * other engines, so callers must explicitly skip outside Chromium.
 */
export const touchSwipe: BrowserCommand<[points: TouchPoint[]]> = async (context, points) => {
  if (context.provider.name !== 'playwright')
    throw new Error(`touchSwipe needs the playwright provider, got "${context.provider.name}"`)

  const ctx = context as unknown as PlaywrightTouchContext
  if (ctx.provider.browserName !== 'chromium')
    throw new Error(`touchSwipe needs Chromium CDP, got "${ctx.provider.browserName ?? 'unknown'}"`)
  if (points.length < 2)
    throw new Error('touchSwipe needs at least a start and end point')

  const box = await ctx.iframe.owner().boundingBox()
  if (!box)
    throw new Error('could not measure the tester iframe')

  const frame = await ctx.frame()
  const viewport = await frame.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }))
  const toPagePoint = ({ x, y }: TouchPoint) => ({
    x: box.x + x * (box.width / viewport.width),
    y: box.y + y * (box.height / viewport.height),
  })

  let cdp: CDPSession | undefined
  let touchActive = false
  try {
    cdp = await ctx.page.context().newCDPSession(ctx.page)
    const [start, ...moves] = points.map(toPagePoint)
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ ...start, id: 1 }],
    })
    touchActive = true

    for (const point of moves) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ ...point, id: 1 }],
      })
      // Let Chromium produce distinct trusted touchmove samples. Without time
      // between CDP calls an entire swipe can collapse into one coalesced move.
      await new Promise(resolve => setTimeout(resolve, 20))
    }

    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    touchActive = false
  }
  finally {
    if (touchActive)
      await cdp?.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
    await cdp?.detach()
  }
}
