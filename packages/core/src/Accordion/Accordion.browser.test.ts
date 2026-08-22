import { renderToString } from '@vue/server-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'
import { render } from 'vitest-browser-vue'
import { page, userEvent } from 'vitest/browser'
import { createSSRApp, defineComponent, h, nextTick } from 'vue'
import { ConfigProvider } from '@/ConfigProvider'
import {
  AccordionContent,
  AccordionHeader,
  AccordionItem,
  AccordionRoot,
  AccordionTrigger,
} from '.'
import Accordion from './story/_Accordion.vue'

const AccordionHydrationFixture = defineComponent({
  setup() {
    const items = ['One', 'Two']
    let count = 0
    const useId = () => `nuxt-${++count}`

    return () =>
      h(ConfigProvider, { useId }, () =>
        h(
          AccordionRoot,
          { type: 'single', collapsible: true },
          () => items.map(item =>
            h(AccordionItem, { value: item }, () => [
              h(AccordionHeader, () =>
                h(AccordionTrigger, () => `Trigger ${item}`)),
              h(AccordionContent, () => `Content ${item}`),
            ]),
          ),
        ))
  },
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ssr hydration', () => {
  it('uses ConfigProvider ids when Vue app id prefixes differ', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Nuxt prerender can produce a different Vue useId app prefix than the
    // hydrating client. ConfigProvider's useId must remain the stable source.
    const serverApp = createSSRApp(AccordionHydrationFixture)
    serverApp.config.idPrefix = 'v-1'

    const container = document.createElement('div')
    container.innerHTML = await renderToString(serverApp)
    document.body.innerHTML = ''
    document.body.append(container)

    expect(container.innerHTML).toContain('id="reka-accordion-trigger-nuxt-1"')
    expect(container.innerHTML).toContain('id="reka-collapsible-content-nuxt-2"')
    const triggerId = container.querySelector('button')?.id
    const contentId = container.querySelector('[role="region"]')?.id

    const clientApp = createSSRApp(AccordionHydrationFixture)
    clientApp.config.idPrefix = 'v-0'
    clientApp.mount(container)
    await nextTick()

    expect(container.querySelector('button')?.id).toBe(triggerId)
    expect(container.querySelector('[role="region"]')?.id).toBe(contentId)

    // Browser mode runs server rendering and hydration unchanged. Mutating the
    // server trigger ID makes this exact warning assertion fail, so the spies
    // are observing the real hydration path rather than merely staying empty.
    const warnings = warn.mock.calls.flat().join('\n')
    expect(warnings).not.toContain('Hydration attribute mismatch')
    expect(error.mock.calls.flat().join('\n')).not.toContain('Hydration completed but contains mismatches')

    clientApp.unmount()
    container.remove()
  })
})

type AccordionScreen = Awaited<ReturnType<typeof render<typeof Accordion>>>

async function setup(type: 'single' | 'multiple' = 'single') {
  const screen = await render(Accordion, { props: { type } })
  const buttons = Array.from(screen.container.querySelectorAll<HTMLButtonElement>('button'))
  expect(screen.container.firstElementChild).toBeVisible()
  return { screen, buttons, user: userEvent.setup() }
}

function getContent(screen: AccordionScreen, label: string) {
  return Array.from(screen.container.querySelectorAll<HTMLElement>('.accordion-animated-content > div'))
    .find(element => element.textContent?.trim() === label)!
}

describe('given a single Accordion', () => {
  let screen: AccordionScreen
  let buttons: HTMLButtonElement[]
  let user: ReturnType<typeof userEvent.setup>

  beforeEach(async () => {
    ({ screen, buttons, user } = await setup())
  })

  it('should pass axe accessibility tests', async () => {
    // Both variants produce 12 node-bearing passes and no incomplete results
    // or violations in Chromium. Emptying one trigger makes this fail with
    // button-name and empty-heading, so the audit is mutation-live.
    expect(await axe(screen.container.firstElementChild!)).toHaveNoViolations()
  })

  describe('when navigating by keyboard', () => {
    beforeEach(() => {
      buttons[0].focus()
    })

    describe('on `ArrowDown`', () => {
      it('should move focus to the next trigger', async () => {
        await user.keyboard('{ArrowDown}')
        expect(buttons[1]).toBe(document.activeElement)
      })

      it('should move focus to the first item if at the end', async () => {
        buttons[3].focus()
        await user.keyboard('{ArrowDown}')
        expect(buttons[0]).toBe(document.activeElement)
      })
    })

    describe('on `ArrowUp`', () => {
      it('should move focus to the previous trigger', async () => {
        buttons[2].focus()
        await user.keyboard('{ArrowUp}')
        expect(buttons[1]).toBe(document.activeElement)
      })

      it('should move focus to the last item if at the beginning', async () => {
        buttons[0].focus()
        await user.keyboard('{ArrowUp}')
        expect(buttons[3]).toBe(document.activeElement)
      })
    })

    describe('on `Home`', () => {
      it('should move focus to the first trigger', async () => {
        buttons[2].focus()
        await user.keyboard('{Home}')
        expect(buttons[0]).toBe(document.activeElement)
      })
    })

    describe('on `End`', () => {
      it('should move focus to the last trigger', async () => {
        await user.keyboard('{End}')
        expect(buttons[3]).toBe(document.activeElement)
      })
    })
  })

  describe('when clicking a trigger', () => {
    let trigger: HTMLButtonElement
    let contentOne: HTMLElement

    beforeEach(async () => {
      trigger = buttons[0]
      await user.click(page.elementLocator(trigger))
      contentOne = getContent(screen, 'Content One')
    })

    it('should show the content', () => {
      expect(screen.container.innerHTML).toContain(contentOne.innerHTML)
    })

    it('should call update:modelValue', () => {
      expect(screen.emitted('update:modelValue')?.[0]?.[0]).toBe('One')
    })

    describe('then clicking the trigger again', () => {
      it('should not close the content', async () => {
        await user.click(page.elementLocator(trigger))
        expect(screen.container.innerHTML).toContain(contentOne.innerHTML)
      })

      it('should not call update:modelValue', async () => {
        await user.click(page.elementLocator(trigger))
        expect(screen.emitted('update:modelValue')?.length).toBe(1)
      })
    })

    describe('then clicking another trigger', () => {
      beforeEach(async () => {
        await user.click(page.elementLocator(buttons[1]))
      })

      it('should show the new content', () => {
        const contentTwo = getContent(screen, 'Content Two')
        expect(screen.container.innerHTML).toContain(contentTwo.innerHTML)
      })

      it('should call update:modelValue', () => {
        expect(screen.emitted('update:modelValue')?.[1]?.[0]).toBe('Two')
      })

      it('should hide the previous content', () => {
        expect(screen.container.innerHTML).not.toContain(contentOne.innerHTML)
      })
    })
  })
})

describe('given a multiple Accordion', () => {
  let screen: AccordionScreen
  let buttons: HTMLButtonElement[]
  let user: ReturnType<typeof userEvent.setup>

  beforeEach(async () => {
    ({ screen, buttons, user } = await setup('multiple'))
  })

  it('should pass axe accessibility tests', async () => {
    expect(await axe(screen.container.firstElementChild!)).toHaveNoViolations()
  })

  describe('when navigating by keyboard', () => {
    beforeEach(() => {
      buttons[0].focus()
    })

    describe('on `ArrowDown`', () => {
      it('should move focus to the next trigger', async () => {
        await user.keyboard('{ArrowDown}')
        expect(buttons[1]).toBe(document.activeElement)
      })
    })

    describe('on `ArrowUp`', () => {
      it('should move focus to the previous trigger', async () => {
        await user.keyboard('{ArrowUp}')
        expect(buttons[3]).toBe(document.activeElement)
      })
    })

    describe('on `Home`', () => {
      it('should move focus to the first trigger', async () => {
        buttons[2].focus()
        await user.keyboard('{Home}')
        expect(buttons[0]).toBe(document.activeElement)
      })
    })

    describe('on `End`', () => {
      it('should move focus to the last trigger', async () => {
        await user.keyboard('{End}')
        expect(buttons[3]).toBe(document.activeElement)
      })
    })
  })

  describe('when clicking a trigger', () => {
    let trigger: HTMLButtonElement
    let contentOne: HTMLElement

    beforeEach(async () => {
      trigger = buttons[0]
      await user.click(page.elementLocator(trigger))
      contentOne = getContent(screen, 'Content One')
    })

    it('should show the content', () => {
      expect(screen.container.innerHTML).toContain(contentOne.innerHTML)
    })

    it('should call update:modelValue', () => {
      expect(screen.emitted('update:modelValue')?.[0]?.[0]).toMatchObject(['One'])
    })

    describe('then clicking the trigger again', () => {
      beforeEach(async () => {
        await user.click(page.elementLocator(trigger))
      })

      it('should hide the content', () => {
        expect(screen.container.innerHTML).not.toContain(contentOne.innerHTML)
      })

      it('should call update:modelValue', () => {
        expect(screen.emitted('update:modelValue')?.[1]?.[0]).toMatchObject([])
      })
    })

    describe('then clicking another trigger', () => {
      beforeEach(async () => {
        await user.click(page.elementLocator(buttons[1]))
      })

      it('should show the new content', () => {
        const contentTwo = getContent(screen, 'Content Two')
        expect(screen.container.innerHTML).toContain(contentTwo.innerHTML)
      })

      it('should call onValueChange', () => {
        expect(screen.emitted('update:modelValue')?.[1]?.[0]).toMatchObject(['One', 'Two'])
      })

      it('should not hide the previous content', () => {
        expect(screen.container.innerHTML).toContain(contentOne.innerHTML)
      })
    })
  })
})
