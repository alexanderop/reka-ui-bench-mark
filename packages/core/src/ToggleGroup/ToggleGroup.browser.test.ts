import type { Locator } from 'vitest/browser'
import { beforeEach, describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import { render } from 'vitest-browser-vue'
import { page, userEvent } from 'vitest/browser'
import ToggleGroup from './story/_ToggleGroup.vue'

type ToggleGroupScreen = Awaited<ReturnType<typeof render<typeof ToggleGroup>>>

function getTriggers(screen: ToggleGroupScreen): [Locator, Locator, Locator] {
  const buttons = screen.container.querySelectorAll('button')
  return [page.elementLocator(buttons[0]), page.elementLocator(buttons[1]), page.elementLocator(buttons[2])]
}

async function focusAndPress(trigger: Locator, key: 'ArrowLeft' | 'ArrowRight') {
  const element = trigger.element()
  element.focus()
  if (document.activeElement !== element)
    throw new Error('Toggle did not receive focus')
  await userEvent.keyboard(`{${key}}`)
}

describe('given default Toggle Group', () => {
  let screen: ToggleGroupScreen
  let triggers: [Locator, Locator, Locator]

  beforeEach(async () => {
    screen = await render(ToggleGroup, {
      props: {
        defaultValue: 'center',
      },
    })
    triggers = getTriggers(screen)
  })

  it('should pass axe accessibility tests', async () => {
    expect(await axe(screen.container.firstElementChild!)).toHaveNoViolations()
  })

  it('should have active toggle=center', async () => {
    await expect.element(triggers[0]).toHaveAttribute('data-state', 'off')
    await expect.element(triggers[1]).toHaveAttribute('data-state', 'on')
    await expect.element(triggers[2]).toHaveAttribute('data-state', 'off')
  })

  describe('after toggling current active', () => {
    beforeEach(async () => {
      await triggers[1].click()
    })

    it('should deselect pre-existing value', async () => {
      await expect.element(triggers[0]).toHaveAttribute('data-state', 'off')
      await expect.element(triggers[1]).toHaveAttribute('data-state', 'off')
      await expect.element(triggers[2]).toHaveAttribute('data-state', 'off')
    })
  })

  describe('after triggering ArrowRight', () => {
    beforeEach(async () => {
      await focusAndPress(triggers[1], 'ArrowRight')
    })

    it('should received focus for the next toggle', async () => {
      expect(triggers[2].element()).toBe(document.activeElement)
    })

    describe('after toggling', () => {
      beforeEach(async () => {
        await triggers[2].click()
      })

      it('should have next active value', async () => {
        await expect.element(triggers[0]).toHaveAttribute('data-state', 'off')
        await expect.element(triggers[1]).toHaveAttribute('data-state', 'off')
        await expect.element(triggers[2]).toHaveAttribute('data-state', 'on')
      })

      describe('after triggering ArrowRight again', () => {
        beforeEach(async () => {
          await userEvent.keyboard('{ArrowRight}')
        })

        it('should received focus for the first toggle', async () => {
          expect(triggers[0].element()).toBe(document.activeElement)
        })
      })
    })
  })

  describe('after triggering ArrowLeft', () => {
    beforeEach(async () => {
      await focusAndPress(triggers[1], 'ArrowLeft')
    })

    it('should received focus for the next toggle', async () => {
      expect(triggers[0].element()).toBe(document.activeElement)
    })

    describe('after toggling', () => {
      beforeEach(async () => {
        await triggers[0].click()
      })

      it('should have next active value', async () => {
        await expect.element(triggers[0]).toHaveAttribute('data-state', 'on')
        await expect.element(triggers[1]).toHaveAttribute('data-state', 'off')
        await expect.element(triggers[2]).toHaveAttribute('data-state', 'off')
      })
    })
  })
})

describe('given multiple value Toggle Group', () => {
  let screen: ToggleGroupScreen
  let triggers: [Locator, Locator, Locator]

  beforeEach(async () => {
    screen = await render(ToggleGroup, {
      props: {
        'modelValue': ['center', 'right'],
        'onUpdate:modelValue': (ev) => {
          void screen.rerender({ modelValue: ev })
        },
        'type': 'multiple',
      },
    })
    triggers = getTriggers(screen)
  })

  it('should pass axe accessibility tests', async () => {
    expect(await axe(screen.container.firstElementChild!)).toHaveNoViolations()
  })

  it('should have active toggle=center', async () => {
    await expect.element(triggers[0]).toHaveAttribute('data-state', 'off')
    await expect.element(triggers[1]).toHaveAttribute('data-state', 'on')
    await expect.element(triggers[2]).toHaveAttribute('data-state', 'on')
  })

  describe('after triggering ArrowRight', () => {
    beforeEach(async () => {
      await focusAndPress(triggers[1], 'ArrowRight')
    })

    it('should received focus for the next toggle', async () => {
      expect(triggers[2].element()).toBe(document.activeElement)
    })

    describe('after toggling', () => {
      beforeEach(async () => {
        await triggers[2].click()
      })

      it('should have next active value', async () => {
        await expect.element(triggers[0]).toHaveAttribute('data-state', 'off')
        await expect.element(triggers[1]).toHaveAttribute('data-state', 'on')
        await expect.element(triggers[2]).toHaveAttribute('data-state', 'off')
      })

      describe('after triggering ArrowRight again', () => {
        beforeEach(async () => {
          await userEvent.keyboard('{ArrowRight}')
        })

        it('should received focus for the first toggle', async () => {
          expect(triggers[0].element()).toBe(document.activeElement)
        })
      })
    })
  })

  describe('after triggering ArrowLeft', () => {
    beforeEach(async () => {
      await focusAndPress(triggers[1], 'ArrowLeft')
    })

    it('should received focus for the next toggle', async () => {
      expect(triggers[0].element()).toBe(document.activeElement)
    })

    describe('after toggling', () => {
      beforeEach(async () => {
        await triggers[0].click()
      })

      it('should have next active value', async () => {
        await expect.element(triggers[0]).toHaveAttribute('data-state', 'on')
        await expect.element(triggers[1]).toHaveAttribute('data-state', 'on')
        await expect.element(triggers[2]).toHaveAttribute('data-state', 'on')
      })
    })
  })
})
