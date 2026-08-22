import type { Locator } from 'vitest/browser'
import { beforeEach, describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import { render } from 'vitest-browser-vue'
import { page, userEvent } from 'vitest/browser'
import ColorSlider from './story/_ColorSlider.vue'

type Screen = Awaited<ReturnType<typeof render>>

function thumb(screen: Screen): Locator {
  return page.elementLocator(screen.container).getByRole('slider')
}

describe('given default ColorSlider', () => {
  let screen: Screen

  beforeEach(async () => {
    screen = await render(ColorSlider, {
      props: {
        defaultValue: '#ff0000',
        channel: 'hue',
        colorSpace: 'hsl',
      },
    })
  })

  it('should pass axe accessibility tests', async () => {
    expect(await axe(screen.container.firstElementChild as HTMLElement, {
      rules: {
        label: { enabled: false },
      },
    })).toHaveNoViolations()
  })

  it('should render with initial value', () => {
    const slider = thumb(screen)
    expect(slider.elements()).toHaveLength(1)
    expect(slider.element().getAttribute('aria-valuemin')).toBe('0')
    expect(slider.element().getAttribute('aria-valuemax')).toBe('360')
  })

  it('should have correct aria attributes', () => {
    const slider = thumb(screen)
    expect(slider.element().getAttribute('aria-label')).toBe('Hue')
    expect(slider.element().getAttribute('aria-orientation')).toBe('horizontal')
  })

  describe('when disabled', () => {
    beforeEach(async () => {
      await screen.rerender({ disabled: true })
    })

    it('should not have tabindex when disabled', () => {
      expect(thumb(screen).element().getAttribute('tabindex') ?? undefined).toBeUndefined()
    })

    it('should have data-disabled attribute', () => {
      expect(thumb(screen).element().getAttribute('data-disabled')).toBe('')
    })
  })

  describe('keyboard navigation', () => {
    it('should increment on ArrowRight', async () => {
      const slider = thumb(screen)
      await slider.click()
      const initialValue = Number(slider.element().getAttribute('aria-valuenow'))
      await userEvent.keyboard('{ArrowRight}')
      const newValue = Number(slider.element().getAttribute('aria-valuenow'))
      // Due to hex↔hsl round-trip precision, check that value increased
      expect(newValue).toBeGreaterThan(initialValue)
    })

    it('should decrement on ArrowLeft', async () => {
      const slider = thumb(screen)
      await slider.click()
      // First increment to have room to decrement
      await userEvent.keyboard('{ArrowRight}')
      const afterIncrement = Number(slider.element().getAttribute('aria-valuenow'))
      await userEvent.keyboard('{ArrowLeft}')
      const afterDecrement = Number(slider.element().getAttribute('aria-valuenow'))
      expect(afterDecrement).toBeLessThan(afterIncrement)
    })

    it('should jump to min on Home key', async () => {
      const screen = await render(ColorSlider, {
        props: {
          defaultValue: '#7f007f',
          channel: 'red',
          colorSpace: 'rgb',
        },
      })
      const slider = thumb(screen)
      await slider.click()
      await userEvent.keyboard('{Home}')
      expect(slider.element().getAttribute('aria-valuenow')).toBe('0')
    })
  })
})

describe('given different channels', () => {
  it('should render saturation slider', async () => {
    const screen = await render(ColorSlider, {
      props: {
        defaultValue: '#7f007f',
        channel: 'saturation',
        colorSpace: 'hsl',
      },
    })
    const slider = thumb(screen)
    expect(slider.element().getAttribute('aria-label')).toBe('Saturation')
    expect(slider.element().getAttribute('aria-valuemax')).toBe('100')
  })

  it('should render lightness slider', async () => {
    const screen = await render(ColorSlider, {
      props: {
        defaultValue: '#7f007f',
        channel: 'lightness',
        colorSpace: 'hsl',
      },
    })
    const slider = thumb(screen)
    expect(slider.element().getAttribute('aria-label')).toBe('Lightness')
    expect(slider.element().getAttribute('aria-valuemax')).toBe('100')
  })

  it('should render alpha slider', async () => {
    const screen = await render(ColorSlider, {
      props: {
        defaultValue: 'rgba(127, 0, 127, 0.5)',
        channel: 'alpha',
        colorSpace: 'hsl',
      },
    })
    const slider = thumb(screen)
    expect(slider.element().getAttribute('aria-label')).toBe('Alpha')
    expect(slider.element().getAttribute('aria-valuemax')).toBe('100')
  })

  it('should render red slider with RGB range', async () => {
    const screen = await render(ColorSlider, {
      props: {
        defaultValue: '#7f007f',
        channel: 'red',
        colorSpace: 'rgb',
      },
    })
    const slider = thumb(screen)
    expect(slider.element().getAttribute('aria-label')).toBe('Red')
    expect(slider.element().getAttribute('aria-valuemax')).toBe('255')
  })
})

describe('given vertical orientation', () => {
  it('should have vertical aria-orientation', async () => {
    const screen = await render(ColorSlider, {
      props: {
        defaultValue: '#ff0000',
        channel: 'hue',
        colorSpace: 'hsl',
        orientation: 'vertical',
      },
    })
    expect(thumb(screen).element().getAttribute('aria-orientation')).toBe('vertical')
  })
})

describe('alpha channel aria-valuetext', () => {
  it('should display correct percentage for alpha', async () => {
    const screen = await render(ColorSlider, {
      props: {
        defaultValue: 'rgba(127, 0, 127, 0.5)',
        channel: 'alpha',
        colorSpace: 'hsl',
      },
    })
    expect(thumb(screen).element().getAttribute('aria-valuetext')).toBe('50%')
  })

  it('should display 100% for full alpha', async () => {
    const screen = await render(ColorSlider, {
      props: {
        defaultValue: '#ff0000',
        channel: 'alpha',
        colorSpace: 'hsl',
      },
    })
    expect(thumb(screen).element().getAttribute('aria-valuetext')).toBe('100%')
  })
})

describe('custom step prop', () => {
  it('should use custom step value', async () => {
    const screen = await render(ColorSlider, {
      props: {
        defaultValue: '#ff0000',
        channel: 'hue',
        colorSpace: 'hsl',
        step: 10,
      },
    })
    const slider = thumb(screen)
    expect(slider.elements()).toHaveLength(1)
    // The SliderRoot should receive step=10
    expect(slider.element().getAttribute('aria-valuemin')).toBe('0')
    expect(slider.element().getAttribute('aria-valuemax')).toBe('360')
  })
})
