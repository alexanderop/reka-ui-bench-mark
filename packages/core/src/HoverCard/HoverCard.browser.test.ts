import { beforeEach, describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import { render } from 'vitest-browser-vue'
import { userEvent } from 'vitest/browser'
import { sleep } from '@/test'
import HoverCard from './story/_HoverCard.vue'

function touchTap(element: HTMLElement) {
  element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch' }))
}

describe('given a default HoverCard', () => {
  let screen: Awaited<ReturnType<typeof render>>
  beforeEach(async () => { screen = await render(HoverCard) })

  it('should pass axe accessibility tests', async () => {
    expect(await axe(screen.container.firstElementChild as HTMLElement)).toHaveNoViolations()
  })

  describe('after mouse enter for a 100ms', () => {
    // @finding HoverCard/HoverCard.test.ts#open-color-contrast
    it.fails('should pass axe accessibility tests', async () => {
      await userEvent.hover(screen.getByRole('link'))
      await sleep(100)
      expect(await axe(document.body)).toHaveNoViolations()
    })
  })

  describe('a touch tap on the trigger', () => {
    it('should not open the hover card by default', async () => {
      const trigger = screen.getByRole('link').element()
      touchTap(trigger)
      await sleep(100)
      expect(trigger.getAttribute('data-state')).toBe('closed')
    })
  })
})

describe('given a HoverCard with enableTouch', () => {
  let screen: Awaited<ReturnType<typeof render>>
  beforeEach(async () => { screen = await render(HoverCard, { props: { enableTouch: true } }) })

  it('should toggle open/closed on touch tap', async () => {
    const trigger = screen.getByRole('link').element()
    touchTap(trigger)
    await expect.element(trigger).toHaveAttribute('data-state', 'open')
    touchTap(trigger)
    await expect.element(trigger).toHaveAttribute('data-state', 'closed')
  })

  it('should ignore non-touch pointers', async () => {
    const trigger = screen.getByRole('link').element()
    trigger.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse' }))
    await expect.element(trigger).toHaveAttribute('data-state', 'closed')
  })

  // @finding HoverCard/HoverCard.test.ts#pending-focus-reopens
  it.fails('should not reopen from a pending focus timer after closing on touch', async () => {
    const trigger = screen.getByRole('link').element()
    trigger.focus()
    touchTap(trigger)
    await expect.element(trigger).toHaveAttribute('data-state', 'open')
    touchTap(trigger)
    await sleep(150)
    expect(trigger.getAttribute('data-state')).toBe('closed')
  })
})
