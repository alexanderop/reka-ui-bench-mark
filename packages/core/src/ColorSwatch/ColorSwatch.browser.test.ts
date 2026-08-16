import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import { render } from 'vitest-browser-vue'
import { ColorSwatch } from '.'

type ColorSwatchScreen = Awaited<ReturnType<typeof render<typeof ColorSwatch>>>

function root(screen: ColorSwatchScreen) {
  return screen.container.firstElementChild as HTMLElement
}

describe('colorSwatch', () => {
  describe('given a default ColorSwatch', () => {
    it('should pass axe accessibility tests', async () => {
      const screen = await render(ColorSwatch, {
        props: { color: '#E5484D' },
      })
      // Node-bearing census with the configured `region` exemption: Chromium
      // has 12 passing rules, no incomplete rules, and no violations. jsdom
      // has the same 12 plus `aria-hidden-body`; both audit targets are
      // document-connected, so that delta is recorded without guessing at its
      // cause. With no text, `color-contrast` is inapplicable in both. The audit is still mutation-sensitive: removing
      // `role="img"` triggers `aria-prohibited-attr`, while removing the label
      // triggers `role-img-alt`. The exact roledescription has its own test.
      expect(await axe(root(screen))).toHaveNoViolations()
    })

    it('should render with role="img"', async () => {
      const screen = await render(ColorSwatch, {
        props: { color: '#E5484D' },
      })
      expect(root(screen).getAttribute('role')).toBe('img')
    })

    it('should render with aria-roledescription="color swatch"', async () => {
      const screen = await render(ColorSwatch, {
        props: { color: '#E5484D' },
      })
      expect(root(screen).getAttribute('aria-roledescription')).toBe('color swatch')
    })
  })

  describe('aria-label', () => {
    it('should derive color name as aria-label for hex color', async () => {
      const screen = await render(ColorSwatch, {
        props: { color: '#ff0000' },
      })
      const label = root(screen).getAttribute('aria-label')
      expect(label).toBe('vibrant red')
      expect(label).not.toBe('#ff0000')
    })

    it('should use custom label when provided', async () => {
      const screen = await render(ColorSwatch, {
        props: { color: '#E5484D', label: 'Brand Red' },
      })
      expect(root(screen).getAttribute('aria-label')).toBe('Brand Red')
    })

    it('should show "transparent" for alpha=0 color', async () => {
      const screen = await render(ColorSwatch, {
        props: { color: '#ff000000' },
      })
      expect(root(screen).getAttribute('aria-label')).toBe('transparent')
    })

    it('should show "transparent" for empty color', async () => {
      const screen = await render(ColorSwatch, {
        props: { color: '' },
      })
      expect(root(screen).getAttribute('aria-label')).toBe('transparent')
    })

    it('should show "transparent" when no color prop provided', async () => {
      const screen = await render(ColorSwatch)
      expect(root(screen).getAttribute('aria-label')).toBe('transparent')
    })
  })

  describe('color object support', () => {
    it('should accept Color object', async () => {
      const screen = await render(ColorSwatch, {
        props: {
          color: { space: 'hsl' as const, h: 120, s: 50, l: 50, alpha: 1 },
        },
      })
      expect(root(screen)).toBeTruthy()
      expect(root(screen).getAttribute('style')).toContain('--reka-color-swatch-color: #40bf40')
    })
  })

  describe('data attributes', () => {
    it('should set data-no-color when alpha is 0', async () => {
      const screen = await render(ColorSwatch, {
        props: { color: '#ff000000' },
      })
      expect(root(screen).getAttribute('data-no-color')).toBe('')
    })

    it('should set data-no-color when no color', async () => {
      const screen = await render(ColorSwatch, {
        props: { color: '' },
      })
      expect(root(screen).getAttribute('data-no-color')).toBe('')
    })

    it('should not set data-no-color for opaque color', async () => {
      const screen = await render(ColorSwatch, {
        props: { color: '#E5484D' },
      })
      expect(root(screen).hasAttribute('data-no-color')).toBe(false)
    })

    it('should set data-color-contrast to light for dark colors', async () => {
      const screen = await render(ColorSwatch, {
        props: { color: '#000000' },
      })
      // "light" means text should be light on this dark background
      expect(root(screen).getAttribute('data-color-contrast')).toBe('light')
    })

    it('should set data-color-contrast to dark for bright colors', async () => {
      const screen = await render(ColorSwatch, {
        props: { color: '#ffffff' },
      })
      // "dark" means text should be dark on this light background
      expect(root(screen).getAttribute('data-color-contrast')).toBe('dark')
    })
  })

  describe('cSS variables', () => {
    it('should set --reka-color-swatch-color', async () => {
      const screen = await render(ColorSwatch, {
        props: { color: '#E5484D' },
      })
      expect(root(screen).getAttribute('style')).toContain('--reka-color-swatch-color: #E5484D')
    })

    it('should set --reka-color-swatch-alpha', async () => {
      const screen = await render(ColorSwatch, {
        props: { color: '#E5484D' },
      })
      expect(root(screen).getAttribute('style')).toContain('--reka-color-swatch-alpha: 1')
    })
  })

  describe('slot', () => {
    it('should expose color and alpha via slot', async () => {
      const screen = await render(ColorSwatch, {
        props: { color: '#E5484D' },
        slots: {
          default: ({ color, alpha }: { color: string, alpha: number }) => {
            return `${color}-${alpha}`
          },
        },
      })
      expect(root(screen).textContent).toContain('#E5484D')
      expect(root(screen).textContent).toContain('1')
    })
  })
})
