import { beforeEach, describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent, h } from 'vue'
import { ConfigProvider } from '@/ConfigProvider'
import Teleport from './Teleport.vue'

// Browser-mode port of `Teleport.test.ts`. A T2 file with no stubs to delete
// and no story fixture — the original builds its hosts inline with `h()`, which
// the port keeps verbatim.
//
// Four translations, all forced by the harness rather than by the browser:
//
//  - `mount(Host, { attachTo: document.body })` → `await render(Host)`.
//    `render` throws outright on `attachTo` (`pure-epEwB8Ps.js`), and it
//    attaches its own container to the live document, which is all this file
//    needs. The structural assertions remain document-scoped.
//  - The original's five `await nextTick()` calls become retrying locator
//    existence assertions. Teleport placement is the outcome, not a one-flush
//    timing contract, so waiting for the user-visible node is both less coupled
//    to Vue and more precise about why the test waits.
//  - `document.body.innerHTML = ''` is **KEPT**, per the rule in `AGENTS.md`:
//    every query in this file reads the whole document, and the tests below
//    call `unmount()` explicitly, which leaks a container that `cleanup()` will
//    not reclaim. Hook order makes this safe — `vitest-browser-vue` registers
//    `beforeEach(cleanup)` on the file root suite, this reset sits inside a
//    `describe`, and parent-first ordering runs `cleanup()` first.
//  - `wrapper.unmount()` / `container.remove()` are **KEPT**. The translation
//    table says to drop a manual `unmount()`, but here the teardown ordering is
//    part of what is being exercised: a `Teleport` whose target element is
//    removed while it is still mounted is a different situation from one
//    unmounted first, and the original tests the second.
//
// The interesting result is what did NOT need translating: `AGENTS.md` says
// portalled content is invisible to `screen.getBy*`. Measured here, it is not —
// see `#screen-is-body-scoped`, and the two extra assertions in the first test
// that pin the real scoping down.

describe('given default Teleport', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('teleports slot content into document.body by default', async () => {
    // Wrap in a host component so we can assert content is NOT inside the host
    const Host = defineComponent({
      setup() {
        return () => h('div', { id: 'host' }, [
          h(Teleport, { forceMount: true }, {
            default: () => h('span', { id: 'teleported' }, 'teleported content'),
          }),
        ])
      },
    })

    const screen = await render(Host)

    // Content must exist somewhere in the document
    const teleportedLocator = screen.getByText('teleported content', { exact: true })
    await expect.element(teleportedLocator).toBeInTheDocument()
    const teleported = teleportedLocator.element()
    expect(teleported.textContent).toBe('teleported content')

    // Content must NOT be inside the host div
    const host = document.getElementById('host')
    expect(host!.contains(teleported)).toBe(false)

    // ...nor inside the render container, which is what makes this the
    // canonical portal case for the eight T3 overlay components.
    expect(screen.container.contains(teleported)).toBe(false)

    // Added to the original: pin down which locator root actually sees it.
    // `render()`'s destructured `getBy*` helpers are bound to `baseElement`
    // (default `document.body`) and therefore DO reach teleported content;
    // only `screen.locator` is container-scoped. See `#screen-is-body-scoped`.
    expect(screen.getByText('teleported content', { exact: true }).elements()).toHaveLength(1)
    expect(screen.locator.getByText('teleported content', { exact: true }).elements()).toHaveLength(0)

    await screen.unmount()
  })

  it('renders inline when disabled=true', async () => {
    const Host = defineComponent({
      setup() {
        return () => h('div', { id: 'host-disabled' }, [
          h(Teleport, { forceMount: true, disabled: true }, {
            default: () => h('span', { id: 'inline-content' }, 'inline content'),
          }),
        ])
      },
    })

    const screen = await render(Host)

    const inlineLocator = screen.getByText('inline content', { exact: true })
    await expect.element(inlineLocator).toBeInTheDocument()
    const inline = inlineLocator.element()

    // Content must be INSIDE the host div
    const host = document.getElementById('host-disabled')
    expect(host!.contains(inline)).toBe(true)

    await screen.unmount()
  })

  it('teleports to a custom container element', async () => {
    const container = document.createElement('div')
    container.id = 'custom-container'
    document.body.appendChild(container)

    const Host = defineComponent({
      setup() {
        return () => h(Teleport, { to: '#custom-container', forceMount: true }, {
          default: () => h('span', { id: 'custom-teleported' }, 'custom target'),
        })
      },
    })

    const screen = await render(Host)

    const teleportedLocator = screen.getByText('custom target', { exact: true })
    await expect.element(teleportedLocator).toBeInTheDocument()
    const teleported = teleportedLocator.element()
    expect(container.contains(teleported)).toBe(true)

    await screen.unmount()
    container.remove()
  })

  it('uses the ConfigProvider `teleportTo` target as the default', async () => {
    const container = document.createElement('div')
    container.id = 'config-container'
    document.body.appendChild(container)

    const Host = defineComponent({
      setup() {
        return () => h(ConfigProvider, { teleportTo: '#config-container' }, {
          default: () => h(Teleport, { forceMount: true }, {
            default: () => h('span', { id: 'config-teleported' }, 'config target'),
          }),
        })
      },
    })

    const screen = await render(Host)

    const teleportedLocator = screen.getByText('config target', { exact: true })
    await expect.element(teleportedLocator).toBeInTheDocument()
    const teleported = teleportedLocator.element()
    expect(container.contains(teleported)).toBe(true)

    await screen.unmount()
    container.remove()
  })

  it('prefers an explicit `to` prop over the ConfigProvider `teleportTo`', async () => {
    const configContainer = document.createElement('div')
    configContainer.id = 'config-fallback'
    const explicitContainer = document.createElement('div')
    explicitContainer.id = 'explicit-target'
    document.body.append(configContainer, explicitContainer)

    const Host = defineComponent({
      setup() {
        return () => h(ConfigProvider, { teleportTo: '#config-fallback' }, {
          default: () => h(Teleport, { to: '#explicit-target', forceMount: true }, {
            default: () => h('span', { id: 'override-teleported' }, 'override target'),
          }),
        })
      },
    })

    const screen = await render(Host)

    const teleportedLocator = screen.getByText('override target', { exact: true })
    await expect.element(teleportedLocator).toBeInTheDocument()
    const teleported = teleportedLocator.element()
    expect(explicitContainer.contains(teleported)).toBe(true)
    expect(configContainer.contains(teleported)).toBe(false)

    await screen.unmount()
    configContainer.remove()
    explicitContainer.remove()
  })
})
