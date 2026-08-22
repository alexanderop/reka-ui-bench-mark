import type { Locator } from 'vitest/browser'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'
import { render } from 'vitest-browser-vue'
import { commands, userEvent } from 'vitest/browser'
import { nextTick } from 'vue'
import TagsInput from './story/_TagsInput.vue'
import TagsInputDisabled from './story/_TagsInputDisabled.vue'
import TagsInputObject from './story/_TagsInputObject.vue'

type TagsInputScreen = Awaited<ReturnType<typeof render<typeof TagsInput>>>

function inputElement(input: Locator) {
  return input.element() as HTMLInputElement
}

function tagElements(screen: { container: HTMLElement }) {
  return [...screen.container.querySelectorAll<HTMLElement>('[data-reka-collection-item]')]
}

async function copyAndPaste(text: string, target: HTMLInputElement) {
  // Parallel tester pages share the OS clipboard. The typed command holds one
  // server-side mutex across the complete trusted copy/paste keyboard gesture.
  const token = crypto.randomUUID()
  const sourceSelector = `[data-browser-clipboard-source="${token}"]`
  const targetSelector = `[data-browser-clipboard-target="${token}"]`
  const source = document.createElement('textarea')
  source.dataset.browserClipboardSource = token
  source.value = text
  target.dataset.browserClipboardTarget = token
  document.body.append(source)

  try {
    await commands.copyPaste(sourceSelector, targetSelector, text)
  }
  finally {
    source.remove()
    delete target.dataset.browserClipboardTarget
  }
}

class CompositionPayload {
  constructor(readonly input: HTMLInputElement) {}

  start(data = '') {
    // Vitest Browser Mode 4.1.10 has no first-class IME composition action or
    // way to supply InputEvent.data. These tests explicitly exercise that
    // otherwise-unreachable payload, so only the composition/input events stay
    // synthetic; all ordinary typing, keyboard, focus and clipboard paths use
    // the browser driver above and below.
    this.input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data }))
  }

  end(data = '') {
    this.input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data }))
  }

  inputValue(value: string, data: string) {
    this.input.value = value
    this.input.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      cancelable: true,
      data,
      inputType: 'insertCompositionText',
    }))
  }
}

describe('given default TagsInput', () => {
  let screen: TagsInputScreen
  let input: Locator
  let tags: HTMLElement[]
  let addTagSpy: ReturnType<typeof vi.fn>
  let removeTagSpy: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    addTagSpy = vi.fn()
    removeTagSpy = vi.fn()
    screen = await render(TagsInput, { props: { onAddTag: addTagSpy, onRemoveTag: removeTagSpy } })
    input = screen.getByRole('textbox')
    tags = tagElements(screen)
  })

  // @finding TagsInput/TagsInput.test.ts#fixture-color-contrast
  it.fails('should pass axe accessibility tests', async () => {
    expect(await axe(screen.container.firstElementChild as HTMLElement)).toHaveNoViolations()
  })

  it('should render the initial tags', async () => {
    await expect.element(tags[0]).toHaveTextContent('Test')
  })

  const addTag = async (text: string) => {
    await input.fill(text)
    await expect.element(input).toHaveValue(text)
    await userEvent.keyboard('{Enter}')
    await expect.element(input).toHaveValue('')
    tags = tagElements(screen)
  }

  describe('after adding new value', () => {
    beforeEach(async () => {
      await input.click()
      await addTag('123')
      await addTag('Asd')
    })

    it('should emit `addTag` event', () => {
      expect(addTagSpy.mock.calls.flat()).toEqual(['123', 'Asd'])
    })

    it('should add a new tag', async () => {
      await expect.element(screen.container).toHaveTextContent('123')
      await expect.element(tags[1]).toHaveTextContent('123')
    })

    it('should have focus on input', async () => {
      await expect.element(input).toHaveFocus()
    })

    it('should clear off the value in input', async () => {
      await expect.element(input).toHaveValue('')
    })

    describe('after pressing on ArrowLeft on input', () => {
      beforeEach(async () => {
        await userEvent.keyboard('{ArrowLeft}')
      })

      it('should select the last tags', async () => {
        await expect.element(tags.at(-1)!).toHaveAttribute('data-state', 'active')
      })

      it('should select the previous tag when press ArrowLeft', async () => {
        await userEvent.keyboard('{ArrowLeft}')
        await expect.element(tags.at(-1)!).toHaveAttribute('data-state', 'inactive')
        await expect.element(tags[tags.length - 2]).toHaveAttribute('data-state', 'active')
      })

      it('should select the first item when press Home', async () => {
        await userEvent.keyboard('{Home}')
        await expect.element(tags[0]).toHaveAttribute('data-state', 'active')
        await expect.element(tags.at(-1)!).toHaveAttribute('data-state', 'inactive')
      })

      it('should select the last item when press End', async () => {
        await userEvent.keyboard('{Home}')
        await userEvent.keyboard('{End}')
        await expect.element(tags[0]).toHaveAttribute('data-state', 'inactive')
        await expect.element(tags.at(-1)!).toHaveAttribute('data-state', 'active')
      })

      it('should remove active state when press ArrowRight', async () => {
        await userEvent.keyboard('{ArrowRight}')
        await expect.element(tags.at(-1)!).toHaveAttribute('data-state', 'inactive')
      })

      describe('after pressing on Backspace', () => {
        let prevTag: HTMLElement

        beforeEach(async () => {
          prevTag = screen.container.querySelector<HTMLElement>('[data-state="active"]')!
          await userEvent.keyboard('{Backspace}')
          await expect.element(prevTag).not.toBeInTheDocument()
          tags = tagElements(screen)
        })

        it('should trigger `removeTag` event', () => {
          expect(removeTagSpy.mock.calls[0]?.[0]).toEqual('Asd')
        })

        it('should remove the active tag', () => {
          expect(screen.container.contains(prevTag)).toBe(false)
          expect(tags.length).toBe(2)
        })

        it('should select the new last tag', async () => {
          await expect.element(tags.at(-1)!).toHaveAttribute('data-state', 'active')
        })
      })
    })
  })

  describe('adding values on user actions', () => {
    const setValueInInput = async (value: string) => {
      await input.fill(value)
      await expect.element(input).toHaveValue(value)
    }

    it('should add value on keydown:enter', async () => {
      const tag = 'tag:enter'

      await setValueInInput(tag)
      await userEvent.keyboard('{Enter}')

      tags = tagElements(screen)
      await expect.element(screen.container).toHaveTextContent(tag)
      await expect.element(tags[1]).toHaveTextContent(tag)
    })

    it('should add value on keydown:tab', async () => {
      const tag = 'tag:tab'
      await screen.rerender({ addOnTab: true })
      await setValueInInput(tag)

      await userEvent.tab()

      tags = tagElements(screen)
      await expect.element(screen.container).toHaveTextContent(tag)
      await expect.element(tags[1]).toHaveTextContent(tag)
    })

    it('should add value on blur', async () => {
      const tag = 'tag:blur'
      await screen.rerender({ addOnBlur: true })
      await setValueInInput(tag)

      const outside = document.createElement('button')
      outside.textContent = 'Outside TagsInput'
      document.body.append(outside)
      try {
        await userEvent.click(outside)
        await expect.element(input).not.toHaveFocus()
      }
      finally {
        outside.remove()
      }

      tags = tagElements(screen)
      await expect.element(screen.container).toHaveTextContent(tag)
      await expect.element(tags[1]).toHaveTextContent(tag)
    })
  })
})

describe('given a TagsInput with objects', () => {
  describe('should be able to convert the value', () => {
    let screen: Awaited<ReturnType<typeof render<typeof TagsInputObject>>>
    let input: Locator
    let tags: HTMLElement[]
    let convertValue: ReturnType<typeof vi.fn>

    beforeEach(async () => {
      convertValue = vi.fn((item: string) => ({ name: item, id: 42 }))
      screen = await render(TagsInputObject, {
        props: {
          displayValue: (item: any) => `Person: ${item.name}`,
          convertValue,
        },
      })
      input = screen.getByRole('textbox')
      tags = tagElements(screen)
    })

    it('should display the initial tags', async () => {
      await expect.element(tags[0]).toHaveTextContent('Person: Durward Reynolds')
      await expect.element(tags[1]).toHaveTextContent('Person: Kenton Towne')
    })

    const addTag = async (text: string) => {
      await input.fill(text)
      await userEvent.keyboard('{Enter}')
      await expect.element(input).toHaveValue('')
      tags = tagElements(screen)
    }

    it('should update the tags', async () => {
      await addTag('Moriah Stanton')
      await expect.element(tags.at(-1)!).toHaveTextContent('Person: Moriah Stanton')
      expect(convertValue.mock.results.map(result => result.value)).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: expect.any(Number), name: expect.any(String) }),
      ]))
    })
  })

  it('should throw an error if props are not ok', async () => {
    const consoleWarnMockFunction = vi.fn()

    const screen = await render(TagsInputObject, {
      global: {
        config: {
          errorHandler(err: any) {
            consoleWarnMockFunction(err.message)
          },
        },
      },
      props: {
        displayValue: (item: any) => `Person: ${item.name}`,
        convertValue: undefined,
      },
    })

    const input = screen.getByRole('textbox')
    await input.fill('Moriah Stanton')
    await userEvent.keyboard('{Enter}')

    expect(consoleWarnMockFunction).toHaveBeenCalledOnce()
    expect(consoleWarnMockFunction).toHaveBeenLastCalledWith('You must provide a `convertValue` function when using objects as values.')
  })

  describe('given a TagsInput with delimiter', () => {
    const setupDelimiter = async (delimiter: string | RegExp) => {
      const screen = await render(TagsInput, {
        props: {
          delimiter,
          addOnPaste: true,
        },
      })

      return {
        screen,
        input: screen.getByRole('textbox'),
      }
    }

    it('should add tag on typing single delimiter character', async () => {
      const { screen, input } = await setupDelimiter(',')

      await userEvent.type(input, 'tag1,')

      const tags = tagElements(screen)
      await expect.element(tags[1]).toHaveTextContent('tag1')
    })

    it('should add tag on typing multiple delimiter characters', async () => {
      const { screen, input } = await setupDelimiter(/[ ,;]+/)

      await userEvent.type(input, 'tag1,')
      await userEvent.type(input, 'tag2 ')
      await userEvent.type(input, 'tag3;')

      const tags = tagElements(screen)
      await expect.element(tags[1]).toHaveTextContent('tag1')
      await expect.element(tags[2]).toHaveTextContent('tag2')
      await expect.element(tags[3]).toHaveTextContent('tag3')
    })

    it('should add multiple tags on pasting text with single delimiter character', async () => {
      const { screen, input } = await setupDelimiter(',')

      await copyAndPaste('tag1,tag2,tag3', inputElement(input))

      await expect.poll(() => tagElements(screen).slice(1).map(tag => tag.textContent?.trim()))
        .toEqual(['tag1', 'tag2', 'tag3'])
      const tags = tagElements(screen)
      await expect.element(tags[1]).toHaveTextContent('tag1')
      await expect.element(tags[2]).toHaveTextContent('tag2')
      await expect.element(tags[3]).toHaveTextContent('tag3')
    })

    it('should add multiple tags on pasting text with multiple delimiter characters', async () => {
      const { screen, input } = await setupDelimiter(/[ ,;]+/)

      await copyAndPaste('tag1, tag2;tag3 tag4', inputElement(input))

      await expect.poll(() => tagElements(screen).slice(1).map(tag => tag.textContent?.trim()))
        .toEqual(['tag1', 'tag2', 'tag3', 'tag4'])
      const tags = tagElements(screen)
      await expect.element(tags[1]).toHaveTextContent('tag1')
      await expect.element(tags[2]).toHaveTextContent('tag2')
      await expect.element(tags[3]).toHaveTextContent('tag3')
      await expect.element(tags[4]).toHaveTextContent('tag4')
    })

    it('should not create tag when delimiter is typed during IME composition', async () => {
      const { screen, input } = await setupDelimiter(',')
      await input.click()
      const composition = new CompositionPayload(inputElement(input))

      composition.start()
      composition.inputValue(',', ',')
      await nextTick()

      const tags = tagElements(screen)
      expect(tags.length).toBe(1)
      await expect.element(input).toHaveValue(',')
    })

    it('should process value after composition ends', async () => {
      const { screen, input } = await setupDelimiter(',')
      await input.click()
      const composition = new CompositionPayload(inputElement(input))

      composition.start()
      composition.inputValue('hello,', ',')
      await nextTick()

      expect(tagElements(screen).length).toBe(1)

      composition.end('hello,')
      await nextTick()

      composition.inputValue('hello,', ',')
      await expect.poll(() => tagElements(screen).length).toBe(2)

      const tags = tagElements(screen)
      expect(tags.length).toBe(2)
      await expect.element(tags[1]).toHaveTextContent('hello')
    })
  })
})

describe('given TagsInput with a disabled item before a removable one', () => {
  let screen: Awaited<ReturnType<typeof render<typeof TagsInputDisabled>>>
  let input: Locator
  let removeTagSpy: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    removeTagSpy = vi.fn()
    screen = await render(TagsInputDisabled, { props: { onRemoveTag: removeTagSpy } })
    input = screen.getByRole('textbox')
    await input.click()
  })

  it('removes the selected removable tag, not the disabled one', async () => {
    // First Backspace selects the last removable tag, second removes it.
    await userEvent.keyboard('{Backspace}')
    await userEvent.keyboard('{Backspace}')

    await expect.poll(() => tagElements(screen).map(tag => tag.textContent?.trim())).toEqual(['Disabled'])
    expect(removeTagSpy.mock.calls[0]?.[0]).toEqual('Removable')
  })

  it('does not remove the disabled tag when it is the only remaining tag', async () => {
    await userEvent.keyboard('{Backspace}')
    await userEvent.keyboard('{Backspace}')
    // Only the disabled tag remains; further backspaces must not remove it.
    await userEvent.keyboard('{Backspace}')
    await userEvent.keyboard('{Backspace}')

    await expect.poll(() => tagElements(screen).map(tag => tag.textContent?.trim())).toEqual(['Disabled'])
  })
})
