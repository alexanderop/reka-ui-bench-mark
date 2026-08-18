import { render } from 'vitest-browser-vue'
import { nextTick } from 'vue'

type RenderOptions = Parameters<typeof render>[1]

function eventFor(type: string, init: Record<string, unknown>) {
  const options = { ...init, bubbles: true, cancelable: true }
  if (type.startsWith('key'))
    return new KeyboardEvent(type, options)
  if (type.startsWith('pointer'))
    return new PointerEvent(type, options)
  if (type.startsWith('composition'))
    return new CompositionEvent(type, options)
  if (type === 'input' || type === 'beforeinput')
    return new InputEvent(type, options)
  if (type === 'focus' || type === 'blur')
    return new FocusEvent(type, options)
  return new MouseEvent(type, options)
}

function eventName(name: string, init: Record<string, unknown>) {
  const [type, ...modifiers] = name.split('.')
  const key = modifiers.find(modifier => !['shift', 'ctrl', 'alt', 'meta'].includes(modifier))
  return {
    type,
    init: {
      ...init,
      ...(key ? { key: key.length === 1 ? key : `${key[0].toUpperCase()}${key.slice(1)}` } : {}),
      ...(modifiers.includes('shift') ? { shiftKey: true } : {}),
      ...(modifiers.includes('ctrl') ? { ctrlKey: true } : {}),
      ...(modifiers.includes('alt') ? { altKey: true } : {}),
      ...(modifiers.includes('meta') ? { metaKey: true } : {}),
    },
  }
}

export class BrowserElement<T extends Element = Element> {
  constructor(readonly element: T) {}

  attributes(name: string) {
    return this.element.getAttribute(name) ?? undefined
  }

  exists() {
    return Boolean(this.element?.isConnected)
  }

  find<E extends Element = Element>(selector: string) {
    return new BrowserElement(this.element.querySelector<E>(selector)!)
  }

  findAll<E extends Element = Element>(selector: string) {
    return Array.from(this.element.querySelectorAll<E>(selector), element => new BrowserElement(element))
  }

  html() {
    return this.element.outerHTML
  }

  async setValue(value: unknown) {
    const control = this.element as unknown as HTMLInputElement
    control.value = String(value)
    control.dispatchEvent(new InputEvent('input', { bubbles: true, data: String(value) }))
  }

  text() {
    return this.element.textContent ?? ''
  }

  async trigger(name: string, init: Record<string, unknown> = {}) {
    const parsed = eventName(name, init)
    const event = eventFor(parsed.type, parsed.init)
    if ('isComposing' in init)
      Object.defineProperty(event, 'isComposing', { value: init.isComposing })
    this.element.dispatchEvent(event)
    await nextTick()
  }
}

export function renderCompat(component: Parameters<typeof render>[0], options?: RenderOptions) {
  const screen = render(component, options)
  return {
    ...screen,
    get element() {
      return screen.container.firstElementChild as HTMLElement
    },
    emitted: screen.emitted,
    find<E extends Element = Element>(selector: string) {
      return new BrowserElement(screen.container.querySelector<E>(selector)!)
    },
    findAll<E extends Element = Element>(selector: string) {
      return Array.from(screen.container.querySelectorAll<E>(selector), element => new BrowserElement(element))
    },
    html() {
      return screen.container.innerHTML
    },
    setProps(props: Record<string, unknown>) {
      return screen.rerender(props)
    },
  }
}

export type BrowserWrapper = ReturnType<typeof renderCompat>
