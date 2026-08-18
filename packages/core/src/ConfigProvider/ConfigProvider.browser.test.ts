import type vueuse from '@vueuse/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent, h } from 'vue'
import { useId } from '@/shared'
import ConfigProviderTest from './_ConfigProvider.vue'
import ConfigProvider from './ConfigProvider.vue'

vi.mock('@vueuse/core', async (importOriginal) => {
  const mod: typeof vueuse = await importOriginal()
  const createSharedComposable: typeof vueuse.createSharedComposable = fn => fn
  return { ...mod, createSharedComposable }
})

describe('given a default ConfigProvider', async () => {
  let screen: Awaited<ReturnType<typeof render>>

  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 200 })
  Object.defineProperty(document.documentElement, 'clientWidth', { writable: true, configurable: true, value: 190 })

  beforeEach(async () => {
    screen = await render(ConfigProviderTest)
    await new Promise(resolve => setTimeout(resolve, 0))
  })

  it('it should render config provider, and all it\'s slot correctly', () => {
    expect(screen.container.firstElementChild).toBeTruthy()
  })

  it('should render direction="ltr"', () => {
    expect(screen.container.innerHTML).toContain('dir="ltr"')
  })

  it('should add scrollBody\'s css to body', () => {
    expect(document.body.style.paddingRight).toBe('10px')
    expect(document.body.style.marginRight).toBe('0px')
    expect(document.body.style.overflow).toBe('hidden')
    expect(document.documentElement.style.getPropertyValue('--scrollbar-width')).toBe('10px')
  })
})

describe('given a dir="rtl" ConfigProvider', async () => {
  let screen: Awaited<ReturnType<typeof render>>

  beforeEach(async () => {
    screen = await render(ConfigProviderTest, { props: { dir: 'rtl' } })
    await new Promise(resolve => setTimeout(resolve, 0))
  })

  it('should render direction="rtl"', () => {
    expect(screen.container.innerHTML).toContain('dir="rtl"')
  })
})

describe('given a scrollBody ConfigProvider', async () => {
  it('should set 0 padding, 0 margin body', async () => {
    await render(ConfigProviderTest, { props: { scrollBody: false } })
    expect(document.body.style.paddingRight).toBe('0px')
    expect(document.body.style.marginRight).toBe('0px')
  })

  it('should set 0 padding body', async () => {
    await render(ConfigProviderTest, { props: { scrollBody: { padding: 20 } } })
    expect(document.body.style.paddingRight).toBe('20px')
    expect(document.body.style.marginRight).toBe('0px')
  })

  it('should set 0 margin body', async () => {
    await render(ConfigProviderTest, { props: { scrollBody: { margin: 20, padding: 0 } } })
    expect(document.body.style.paddingRight).toBe('0px')
    expect(document.body.style.marginRight).toBe('20px')
  })
})

describe('given a useId ConfigProvider', () => {
  it('uses the provided id generator before Vue useId', async () => {
    const IdConsumer = defineComponent({
      setup() {
        const id = useId(undefined, 'reka-test')
        return () => h('div', { id })
      },
    })

    const screen = await render(ConfigProvider, {
      props: { useId: () => 'provided-id' },
      slots: { default: () => h(IdConsumer) },
    })

    expect(screen.container.querySelector('#reka-test-provided-id')).toBeTruthy()
  })
})
