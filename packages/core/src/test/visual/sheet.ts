import type { VNodeChild } from 'vue'
import { vi } from 'vitest'
import { h } from 'vue'

/**
 * The neutral story host `defineHistoireStory` renders a `.story.vue` under:
 * one set of styles, so every sheet looks the same and a reviewer reads them
 * the same way.
 *
 * The host is load-bearing, not cosmetic: `vitest-browser-vue` unwraps
 * `wrapper.parentElement`, and a primitive that forwards its public `$el` to
 * an inner element can lose its real outer wrapper when rendered directly
 * (`AspectRatio` measured 414×0 that way while its DOM snapshot still passed).
 * Every component stays nested below this host.
 */
export const STORY_WIDTH = 760
export const SHEET_TEST_ID = 'visual-story'

export function kebab(title: string) {
  return title
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
}

/** The 760px `<main data-testid="visual-story">` with a heading and a cell grid. */
export function renderSheetHost(title: string, cells: VNodeChild, columns: 1 | 2 = 2) {
  return h('main', {
    'data-testid': SHEET_TEST_ID,
    'data-story-title': title,
    'style': {
      boxSizing: 'border-box',
      width: `${STORY_WIDTH}px`,
      padding: '24px',
      color: '#18181b',
      background: '#ffffff',
      fontFamily: 'system-ui, sans-serif',
    },
  }, [
    h('h1', {
      style: { margin: '0 0 24px', fontSize: '24px', fontWeight: '700', lineHeight: '1.2' },
    }, title),
    h('div', {
      style: {
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gap: '24px',
        alignItems: 'start',
      },
    }, [cells]),
  ])
}

/** One `<section data-variant>` cell: heading plus a `[data-variant-frame]` around the content. */
export function renderSheetCell(name: string, content: VNodeChild) {
  return h('section', {
    'data-variant': name,
    'style': { minWidth: '0', padding: '16px', border: '1px solid #e4e4e7', borderRadius: '8px' },
  }, [
    h('h2', {
      style: { margin: '0 0 12px', fontSize: '14px', fontWeight: '600', lineHeight: '1.2' },
    }, name),
    h('div', {
      'data-variant-frame': '',
      'style': { width: '100%' },
    }, [content]),
  ])
}

/** One cell of a story sheet: the `<Variant>` section plus queries scoped to it. */
export interface VisualCell<Variant> {
  index: number
  name: string
  /** The variant as the story names it. */
  variant: Variant
  /** The `[data-variant]` section element. */
  el: HTMLElement
  /** `querySelector` scoped to this cell; throws naming the cell if nothing matches. */
  get: <T extends Element = HTMLElement>(selector: string) => T
  /** `querySelectorAll` scoped to this cell, as an array. */
  getAll: <T extends Element = HTMLElement>(selector: string) => T[]
  /** `get(selector).getBoundingClientRect()`. */
  rect: (selector: string) => DOMRect
}

/**
 * The scoped query surface every cell exposes, built over its `<section>`.
 *
 * Each query is a `vi.defineHelper`, so a selector that matches nothing fails
 * at the line in the sheet file that asked, not here. A nested helper
 * (`rect` → `get`) resolves to the outermost call site: Vitest slices the
 * stack at the *last* `__VITEST_HELPER__` frame (`@vitest/utils` source-map.ts).
 */
export function cellQueries(el: HTMLElement, title: string, name: string) {
  const getAll = vi.defineHelper(<T extends Element = HTMLElement>(selector: string) =>
    [...el.querySelectorAll<T>(selector)])
  const get = vi.defineHelper(<T extends Element = HTMLElement>(selector: string): T => {
    const found = el.querySelector<T>(selector)
    if (!found)
      throw new Error(`[${title}] cell "${name}" has no element matching ${selector}`)
    return found
  })
  return {
    get,
    getAll,
    rect: vi.defineHelper((selector: string) => get(selector).getBoundingClientRect()),
  }
}

/**
 * Refuse to screenshot a sheet the tester iframe cannot paint in full. An
 * element screenshot of a sheet taller than the iframe viewport is not an
 * error for Playwright — it returns the full element height with everything
 * below the fold white, and that half-blank image becomes the reference.
 */
export function assertSheetFitsViewport(sheet: HTMLElement, title: string) {
  const rect = sheet.getBoundingClientRect()
  const viewportHeight = window.innerHeight
  if (rect.bottom > viewportHeight) {
    throw new Error(
      `[${title}] sheet ends at ${Math.ceil(rect.bottom)}px but the tester viewport is ${viewportHeight}px tall; `
      + `the screenshot would be blank below the fold. Raise VIEWPORT_HEIGHT in vite.config.visual.ts or shrink the story.`,
    )
  }
}
