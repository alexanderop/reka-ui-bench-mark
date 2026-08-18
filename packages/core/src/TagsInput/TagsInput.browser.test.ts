import type { BrowserElement, BrowserWrapper } from '@/test/browser'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'
import { userEvent } from 'vitest/browser'
import { nextTick } from 'vue'
import { renderCompat } from '@/test/browser'
import TagsInput from './story/_TagsInput.vue'
import TagsInputDisabled from './story/_TagsInputDisabled.vue'
import TagsInputObject from './story/_TagsInputObject.vue'

async function paste(text: string) {
  const data = new DataTransfer()
  data.setData('text/plain', text)
  document.activeElement?.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }))
  await nextTick()
}

describe('given default TagsInput', () => {
  let wrapper: BrowserWrapper
  let input: BrowserElement<HTMLInputElement>
  let tags: BrowserElement<HTMLElement>[]
  let addTagSpy: ReturnType<typeof vi.fn>
  let removeTagSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    addTagSpy = vi.fn()
    removeTagSpy = vi.fn()
    wrapper = renderCompat(TagsInput as any, { props: { onAddTag: addTagSpy, onRemoveTag: removeTagSpy } })
    tags = wrapper.findAll('[data-reka-collection-item]')
  })

  // @finding TagsInput/TagsInput.test.ts#fixture-color-contrast
  it.fails('should pass axe accessibility tests', async () => {
    expect(await axe(wrapper.element)).toHaveNoViolations()
  })

  it('should render the initial tags', () => {
    expect(tags[0].html()).contains('Test')
  })

  const addTag = async (text: string) => {
    await input.setValue(text)
    await input.trigger('keydown.enter')
    tags = wrapper.findAll('[data-reka-collection-item]')
  }

  describe('after adding new value', async () => {
    beforeEach(async () => {
      input = wrapper.find('input')
      input.element.focus()
      await addTag('123')
      await addTag('Asd')
    })

    it('should emit `addTag` event', () => {
      expect(addTagSpy.mock.calls.flat()).toEqual(['123', 'Asd'])
    })

    it('should add a new tag', () => {
      expect(wrapper.html()).contains('123')
      expect(tags[1].html()).contains('123')
    })

    it('should have focus on input', () => {
      expect(input.element).toBe(document.activeElement)
    })

    it('should clear off the value in input', () => {
      expect(input.element.value).toBe('')
    })

    describe('after pressing on ArrowLeft on input', () => {
      beforeEach(async () => {
        await input.trigger('keydown', {
          key: 'ArrowLeft',
        })
      })

      it('should select the last tags', () => {
        expect(tags.at(-1).attributes('data-state')).toBe('active')
      })

      it('should select the previous tag when press ArrowLeft', async () => {
        await input.trigger('keydown', {
          key: 'ArrowLeft',
        })
        expect(tags.at(-1).attributes('data-state')).toBe('inactive')
        expect(tags[tags.length - 2].attributes('data-state')).toBe('active')
      })

      it('should select the first item when press Home', async () => {
        await input.trigger('keydown', {
          key: 'Home',
        })
        expect(tags[0].attributes('data-state')).toBe('active')
        expect(tags.at(-1).attributes('data-state')).toBe('inactive')
      })

      it('should select the last item when press End', async () => {
        await input.trigger('keydown', {
          key: 'Home',
        })
        await input.trigger('keydown', {
          key: 'End',
        })
        expect(tags[0].attributes('data-state')).toBe('inactive')
        expect(tags.at(-1).attributes('data-state')).toBe('active')
      })

      it('should remove active state when press ArrowRight', async () => {
        await input.trigger('keydown', {
          key: 'ArrowRight',
        })
        expect(tags.at(-1).attributes('data-state')).toBe('inactive')
      })

      describe('after pressing on Backspace', () => {
        let prevTag: BrowserElement<HTMLElement>
        beforeEach(async () => {
          prevTag = wrapper.find('[data-state="active"]')
          await input.trigger('keydown', {
            key: 'Backspace',
          })
          tags = wrapper.findAll('[data-reka-collection-item]')
        })

        it('should trigger `removeTag` event', () => {
          expect(removeTagSpy.mock.calls[0]?.[0]).toEqual('Asd')
        })

        it('should remove the active tag', () => {
          expect(wrapper.element.contains(prevTag.element)).toBe(false)
          expect(tags.length).toBe(2)
        })

        it('should select the new last tag', () => {
          expect(tags.at(-1).attributes('data-state')).toBe('active')
        })
      })
    })
  })

  describe('adding values on user actions', () => {
    const setValueInInput = (value: string) => {
      input = wrapper.find('input')
      input.element.focus()
      return input.setValue(value)
    }

    it('should add value on keydown:enter', async () => {
      const tag = 'tag:enter'

      await setValueInInput(tag)

      await input.trigger('keydown.enter')

      tags = wrapper.findAll('[data-reka-collection-item]')

      expect(wrapper.html()).toContain(tag)
      expect(tags[1].text()).toBe(tag)
    })

    it('should add value on keydown:tab', async () => {
      const tag = 'tag:tab'
      await wrapper.setProps({ addOnTab: true })
      await setValueInInput(tag)

      await input.trigger('keydown.tab')

      tags = wrapper.findAll('[data-reka-collection-item]')

      expect(wrapper.html()).toContain(tag)
      expect(tags[1].text()).toBe(tag)
    })

    it('should add value on blur', async () => {
      const tag = 'tag:blur'
      await wrapper.setProps({ addOnBlur: true })
      await setValueInInput(tag)

      await input.trigger('blur')

      tags = wrapper.findAll('[data-reka-collection-item]')

      expect(wrapper.html()).toContain(tag)
      expect(tags[1].text()).toBe(tag)
    })
  })
})

describe('given a TagsInput with objects', async () => {
  let wrapper: BrowserWrapper
  let input: BrowserElement<HTMLInputElement>
  let tags: BrowserElement<HTMLElement>[]

  describe('should be able to convert the value', () => {
    let convertValue: ReturnType<typeof vi.fn>

    beforeEach(() => {
      convertValue = vi.fn((item: string) => ({ name: item, id: 42 }))
      wrapper = renderCompat(TagsInputObject, {
        props: {
          displayValue: (item: any) => `Person: ${item.name}`,
          convertValue,
        },
      })
      input = wrapper.find('input')
      tags = wrapper.findAll('[data-reka-collection-item]')
    })

    it('should display the initial tags', () => {
      expect(tags[0].text()).toBe('Person: Durward Reynolds')
      expect(tags[1].text()).toBe('Person: Kenton Towne')
    })

    const addTag = async (text: string) => {
      await input.setValue(text)
      await input.trigger('keydown.enter')
      await nextTick()
      tags = wrapper.findAll('[data-reka-collection-item]')
    }

    it('should update the tags', async () => {
      await addTag('Moriah Stanton')
      expect(tags.at(-1)?.text()).toBe('Person: Moriah Stanton')
      expect(convertValue.mock.results.map(result => result.value)).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: expect.any(Number), name: expect.any(String) }),
      ]))
    })
  })

  it('should throw an error if props are not ok', async () => {
    const consoleWarnMockFunction = vi.fn()

    const wrapper = renderCompat(TagsInputObject, {
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

    input = wrapper.find('input')
    await input.setValue('Moriah Stanton')
    await input.trigger('keydown.enter')

    expect(consoleWarnMockFunction).toHaveBeenCalledOnce()
    expect(consoleWarnMockFunction).toHaveBeenLastCalledWith('You must provide a `convertValue` function when using objects as values.')
  })

  describe('given a TagsInput with delimiter', async () => {
    const setupDelimiter = (delimiter: string | RegExp) => {
      const wrapper = renderCompat(TagsInput, {
        props: {
          delimiter,
          addOnPaste: true,
        },
      })

      const input = wrapper.find('input')

      return {
        wrapper,
        input,
      }
    }

    it('should add tag on typing single delimiter character', async () => {
      const { wrapper, input } = setupDelimiter(',')
      const user = userEvent.setup()

      await user.type(input.element, 'tag1,')

      const tags = wrapper.findAll('[data-reka-collection-item]')
      expect(tags[1].text()).toBe('tag1')
    })

    it('should add tag on typing multiple delimiter characters', async () => {
      const { wrapper, input } = setupDelimiter(/[ ,;]+/)
      const user = userEvent.setup()

      await user.type(input.element, 'tag1,')
      await user.type(input.element, 'tag2 ')
      await user.type(input.element, 'tag3;')

      const tags = wrapper.findAll('[data-reka-collection-item]')
      expect(tags[1].text()).toBe('tag1')
      expect(tags[2].text()).toBe('tag2')
      expect(tags[3].text()).toBe('tag3')
    })

    it('should add multiple tags on pasting text with single delimiter character', async () => {
      const { wrapper, input } = setupDelimiter(',')
      const user = userEvent.setup()

      await user.click(input.element)
      await paste('tag1,tag2,tag3')

      const tags = wrapper.findAll('[data-reka-collection-item]')
      expect(tags[1].text()).toBe('tag1')
      expect(tags[2].text()).toBe('tag2')
      expect(tags[3].text()).toBe('tag3')
    })

    it('should add multiple tags on pasting text with multiple delimiter characters', async () => {
      const { wrapper, input } = setupDelimiter(/[ ,;]+/)
      const user = userEvent.setup()

      await user.click(input.element)
      await paste('tag1, tag2;tag3 tag4')

      const tags = wrapper.findAll('[data-reka-collection-item]')
      expect(tags[1].text()).toBe('tag1')
      expect(tags[2].text()).toBe('tag2')
      expect(tags[3].text()).toBe('tag3')
      expect(tags[4].text()).toBe('tag4')
    })

    it('should not create tag when delimiter is typed during IME composition', async () => {
      const { wrapper, input } = setupDelimiter(',')

      input.element.focus()
      await input.trigger('compositionstart')
      input.element.value = ','
      await input.trigger('input', { data: ',' })
      await nextTick()

      const tags = wrapper.findAll('[data-reka-collection-item]')
      expect(tags.length).toBe(1)
      expect(input.element.value).toBe(',')
    })

    it('should process value after composition ends', async () => {
      const { wrapper, input } = setupDelimiter(',')

      input.element.focus()
      await input.trigger('compositionstart')
      input.element.value = 'hello,'
      await input.trigger('input', { data: ',' })
      await nextTick()

      expect(wrapper.findAll('[data-reka-collection-item]').length).toBe(1)

      await input.trigger('compositionend')
      await nextTick()

      input.element.value = 'hello,'
      await input.trigger('input', { data: ',' })
      await nextTick()

      const tags = wrapper.findAll('[data-reka-collection-item]')
      expect(tags.length).toBe(2)
      expect(tags[1].text()).toBe('hello')
    })
  })
})

describe('given TagsInput with a disabled item before a removable one', () => {
  let wrapper: BrowserWrapper
  let input: BrowserElement<HTMLInputElement>
  let removeTagSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    removeTagSpy = vi.fn()
    wrapper = renderCompat(TagsInputDisabled as any, { props: { onRemoveTag: removeTagSpy } })
    input = wrapper.find('input')
    input.element.focus()
  })

  it('removes the selected removable tag, not the disabled one', async () => {
    // First Backspace selects the last removable tag, second removes it.
    await input.trigger('keydown', { key: 'Backspace' })
    await input.trigger('keydown', { key: 'Backspace' })

    const tags = wrapper.findAll('[data-reka-collection-item]')
    expect(tags.map(tag => tag.text())).toEqual(['Disabled'])
    expect(removeTagSpy.mock.calls[0]?.[0]).toEqual('Removable')
  })

  it('does not remove the disabled tag when it is the only remaining tag', async () => {
    await input.trigger('keydown', { key: 'Backspace' })
    await input.trigger('keydown', { key: 'Backspace' })
    // Only the disabled tag remains; further backspaces must not remove it.
    await input.trigger('keydown', { key: 'Backspace' })
    await input.trigger('keydown', { key: 'Backspace' })

    const tags = wrapper.findAll('[data-reka-collection-item]')
    expect(tags.map(tag => tag.text())).toEqual(['Disabled'])
  })
})
