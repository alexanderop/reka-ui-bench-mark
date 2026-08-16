import { renderToString } from '@vue/server-renderer'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'
import { render } from 'vitest-browser-vue'
import { userEvent } from 'vitest/browser'
import { createSSRApp, defineComponent, h, nextTick } from 'vue'
import { ConfigProvider } from '@/ConfigProvider'
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from '.'
import Tabs from './story/_Tabs.vue'

// Browser-mode port of `Tabs.test.ts`.
//
// The reason this file was picked out of T2: it is the only small file carrying
// the `ssr` flag, and nobody had established whether server-rendering works
// inside the browser project at all. It does — see
// `Tabs/Tabs.test.ts#ssr-in-browser`. `@vue/server-renderer`'s package exports
// have no `browser` condition, so Vite takes the `import` condition and hands
// the tester iframe `dist/server-renderer.esm-bundler.js`, which is a pure
// string-builder with no Node dependency. `createSSRApp` + `renderToString` +
// `app.mount(container)` hydration all run unchanged, and `vi.spyOn(console,
// 'warn' | 'error')` observes Vue's hydration warnings exactly as it does under
// jsdom. Measured, not assumed.
//
// Translation notes:
//
//  1. Every query in the original is `wrapper.find` / `wrapper.findAll`, i.e.
//     VueWrapper-scoped, so every translation here is
//     `screen.container.querySelector(All)`. That is not merely the mechanical
//     choice, it is the *required* one: the `ssr hydration` test leaves a
//     hydrated app containing `[role="tab"]` and `[role="tabpanel"]` attached to
//     `document.body` for the remainder of the file (`cleanup()` only removes
//     containers it created), and `screen.getBy*` / `page.getBy*` are
//     document-scoped. A role query would match the SSR leftovers too. See
//     `Tabs/Tabs.test.ts#ssr-container-leaks`.
//  2. `attachTo: document.body` is dropped — `render` throws on it, and it owns
//     its own mount point.
//  3. `trigger.trigger('keydown', { key: 'ArrowRight' })` becomes a real
//     `userEvent.keyboard('{ArrowRight}')` against the already-focused first
//     trigger, per the translation table.
//  4. `wrapper.html()` becomes `screen.container.firstElementChild.outerHTML` —
//     `_Tabs.vue` is single-root, so that is the same subtree VTU serialises.

const TabsHydrationFixture = defineComponent({
  setup() {
    let count = 0
    const useId = () => `nuxt-${++count}`

    return () =>
      h(ConfigProvider, { useId }, () =>
        h(TabsRoot, { defaultValue: 'account' }, () => [
          h(TabsList, () => [
            h(TabsTrigger, { value: 'account' }, () => 'Account'),
            h(TabsTrigger, { value: 'password' }, () => 'Password'),
          ]),
          h(TabsContent, { value: 'account' }, () => 'Account content'),
          h(TabsContent, { value: 'password' }, () => 'Password content'),
        ]))
  },
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ssr hydration', () => {
  it('uses ConfigProvider ids when Vue app id prefixes differ', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Tabs derives trigger/content IDs from one base ID, so this catches the
    // shared source-order bug for components that build related IDs.
    const serverApp = createSSRApp(TabsHydrationFixture)
    serverApp.config.idPrefix = 'v-1'

    const container = document.createElement('div')
    container.innerHTML = await renderToString(serverApp)
    document.body.innerHTML = ''
    document.body.append(container)

    expect(container.innerHTML).toContain('id="reka-tabs-nuxt-1-trigger-account"')
    expect(container.innerHTML).toContain('id="reka-tabs-nuxt-1-content-account"')
    const triggerId = container.querySelector('[role="tab"]')?.id
    const contentId = container.querySelector('[role="tabpanel"]')?.id

    const clientApp = createSSRApp(TabsHydrationFixture)
    clientApp.config.idPrefix = 'v-0'
    clientApp.mount(container)
    await nextTick()

    expect(container.querySelector('[role="tab"]')?.id).toBe(triggerId)
    expect(container.querySelector('[role="tabpanel"]')?.id).toBe(contentId)

    const warnings = warn.mock.calls.flat().join('\n')
    expect(warnings).not.toContain('Hydration attribute mismatch')
    expect(error.mock.calls.flat().join('\n')).not.toContain('Hydration completed but contains mismatches')
  })
})

describe('given default Tabs', () => {
  let screen: Awaited<ReturnType<typeof render>>

  beforeEach(async () => {
    screen = await render(Tabs)
    screen.container.querySelector('button')!.focus()
  })

  it('should pass axe accessibility tests', async () => {
    expect(await axe(screen.container.firstElementChild as HTMLElement)).toHaveNoViolations()
  })

  it('should render tab\'s content', () => {
    expect(screen.container.querySelector('[role=tabpanel]')).not.toBeNull()

    expect(screen.container.firstElementChild!.outerHTML).toContain('Make changes')
  })

  describe('after changing tab', () => {
    beforeEach(async () => {
      // The outer hook already focused the first trigger; keyboard input in
      // browser mode goes to whatever has focus rather than to a chosen node.
      await userEvent.keyboard('{ArrowRight}')
    })

    it('should focus on next tab', () => {
      const trigger = screen.container.querySelectorAll('button')[1]
      expect(trigger).toBe(document.activeElement)
    })

    it('should render it\'s content', () => {
      expect(screen.container.querySelector('[role=tabpanel]')).not.toBeNull()
      expect(screen.container.firstElementChild!.outerHTML).toContain('Change your password')
    })
  })
})

describe('given Tabs without TabsContent', () => {
  it('should not render aria-controls on TabsTrigger', async () => {
    const screen = await render({
      components: { TabsRoot, TabsList, TabsTrigger },
      template: `
        <TabsRoot default-value="tab1">
          <TabsList>
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
            <TabsTrigger value="tab2">Tab 2</TabsTrigger>
          </TabsList>
        </TabsRoot>
      `,
    })
    await flushPromises()

    const triggers = screen.container.querySelectorAll('[role="tab"]')
    await expect.element(triggers[0] as HTMLElement).not.toHaveAttribute('aria-controls')
    await expect.element(triggers[1] as HTMLElement).not.toHaveAttribute('aria-controls')
  })

  it('should render aria-controls only for TabsTrigger with matching TabsContent', async () => {
    const screen = await render({
      components: { TabsRoot, TabsList, TabsTrigger, TabsContent },
      template: `
        <TabsRoot default-value="tab1">
          <TabsList>
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
            <TabsTrigger value="tab2">Tab 2</TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">Content 1</TabsContent>
        </TabsRoot>
      `,
    })
    await flushPromises()

    const triggers = screen.container.querySelectorAll('[role="tab"]')
    await expect.element(triggers[0] as HTMLElement).toHaveAttribute('aria-controls')
    await expect.element(triggers[1] as HTMLElement).not.toHaveAttribute('aria-controls')
  })
})
