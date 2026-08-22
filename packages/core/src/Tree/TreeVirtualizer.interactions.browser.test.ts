import type { Locator } from 'vitest/browser'
import { beforeEach, describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page, userEvent } from 'vitest/browser'
import { defineComponent, h } from 'vue'
import { TreeItem, TreeRoot, TreeVirtualizer } from '.'

const ITEM_HEIGHT = 32
const ITEM_COUNT = 120
const TYPEAHEAD_INDEX = 87

const items = Array.from({ length: ITEM_COUNT }, (_, index) => ({
  title: index === TYPEAHEAD_INDEX
    ? 'Zulu destination'
    : `Item ${String(index).padStart(3, '0')}`,
}))

const VirtualTree = defineComponent({
  setup() {
    return () => h(TreeRoot as any, {
      'aria-label': 'Countries',
      'items': items,
      'getKey': (item: { title: string }) => item.title,
      'style': {
        boxSizing: 'border-box',
        height: '160px',
        margin: '0',
        overflowY: 'auto',
        padding: '0',
        width: '240px',
      },
    }, {
      default: () => h(TreeVirtualizer, {
        estimateSize: ITEM_HEIGHT,
        overscan: 2,
        textContent: (item: Record<string, any>) => item.title,
      }, {
        default: ({ item }: any) => h(TreeItem as any, {
          ...item.bind,
          style: {
            alignItems: 'center',
            boxSizing: 'border-box',
            display: 'flex',
            height: `${ITEM_HEIGHT}px`,
            width: '100%',
          },
        }, { default: () => item.value.title }),
      }),
    })
  },
})

describe('tree virtualizer native browser interactions', () => {
  let screen: Awaited<ReturnType<typeof render<typeof VirtualTree>>>
  let treeLocator: Locator
  let tree: HTMLElement

  beforeEach(async () => {
    screen = await render(VirtualTree)
    treeLocator = screen.getByRole('tree')
    tree = treeLocator.element() as HTMLElement

    await expect.poll(() => tree.scrollHeight).toBe(ITEM_COUNT * ITEM_HEIGHT)
  })

  it('virtualizes the rendered window while the native scroll container receives wheel input', async () => {
    const initiallyRendered = [...tree.querySelectorAll<HTMLElement>('[role="treeitem"]')]
    expect(initiallyRendered.length).toBeLessThan(ITEM_COUNT)
    expect(initiallyRendered[0].dataset.index).toBe('0')

    await userEvent.wheel(treeLocator, { delta: { y: 640 } })

    // Gecko applies a smaller physical wheel step than Chromium/WebKit for the
    // same delta. The contract is window replacement, not an exact distance.
    await expect.poll(() => tree.scrollTop).toBeGreaterThan(ITEM_HEIGHT * 3)
    await expect.poll(() => {
      const rendered = [...tree.querySelectorAll<HTMLElement>('[role="treeitem"]')]
      return Math.min(...rendered.map(item => Number(item.dataset.index)))
    }).toBeGreaterThan(0)
    expect(tree.querySelector('[data-index="0"]')).toBeNull()
  })

  it('moves focus and the virtual window with native End, Home and ArrowDown keys', async () => {
    const scope = page.elementLocator(screen.container)
    const first = scope.getByRole('treeitem', { name: 'Item 000', exact: true })
    await first.click()
    await expect.element(first).toHaveFocus()

    await userEvent.keyboard('{End}')

    const last = scope.getByRole('treeitem', { name: 'Item 119', exact: true })
    await expect.element(last).toHaveFocus()
    await expect.poll(() => tree.scrollTop).toBeGreaterThan(3000)

    await userEvent.keyboard('{Home}')
    await expect.element(first).toHaveFocus()
    await expect.poll(() => tree.scrollTop).toBeLessThan(ITEM_HEIGHT)

    await userEvent.keyboard('{ArrowDown}')
    await expect.element(scope.getByRole('treeitem', { name: 'Item 001', exact: true })).toHaveFocus()
  })

  it('scrolls an off-screen typeahead match into view and gives it DOM focus', async () => {
    const scope = page.elementLocator(screen.container)
    const first = scope.getByRole('treeitem', { name: 'Item 000', exact: true })
    await first.click()
    await expect.element(first).toHaveFocus()

    await userEvent.keyboard('z')

    const match = scope.getByRole('treeitem', { name: 'Zulu destination', exact: true })
    await expect.element(match).toHaveFocus()
    await expect.poll(() => tree.scrollTop).toBeGreaterThan(2000)
    expect(match.element().dataset.index).toBe(String(TYPEAHEAD_INDEX))
  })
})
