import { beforeEach, describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import { render } from 'vitest-browser-vue'
import Popover from './story/_Popover.vue'

describe('given default Popover', () => {
  let screen: Awaited<ReturnType<typeof render>>

  beforeEach(async () => {
    screen = await render(Popover)
  })

  it('should pass axe accessibility tests', async () => {
    expect(await axe(screen.container)).toHaveNoViolations()
  })

  describe('after opening popover', async () => {
    beforeEach(async () => {
      const trigger = screen.getByRole('button', { name: 'Update dimensions', exact: true })
      await trigger.click()

      await expect.element(trigger).toHaveAttribute('aria-expanded', 'true')
      await expect.element(screen.getByRole('dialog')).toBeVisible()
      await expect.poll(() => {
        const wrapper = document.querySelector<HTMLElement>('[data-reka-popper-content-wrapper]')
        return {
          exists: wrapper !== null,
          isMeasuring: wrapper?.style.transform.includes('%') ?? true,
        }
      }).toEqual({ exists: true, isMeasuring: false })
    })

    it('should pass axe accessibility tests', async () => {
      expect(await axe(document.body)).toHaveNoViolations()
    })
  })
})
