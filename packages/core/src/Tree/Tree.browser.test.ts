import { beforeEach, describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import { render } from 'vitest-browser-vue'
import { userEvent } from 'vitest/browser'
import { defineComponent, h } from 'vue'
import { TreeItem, TreeRoot } from '.'
import Tree from './story/_Tree.vue'

type Screen = Awaited<ReturnType<typeof render>>

function treeItems(screen: Screen) {
  return [...screen.container.querySelectorAll<HTMLElement>('[role=treeitem]')]
}

async function press(element: HTMLElement, key: string) {
  element.focus()
  await expect.element(element).toHaveFocus()
  await userEvent.keyboard(key)
}

describe('given default Tree', () => {
  let screen: Screen
  let items: HTMLElement[]

  const updateItems = () => { items = treeItems(screen) }

  beforeEach(async () => {
    screen = await render(Tree, { props: { selectionBehavior: 'toggle' } })
    updateItems()
  })

  it('should pass axe accessibility tests', async () => {
    expect(await axe(screen.container.firstElementChild as HTMLElement)).toHaveNoViolations()
  })

  it('should render snapshot', () => {
    expect(screen.container.innerHTML).toMatchSnapshot()
  })

  it('should select and deselect item', async () => {
    await userEvent.click(items[0])
    expect(items[0].getAttribute('aria-selected')).toBe('true')
    await userEvent.click(items[0])
    expect(items[0].getAttribute('aria-selected')).toBe('false')
  })

  describe('when expand item by press ArrowRight', async () => {
    beforeEach(async () => {
      await press(items[1], '{ArrowRight}')
      updateItems()
    })

    it('should pass axe accessibility tests', async () => {
      expect(await axe(screen.container.firstElementChild as HTMLElement)).toHaveNoViolations()
    })

    it('should expand the item, revealing it\'s item', () => {
      expect(items[2].textContent).toBe('tree')
    })

    it('should close when press ArrowLeft', async () => {
      await press(items[1], '{ArrowLeft}')
      updateItems()
      expect(items[2].textContent).toBe('routes')
      expect(items[2].textContent).not.toBe('tree')
    })

    it('should focus on parent when press ArrowLeft on child item', async () => {
      await press(items[2], '{ArrowDown}')
      await press(items[3], '{ArrowLeft}')
      expect(document.activeElement).toBe(items[1])
    })

    it('should focus on child item when press ArriwRight', async () => {
      await press(items[1], '{ArrowRight}')
      expect(document.activeElement).toBe(items[2])
    })

    describe('when expand nested item', async () => {
      beforeEach(async () => {
        await press(items[2], '{ArrowRight}')
        updateItems()
      })

      it('should pass axe accessibility tests', async () => {
        expect(await axe(screen.container.firstElementChild as HTMLElement)).toHaveNoViolations()
      })

      it('should expand the nested item, revealing it\'s item ', () => {
        expect(items[3].textContent).toBe('Tree.vue')
      })
    })
  })

  describe('when typing letter', async () => {
    it('should highlight text starting with l', async () => {
      await press(items[0], 'l')
      const item = items.find(i => i.textContent?.startsWith('l'))
      expect(document.activeElement).toBe(item)
    })
  })

  describe('when selection behavior `replace`', () => {
    beforeEach(async () => {
      await screen.rerender({ selectionBehavior: 'replace' })
      updateItems()
    })

    it('should not toggle off the selected value', async () => {
      await userEvent.click(items[0])
      await userEvent.click(items[0])
      expect(items[0].getAttribute('aria-selected')).toBe('true')
    })

    it('should select and replace another item', async () => {
      await userEvent.click(items[0])
      expect(items[0].getAttribute('aria-selected')).toBe('true')
      await userEvent.click(items[1])
      expect(items[0].getAttribute('aria-selected')).toBe('false')
      expect(items[1].getAttribute('aria-selected')).toBe('true')
    })
  })
})

describe('given multiple `true` Tree', () => {
  let screen: Screen
  let items: HTMLElement[]

  beforeEach(async () => {
    screen = await render(Tree, { props: { multiple: true, selectionBehavior: 'toggle' } })
    items = treeItems(screen)
  })

  it('should select multiple items', async () => {
    await press(items[0], '{Enter}')
    await press(items[0], '{ArrowDown}')
    await press(items[1], '{ArrowDown}')
    await press(items[2], '{Enter}')
    expect(items[0].getAttribute('aria-selected')).toBe('true')
    expect(items[1].getAttribute('aria-selected')).toBe('false')
    expect(items[2].getAttribute('aria-selected')).toBe('true')
  })

  describe('when selection behavior `replace`', () => {
    beforeEach(async () => {
      await screen.rerender({ selectionBehavior: 'replace' })
      items = treeItems(screen)
      await userEvent.click(items[0])
      items[0].focus()
    })

    it('should not toggle off the selected value', async () => {
      await userEvent.click(items[0])
      await userEvent.click(items[0])
      expect(items[0].getAttribute('aria-selected')).toBe('true')
    })

    it('should select and replace another item', async () => {
      expect(items[0].getAttribute('aria-selected')).toBe('true')
      await userEvent.click(items[1])
      expect(items[0].getAttribute('aria-selected')).toBe('false')
      expect(items[1].getAttribute('aria-selected')).toBe('true')
    })

    describe('when keypress Shift + ArrowDown', () => {
      it('should select the next item', async () => {
        await press(items[0], '{Shift>}{ArrowDown}{/Shift}')
        expect(items[0].getAttribute('aria-selected')).toBe('true')
        expect(items[1].getAttribute('aria-selected')).toBe('true')
        expect(items[2].getAttribute('aria-selected')).toBe('false')
        await press(items[1], '{Shift>}{ArrowDown}{/Shift}')
        expect(items[0].getAttribute('aria-selected')).toBe('true')
        expect(items[1].getAttribute('aria-selected')).toBe('true')
        expect(items[2].getAttribute('aria-selected')).toBe('true')
      })
    })
  })
})

describe('given a Tree with a custom children structure', () => {
  const customItems = [
    { title: 'index.vue', icon: 'vue' },
    { title: 'lib', icon: 'folder', directories: [
      { title: 'tree', icon: 'folder', files: [{ title: 'Tree.vue', icon: 'vue' }, { title: 'TreeView.vue', icon: 'vue' }] },
      { title: 'icons', icon: 'folder', files: [{ title: 'JS.vue', icon: 'vue' }, { title: 'vue.vue', icon: 'vue' }] },
    ], files: [{ title: 'index.js', icon: 'js' }] },
    { title: 'routes', icon: 'folder', directories: [{ title: 'contents', icon: 'folder', files: [{ title: '+layout.vue', icon: 'vue' }, { title: '+page.vue', icon: 'vue' }] }] },
  ]
  let screen: Screen
  let items: HTMLElement[]
  const updateItems = () => { items = treeItems(screen) }

  beforeEach(async () => {
    screen = await render(Tree, { props: {
      items: customItems,
      multiple: true,
      selectionBehavior: 'toggle',
      getChildren: (val: any) => (!val.files) ? val.directories : (!val.directories) ? val.files : [...val.directories, ...val.files],
    } })
    updateItems()
  })

  describe('when expand item', async () => {
    beforeEach(async () => {
      await press(items[1], '{ArrowRight}')
      updateItems()
    })

    it('should expand the item, revealing it\'s item', () => {
      expect(items[2].textContent).toBe('tree')
    })

    describe('when expand nested item', async () => {
      beforeEach(async () => {
        await press(items[2], '{ArrowRight}')
        updateItems()
      })

      it('should expand the nested item, revealing it\'s item ', () => {
        expect(items[3].textContent).toBe('Tree.vue')
      })
    })
  })
})

describe('given a Tree with bubbleSelect and propagateSelect', () => {
  const customItems = [{ title: 'components', children: [{ title: 'Home', children: [{ title: 'Card.vue' }, { title: 'Button.vue' }] }] }]
  let screen: Screen
  let items: HTMLElement[]
  const selected = () => items.map(i => i.getAttribute('aria-selected'))

  beforeEach(async () => {
    screen = await render(Tree, { props: { items: customItems, expanded: ['components', 'Home'], multiple: true, propagateSelect: true, bubbleSelect: true } })
    items = treeItems(screen)
  })

  it('propagates changes down the tree', async () => {
    expect(selected()).toStrictEqual(['false', 'false', 'false', 'false'])
    await userEvent.click(items[0])
    expect(selected()).toStrictEqual(['true', 'true', 'true', 'true'])
    await userEvent.click(items[0])
    expect(selected()).toStrictEqual(['false', 'false', 'false', 'false'])
  })

  it('bubbles change up the tree', async () => {
    expect(selected()).toStrictEqual(['false', 'false', 'false', 'false'])
    await userEvent.click(items[2])
    expect(selected()).toStrictEqual(['false', 'false', 'true', 'false'])
    await userEvent.click(items[3])
    expect(selected()).toStrictEqual(['true', 'true', 'true', 'true'])
    await userEvent.click(items[2])
    expect(selected()).toStrictEqual(['false', 'false', 'false', 'true'])
    await userEvent.click(items[3])
    expect(selected()).toStrictEqual(['false', 'false', 'false', 'false'])
  })
})

describe('given a Tree with disabled items', () => {
  const sourceItems = [
    { title: 'apple' },
    { title: 'banana' },
    { title: 'cherry' },
    { title: 'fruits', children: [{ title: 'grape' }, { title: 'kiwi' }] },
  ]

  async function mountTree(disabledKeys: string[] = ['banana'], rootDisabled = false) {
    const screen = await render(defineComponent({
      setup: () => () => h(TreeRoot as any, {
        items: sourceItems,
        getKey: (item: any) => item.title,
        selectionBehavior: 'toggle',
        disabled: rootDisabled,
        expanded: ['fruits'],
      }, {
        default: ({ flattenItems }: any) => flattenItems.map((item: any) => h(TreeItem as any, {
          key: item._id,
          ...item.bind,
          disabled: disabledKeys.includes(item._id),
        }, { default: () => item.value.title })),
      }),
    }))
    return { screen, items: () => treeItems(screen) }
  }

  it('should set aria-disabled and data-disabled attributes', async () => {
    const { items } = await mountTree()
    expect(items()[1].getAttribute('aria-disabled')).toBe('true')
    expect(items()[1].getAttribute('data-disabled')).toBe('')
    expect(items()[0].getAttribute('aria-disabled')).toBeNull()
    expect(items()[0].getAttribute('data-disabled')).toBeNull()
  })

  it('should not select a disabled item on click or keydown', async () => {
    const { items } = await mountTree()
    await userEvent.click(items()[1], { force: true })
    expect(items()[1].getAttribute('aria-selected')).toBe('false')
    await press(items()[1], '{Enter}')
    expect(items()[1].getAttribute('aria-selected')).toBe('false')
  })

  it('should not toggle a disabled item', async () => {
    const { items } = await mountTree(['fruits'])
    expect(items().length).toBe(6)
    await userEvent.click(items()[3], { force: true })
    expect(items().length).toBe(6)
    await press(items()[3], '{ArrowLeft}')
    expect(items().length).toBe(6)
  })

  it('should disable all items when root is disabled', async () => {
    const { items } = await mountTree([], true)
    for (const item of items()) expect(item.getAttribute('aria-disabled')).toBe('true')
    await userEvent.click(items()[0], { force: true })
    expect(items()[0].getAttribute('aria-selected')).toBe('false')
  })
})
