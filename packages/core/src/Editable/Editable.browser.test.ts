import type { EditableRootProps } from './EditableRoot.vue'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import { render } from 'vitest-browser-vue'
import { page, userEvent } from 'vitest/browser'
import { useTestKbd } from '@/shared'
import Editable from './story/_Editable.vue'

const kbd = useTestKbd()

type EditableScreen = Awaited<ReturnType<typeof render<typeof Editable>>>

async function setup(props: {
  editableProps?: EditableRootProps
  onSubmit?: (data: string) => void
  emits?: { 'onUpdate:modelValue'?: (data: string) => void }
} = {}) {
  const screen = await render(Editable, { props })
  const editable = screen.getByTestId('root')
  const input = screen.getByTestId('input')
  const preview = screen.getByTestId('preview')
  const area = screen.getByTestId('area')
  const edit = screen.getByTestId('edit')
  const submit = screen.getByTestId('submit')
  const cancel = screen.getByTestId('cancel')
  await expect.element(editable).toBeVisible()
  return { ...screen, user: userEvent, root: editable, input, area, edit, submit, cancel, preview }
}

async function clickOutside() {
  const outside = document.createElement('button')
  outside.textContent = 'Outside Editable'
  document.body.append(outside)
  try {
    await page.getByRole('button', { name: 'Outside Editable', exact: true }).click()
  }
  finally {
    outside.remove()
  }
}

function text(locator: { element: () => Element }) {
  return locator.element().textContent?.trim()
}

it('should pass axe accessibility tests', async () => {
  const { root } = await setup()
  expect(await axe(root.element())).toHaveNoViolations()
})

describe('editable', () => {
  it('respects a default value if provided', async () => {
    const { preview } = await setup({ editableProps: { defaultValue: 'Default Value' } })
    expect(text(preview)).toBe('Default Value')
  })

  it('respects a default value if provided - `modelValue`', async () => {
    const { preview } = await setup({ editableProps: { modelValue: 'Default Value' } })

    expect(text(preview)).toBe('Default Value')
  })

  it('sets the placeholder value if any value isn\'t set', async () => {
    const { preview } = await setup({ editableProps: { placeholder: 'Enter text...' } })

    expect(text(preview)).toBe('Enter text...')
  })

  it('changes to editable mode when clicking on the preview', async () => {
    const { preview, input } = await setup()

    await preview.click()
    await expect.element(input).toBeVisible()
  })

  it('changes to editable mode when clicking on the edit button', async () => {
    const { edit, input } = await setup()

    await edit.click()
    await expect.element(input).toBeVisible()
  })

  it('changes to editable mode when double clicking on the preview', async () => {
    const { preview, input } = await setup({ editableProps: { activationMode: 'dblclick' } })

    await preview.dblClick()
    await expect.element(input).toBeVisible()
  })

  it('selects the input value when entering edit mode and selectOnFocus is true', async () => {
    const { input, edit } = await setup({ editableProps: { defaultValue: 'Default Value', selectOnFocus: true } })

    await edit.click()
    await expect.element(input).toHaveFocus()
    const inputElement = input.element() as HTMLInputElement
    expect(inputElement).toHaveValue('Default Value')
    expect(inputElement.selectionStart).toBe(0)
    expect(inputElement.selectionEnd).toBe(inputElement.value.length)
  })

  it('starts in edit mode if the property is set', async () => {
    const { input } = await setup({ editableProps: { startWithEditMode: true } })

    await expect.element(input).toBeVisible()
  })

  it('submits the value when pressing enter', async () => {
    let submittedValue = ''
    let rerender!: EditableScreen['rerender']
    const { edit, input, preview, rerender: screenRerender } = await setup({
      editableProps: { modelValue: '', submitMode: 'enter' },
      onSubmit: data => submittedValue = data,
      emits: { 'onUpdate:modelValue': (data: string) => rerender({ modelValue: data }) },
    })
    rerender = screenRerender

    await edit.click()
    await input.click()
    await input.fill('New Value')
    await userEvent.keyboard(kbd.ENTER)
    await expect.element(preview).toBeVisible()
    expect(text(preview)).toBe('New Value')
    expect(submittedValue).toBe('New Value')
  })

  it('submits the value on blur', async () => {
    let rerender!: EditableScreen['rerender']
    const { input, preview, rerender: screenRerender } = await setup({ editableProps: { modelValue: '', submitMode: 'blur' }, emits: { 'onUpdate:modelValue': (data: string) => rerender({ modelValue: data, submitMode: 'blur' }) } })
    rerender = screenRerender

    await preview.dblClick()
    await input.click()
    await input.fill('New Value')
    await clickOutside()

    await expect.element(preview).toBeVisible()
    expect(text(preview)).toBe('New Value')
  })

  it('submits the value when pressing enter if submitMode is both', async () => {
    let rerender!: EditableScreen['rerender']
    const { edit, input, preview, rerender: screenRerender } = await setup({ editableProps: { modelValue: '', submitMode: 'both' }, emits: { 'onUpdate:modelValue': (data: string) => rerender({ modelValue: data }) } })
    rerender = screenRerender

    await edit.click()
    await input.click()
    await input.fill('New Value')
    await userEvent.keyboard(kbd.ENTER)
    await expect.element(preview).toBeVisible()
    expect(text(preview)).toBe('New Value')
  })

  it('submits the value on blur if submitMode is both', async () => {
    let rerender!: EditableScreen['rerender']
    const { input, preview, rerender: screenRerender } = await setup({ editableProps: { modelValue: '', submitMode: 'both' }, emits: { 'onUpdate:modelValue': (data: string) => rerender({ modelValue: data, submitMode: 'blur' }) } })
    rerender = screenRerender

    await preview.dblClick()
    await input.click()
    await input.fill('New Value')
    await clickOutside()

    await expect.element(preview).toBeVisible()
    expect(text(preview)).toBe('New Value')
  })

  // @finding Editable/Editable.test.ts#disabled-preview-enters-edit
  it.fails('prevents entering edit mode when disabled', async () => {
    const { preview, input } = await setup({ editableProps: { disabled: true } })

    await preview.click()

    expect((input.element() as HTMLInputElement).hidden).toBe(true)
  })

  it('prevents editing the input value when readonly', async () => {
    const { input, edit } = await setup({ editableProps: { defaultValue: 'Default Value', readonly: true } })

    await edit.click()

    await expect.element(input).toBeVisible()
    await expect.element(input).toHaveFocus()

    await userEvent.keyboard('New Value')

    expect(input.element()).toHaveValue('Default Value')
  })

  it('uses the proper styles when autoResize is true', async () => {
    const { input, preview, edit } = await setup({ editableProps: { defaultValue: 'Default Value', autoResize: true } })

    await expect.element(input).toHaveStyle({ visibility: 'hidden' })

    await edit.click()

    await expect.element(preview).toHaveStyle({ visibility: 'hidden' })
  })

  it('should prevent user input text more than given `maxLength`', async () => {
    const { input, edit } = await setup({ editableProps: { maxLength: 10 } })

    await edit.click()
    await expect.element(input).toHaveFocus()

    await userEvent.keyboard('lorem ipsum dolor sit amet')

    expect(input.element()).toHaveValue('lorem ipsu')
  })
})
