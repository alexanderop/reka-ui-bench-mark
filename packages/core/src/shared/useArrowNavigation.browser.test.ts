import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'
import { useArrowNavigation } from './useArrowNavigation'

describe('useArrowNavigation', () => {
  let sandbox: HTMLElement
  let parentElement: HTMLElement
  let child1: HTMLElement
  let child2: HTMLElement
  let child3: HTMLElement

  beforeEach(() => {
    sandbox = document.createElement('div')
    parentElement = document.createElement('div')
    child1 = document.createElement('div')
    child2 = document.createElement('div')
    child3 = document.createElement('div')

    for (const child of [child1, child2, child3]) {
      child.setAttribute('data-reka-collection-item', '')
      child.tabIndex = -1
      parentElement.appendChild(child)
    }

    sandbox.appendChild(parentElement)
    document.body.appendChild(sandbox)
  })

  afterEach(() => {
    sandbox.remove()
  })

  async function navigate(
    key: string,
    currentElement: HTMLElement,
    collectionElement: HTMLElement,
    options?: Parameters<typeof useArrowNavigation>[3],
  ) {
    let handled = false
    let nextElement: HTMLElement | null = null

    currentElement.addEventListener('keydown', (event) => {
      handled = true
      nextElement = useArrowNavigation(
        event,
        currentElement,
        collectionElement,
        options,
      )
    }, { once: true })

    currentElement.focus()
    if (document.activeElement !== currentElement)
      throw new Error('Keyboard target did not receive focus')

    await userEvent.keyboard(`{${key}}`)
    if (!handled)
      throw new Error(`Keyboard target did not receive ${key}`)

    return nextElement
  }

  it('should navigate horizontally', async () => {
    const nextElement = await navigate('ArrowRight', child1, parentElement, {
      arrowKeyOptions: 'horizontal',
    })
    expect(nextElement).toBe(child2)
  })

  it('should navigate vertically', async () => {
    const nextElement = await navigate('ArrowDown', child1, parentElement, {
      arrowKeyOptions: 'vertical',
    })
    expect(nextElement).toBe(child2)
  })

  it('should not navigate with arrow keys when arrowKeyOptions is not set to both', async () => {
    const nextElementHorizontal = await navigate(
      'ArrowDown',
      child1,
      parentElement,
      {
        arrowKeyOptions: 'horizontal',
      },
    )
    expect(nextElementHorizontal).toBeNull()
    const nextElementVertical = await navigate(
      'ArrowLeft',
      child1,
      parentElement,
      {
        arrowKeyOptions: 'vertical',
      },
    )
    expect(nextElementVertical).toBeNull()
  })

  it('should return null if there are no items in the collection', async () => {
    const emptyCollection = document.createElement('div')
    sandbox.appendChild(emptyCollection)

    const nextElement = await navigate(
      'ArrowRight',
      child1,
      emptyCollection,
    )
    expect(nextElement).toBeNull()
  })

  it('should loop through items if loop is set to true', async () => {
    const nextElement = await navigate('ArrowLeft', child1, parentElement, {
      loop: true,
    })
    expect(nextElement).toBe(child3)
  })

  it('should not loop through items if loop is set to false', async () => {
    const nextElement = await navigate('ArrowLeft', child1, parentElement, {
      loop: false,
    })
    expect(nextElement).toBeNull()
  })

  it('should skip disabled items', async () => {
    child2.setAttribute('disabled', 'true')
    child3.setAttribute('disabled', 'true')
    const nextElement = await navigate('ArrowRight', child1, parentElement)
    expect(nextElement).toBeNull()
  })

  it('should navigate correctly in rtl', async () => {
    const nextElement = await navigate('ArrowRight', child1, parentElement, {
      dir: 'rtl',
    })
    expect(nextElement).toBe(child3)
  })

  it('should navigate to the first item', async () => {
    const nextElement = await navigate('Home', child2, parentElement)
    expect(nextElement).toBe(child1)
  })

  it('should navigate to the last item', async () => {
    const nextElement = await navigate('End', child2, parentElement)
    expect(nextElement).toBe(child3)
  })

  it('should navigate to the first item when there is only one item and currentElement is not in the collection', async () => {
    const singleContainer = document.createElement('div')
    const singleChild = document.createElement('div')
    singleChild.setAttribute('data-reka-collection-item', '')
    singleContainer.appendChild(singleChild)

    const externalElement = document.createElement('input')
    sandbox.append(singleContainer, externalElement)

    const nextElement = await navigate(
      'ArrowDown',
      externalElement,
      singleContainer,
    )
    expect(nextElement).toBe(singleChild)
  })

  it('should navigate to the last item when pressing ArrowUp from an external element', async () => {
    const multipleContainer = document.createElement('div')
    const c1 = document.createElement('div')
    const c2 = document.createElement('div')
    const c3 = document.createElement('div')
    for (const child of [c1, c2, c3]) {
      child.setAttribute('data-reka-collection-item', '')
      multipleContainer.appendChild(child)
    }

    const externalElement = document.createElement('input')
    sandbox.append(multipleContainer, externalElement)

    const nextElement = await navigate(
      'ArrowUp',
      externalElement,
      multipleContainer,
    )
    expect(nextElement).toBe(c3)
  })
})
