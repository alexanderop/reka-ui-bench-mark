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
// down / move / up separately keeps the ported structure honest.
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

/** Release the primary button wherever the mouse currently is. */
export const mouseUp: BrowserCommand<[]> = async (context) => {
  const { page } = await toPageCoordinates(context, 0, 0)
  await page.mouse.up()
}
