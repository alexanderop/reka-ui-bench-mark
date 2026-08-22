import { vi } from 'vitest'
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

/**
 * A VTU-shaped wrapper over one element, for ports that keep the original's
 * `find(...).trigger(...)` / `.attributes(...)` phrasing.
 *
 * Like VTU's `ErrorWrapper`, `find` never throws — `exists()` is how a port
 * asserts absence — but every other method does, naming the selector that
 * matched nothing, and each is wrapped in `vi.defineHelper` so the failure's
 * stack frame is the test line rather than this file. Measured on 4.1.10: an
 * unwrapped `find(sel)!.attributes()` fails as `Cannot read properties of
 * null (reading 'getAttribute')` at `BrowserElement.attributes`; wrapped and
 * guarded it fails as `cannot call attributes() on an empty BrowserElement
 * (no element matching "sel")` at the caller.
 */
export class BrowserElement<T extends Element = Element> {
  constructor(readonly element: T, readonly selector?: string) {}

  /** The element, or a named error when `find` matched nothing. */
  private resolve(method: string): T {
    if (!this.element) {
      const where = this.selector ? ` (no element matching "${this.selector}")` : ''
      throw new Error(`cannot call ${method}() on an empty BrowserElement${where}`)
    }
    return this.element
  }

  attributes = vi.defineHelper((name: string) => {
    return this.resolve('attributes').getAttribute(name) ?? undefined
  })

  exists() {
    return Boolean(this.element?.isConnected)
  }

  find = vi.defineHelper(<E extends Element = Element>(selector: string) => {
    return new BrowserElement(this.resolve('find').querySelector<E>(selector)!, selector)
  })

  findAll = vi.defineHelper(<E extends Element = Element>(selector: string) => {
    return Array.from(this.resolve('findAll').querySelectorAll<E>(selector), element => new BrowserElement(element, selector))
  })

  html = vi.defineHelper(() => {
    return this.resolve('html').outerHTML
  })

  setValue = vi.defineHelper(async (value: unknown) => {
    const control = this.resolve('setValue') as unknown as HTMLInputElement
    control.value = String(value)
    control.dispatchEvent(new InputEvent('input', { bubbles: true, data: String(value) }))
  })

  text = vi.defineHelper(() => {
    return this.resolve('text').textContent ?? ''
  })

  trigger = vi.defineHelper(async (name: string, init: Record<string, unknown> = {}) => {
    const target = this.resolve('trigger')
    const parsed = eventName(name, init)
    const event = eventFor(parsed.type, parsed.init)
    if ('isComposing' in init)
      Object.defineProperty(event, 'isComposing', { value: init.isComposing })
    target.dispatchEvent(event)
    await nextTick()
  })
}

export function renderCompat(component: Parameters<typeof render>[0], options?: RenderOptions) {
  const screen = render(component, options)
  return {
    ...screen,
    get element() {
      return screen.container.firstElementChild as HTMLElement
    },
    emitted: screen.emitted,
    find: vi.defineHelper(<E extends Element = Element>(selector: string) => {
      return new BrowserElement(screen.container.querySelector<E>(selector)!, selector)
    }),
    findAll: vi.defineHelper(<E extends Element = Element>(selector: string) => {
      return Array.from(screen.container.querySelectorAll<E>(selector), element => new BrowserElement(element, selector))
    }),
    html() {
      return screen.container.innerHTML
    },
    setProps(props: Record<string, unknown>) {
      return screen.rerender(props)
    },
  }
}

export type BrowserWrapper = ReturnType<typeof renderCompat>
