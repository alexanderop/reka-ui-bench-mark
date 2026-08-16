import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent, h, nextTick, reactive } from 'vue'
import { useCollection } from './Collection'

// Characterization tests for `useCollection`.
// These assert on the RETURNED values/order of `getItems()`, `reactiveItems`
// and `itemMapSize` so they act as a safety net for a future `getItems()`
// rewrite, rather than locking in implementation details.

interface ItemConfig {
  value: string
  disabled?: boolean
}

// Builds a parent component that acts as the collection provider and renders
// a `CollectionSlot` wrapping a `CollectionItem` per entry in `items`.
//
// Wiring notes:
// - `useCollection({ isProvider: true })` runs `provide()`, the renderless
//   `CollectionItem`s `inject()` the same context (same `setup`/`useCollection`
//   call here returns those components, so they share `context`).
// - `Slot` (used by both `CollectionSlot` and `CollectionItem`) requires a
//   single root element child to forward its ref onto, so:
//     * `CollectionSlot` wraps the items in a single `<div>` root.
//     * each `CollectionItem` renders a single `<div>` child.
// - `render()` attaches to the document, which lets these tests sanity-check
//   the collection against a document-wide `querySelectorAll` result.
async function createWrapper(initialItems: ItemConfig[]) {
  // Reactive so tests can mutate (e.g. remove an item) and re-render.
  const items = reactive<ItemConfig[]>([...initialItems])

  let collection!: ReturnType<typeof useCollection>

  const Parent = defineComponent({
    setup() {
      collection = useCollection({ key: 'test', isProvider: true })
      const { CollectionSlot, CollectionItem } = collection

      return () =>
        h(CollectionSlot, null, {
          default: () =>
            h(
              'div',
              { 'data-testid': 'collection-root' },
              items.map(item =>
                h(
                  CollectionItem,
                  { key: item.value, value: item.value },
                  {
                    default: () =>
                      h('div', {
                        'data-testid': item.value,
                        // When disabled, expose `data-disabled=""` on the real
                        // element so `ref.dataset.disabled === ''`.
                        ...(item.disabled ? { 'data-disabled': '' } : {}),
                      }, item.value),
                  },
                ),
              ),
            ),
        })
    },
  })

  await render(Parent)

  return {
    items,
    getCollection: () => collection,
  }
}

describe('useCollection', () => {
  it('registers items into reactiveItems and itemMapSize reflects the count', async () => {
    const { getCollection } = await createWrapper([
      { value: 'a' },
      { value: 'b' },
      { value: 'c' },
    ])
    await nextTick()

    const { reactiveItems, itemMapSize } = getCollection()

    expect(itemMapSize.value).toBe(3)
    expect(reactiveItems.value).toHaveLength(3)
    expect(reactiveItems.value.map(i => i.value).sort()).toEqual(['a', 'b', 'c'])
  })

  it('getItems() returns items in DOM order even when registration order differs', async () => {
    // Registration order (watchEffect firing) is not guaranteed to match DOM
    // order. `getItems()` sorts by `querySelectorAll` DOM order, so the result
    // must follow the template/DOM order regardless.
    const { getCollection, items } = await createWrapper([
      { value: 'first' },
      { value: 'second' },
      { value: 'third' },
    ])
    await nextTick()

    // Keep the keyed item instances registered, but move their DOM nodes so
    // registration order and DOM order genuinely differ.
    items.splice(0, 3, { value: 'third' }, { value: 'first' }, { value: 'second' })
    await nextTick()

    const { getItems } = getCollection()
    expect(getItems().map(i => i.value)).toEqual(['third', 'first', 'second'])

    // Sanity-check ordering reflects actual DOM order.
    const rendered = Array.from(
      document.querySelectorAll('[data-reka-collection-item]'),
    ).map(el => (el as HTMLElement).dataset.testid)
    expect(getItems().map(i => i.value)).toEqual(rendered)
  })

  it('filters out items with data-disabled="" by default, includes them with getItems(true)', async () => {
    const { getCollection } = await createWrapper([
      { value: 'a' },
      { value: 'b', disabled: true },
      { value: 'c' },
    ])
    await nextTick()

    const { getItems } = getCollection()

    // Disabled item excluded by default.
    expect(getItems().map(i => i.value)).toEqual(['a', 'c'])

    // Included (in DOM order) when requested.
    expect(getItems(true).map(i => i.value)).toEqual(['a', 'b', 'c'])
  })

  it('removes an item from the map when it unmounts', async () => {
    const { getCollection, items } = await createWrapper([
      { value: 'a' },
      { value: 'b' },
      { value: 'c' },
    ])
    await nextTick()

    const { getItems, itemMapSize } = getCollection()
    expect(itemMapSize.value).toBe(3)
    expect(getItems().map(i => i.value)).toEqual(['a', 'b', 'c'])

    // Remove the middle item, triggering CollectionItem unmount + cleanup.
    const idx = items.findIndex(i => i.value === 'b')
    items.splice(idx, 1)
    await nextTick()

    expect(itemMapSize.value).toBe(2)
    expect(getItems().map(i => i.value)).toEqual(['a', 'c'])
  })

  it('getItems() returns [] when no CollectionSlot element is mounted', async () => {
    // A provider context whose `collectionRef` is never set (no CollectionSlot
    // currentElement). `getItems()` short-circuits to `[]`.
    let collection!: ReturnType<typeof useCollection>

    const Parent = defineComponent({
      setup() {
        collection = useCollection({ key: 'empty', isProvider: true })
        // Render nothing collection-related: no CollectionSlot is mounted.
        return () => h('div', 'no-collection')
      },
    })

    await render(Parent)
    await nextTick()

    expect(collection.getItems()).toEqual([])
    expect(collection.getItems(true)).toEqual([])
    expect(collection.itemMapSize.value).toBe(0)
  })
})
