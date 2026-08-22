import type { Component } from 'vue'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page, userEvent } from 'vitest/browser'
import { defineComponent } from 'vue'
import {
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteRoot,
} from '@/Autocomplete'
import {
  CheckboxGroupRoot,
  CheckboxRoot,
} from '@/Checkbox'
import {
  ComboboxInput,
  ComboboxItem,
  ComboboxRoot,
} from '@/Combobox'
import DateField from '@/DateField/story/_DateField.vue'
import DatePicker from '@/DatePicker/story/_DatePicker.vue'
import DateRangeField from '@/DateRangeField/story/_DateRangeField.vue'
import DateRangePicker from '@/DateRangePicker/story/_DateRangePicker.vue'
import { EditableArea, EditableInput, EditablePreview, EditableRoot } from '@/Editable'
import { ListboxItem, ListboxRoot } from '@/Listbox'
import NumberField from '@/NumberField/story/_NumberField.vue'
import PinInput from '@/PinInput/story/_PinInput.vue'
import { RadioGroupItem, RadioGroupRoot } from '@/RadioGroup'
import Select from '@/Select/story/_SelectTest.vue'
import { SwitchRoot } from '@/Switch'
import { TagsInputInput, TagsInputRoot } from '@/TagsInput'
import TimeField from '@/TimeField/story/_TimeField.vue'
import TimeRangeField from '@/TimeRangeField/story/_TimeRangeField.vue'
import { Toggle } from '@/Toggle'
import { ToggleGroupItem, ToggleGroupRoot } from '@/ToggleGroup'

type Rendered = Awaited<ReturnType<typeof render>>
type NativeControl = HTMLInputElement | HTMLSelectElement

function formHarness(Subject: Component, subjectProps: Record<string, unknown> = {}) {
  return defineComponent({
    components: { Subject },
    setup: () => ({ subjectProps }),
    data: () => ({ submissions: 0 }),
    template: `
    <form @submit.prevent="submissions++">
      <Subject v-bind="subjectProps" />
      <button type="button" data-testid="outside-interaction">Outside interaction</button>
      <button type="submit">Submit form</button>
      <output data-testid="submissions">{{ submissions }}</output>
    </form>
  `,
  })
}

function requiredControl(screen: Rendered): NativeControl {
  const control = screen.container.querySelector<NativeControl>('form input[required], form select[required]')
  if (!control)
    throw new Error('Expected the component to render a required native form control')
  return control
}

function hasSubmittedValue(control: NativeControl) {
  if (control instanceof HTMLInputElement && (control.type === 'checkbox' || control.type === 'radio'))
    return control.checked
  return control.value !== ''
}

async function assertRequiredSubmission(
  Subject: Component,
  interact: (screen: Rendered, scope: ReturnType<typeof page.elementLocator>) => Promise<void>,
  subjectProps: Record<string, unknown> = {},
) {
  const screen = await render(formHarness(Subject, subjectProps))
  const scope = page.elementLocator(screen.container)
  const submit = scope.getByRole('button', { name: 'Submit form', exact: true })
  const submissions = scope.getByTestId('submissions')
  const emptyControl = requiredControl(screen)

  expect(emptyControl.checkValidity()).toBe(false)
  expect(emptyControl.validity.valueMissing).toBe(true)

  // A real submit-button activation invokes Chromium's constraint-validation
  // algorithm. No submit event is synthesized: the invalid native control
  // must prevent the form's submit handler from running.
  await submit.click()
  await expect.element(submissions).toHaveTextContent('0')

  await interact(screen, scope)

  await expect.poll(() => requiredControl(screen).checkValidity()).toBe(true)
  const populatedControl = requiredControl(screen)
  expect(populatedControl.validity.valueMissing).toBe(false)
  expect(hasSubmittedValue(populatedControl)).toBe(true)
  expect(new FormData(populatedControl.form!).getAll(populatedControl.name).length).toBeGreaterThan(0)

  await submit.click()
  await expect.element(submissions).toHaveTextContent('1')
}

const ToggleFixture = defineComponent({
  components: { Toggle },
  template: '<Toggle name="toggle" required>Notifications</Toggle>',
})

const ToggleGroupFixture = defineComponent({
  components: { ToggleGroupItem, ToggleGroupRoot },
  template: `
    <ToggleGroupRoot type="single" name="alignment" required aria-label="Alignment">
      <ToggleGroupItem value="left">Left</ToggleGroupItem>
      <ToggleGroupItem value="right">Right</ToggleGroupItem>
    </ToggleGroupRoot>
  `,
})

const CheckboxFixture = defineComponent({
  components: { CheckboxRoot },
  template: '<CheckboxRoot name="terms" value="accepted" required aria-label="Accept terms" style="width: 32px; height: 32px">Accept terms</CheckboxRoot>',
})

const CheckboxGroupFixture = defineComponent({
  components: { CheckboxGroupRoot, CheckboxRoot },
  template: `
    <CheckboxGroupRoot name="topics" required aria-label="Topics">
      <CheckboxRoot value="browser">Browser</CheckboxRoot>
      <CheckboxRoot value="accessibility">Accessibility</CheckboxRoot>
    </CheckboxGroupRoot>
  `,
})

const SwitchFixture = defineComponent({
  components: { SwitchRoot },
  template: '<SwitchRoot name="airplane" value="enabled" required aria-label="Airplane mode" style="width: 32px; height: 32px">Airplane mode</SwitchRoot>',
})

const RadioGroupFixture = defineComponent({
  components: { RadioGroupItem, RadioGroupRoot },
  template: `
    <RadioGroupRoot name="density" required aria-label="Density">
      <RadioGroupItem value="comfortable" aria-label="Comfortable" style="width: 32px; height: 32px">Comfortable</RadioGroupItem>
      <RadioGroupItem value="compact" aria-label="Compact" style="width: 32px; height: 32px">Compact</RadioGroupItem>
    </RadioGroupRoot>
  `,
})

const ListboxFixture = defineComponent({
  components: { ListboxItem, ListboxRoot },
  template: `
    <ListboxRoot name="country" required aria-label="Country">
      <ListboxItem value="Germany">Germany</ListboxItem>
      <ListboxItem value="France">France</ListboxItem>
    </ListboxRoot>
  `,
})

const AutocompleteFixture = defineComponent({
  components: { AutocompleteInput, AutocompleteItem, AutocompleteRoot },
  template: `
    <AutocompleteRoot name="fruit" required>
      <AutocompleteInput aria-label="Fruit" />
      <AutocompleteItem value="Apple">Apple</AutocompleteItem>
      <AutocompleteItem value="Banana">Banana</AutocompleteItem>
    </AutocompleteRoot>
  `,
})

const ComboboxFixture = defineComponent({
  components: { ComboboxInput, ComboboxItem, ComboboxRoot },
  template: `
    <ComboboxRoot name="fruit" required>
      <ComboboxInput aria-label="Fruit" />
      <ComboboxItem value="Apple">Apple</ComboboxItem>
      <ComboboxItem value="Banana">Banana</ComboboxItem>
    </ComboboxRoot>
  `,
})

const TagsInputFixture = defineComponent({
  components: { TagsInputInput, TagsInputRoot },
  template: `
    <TagsInputRoot name="tags" required>
      <TagsInputInput aria-label="Tags" />
    </TagsInputRoot>
  `,
})

const EditableFixture = defineComponent({
  components: { EditableArea, EditableInput, EditablePreview, EditableRoot },
  template: `
    <EditableRoot name="title" required activation-mode="focus">
      <EditableArea>
        <EditablePreview data-testid="editable-preview">Empty title</EditablePreview>
        <EditableInput />
      </EditableArea>
    </EditableRoot>
  `,
})

describe('native required-form validation', () => {
  // Production inventory, grouped by the native bridge each root renders:
  // - checkbox input: Toggle, CheckboxRoot, SwitchRoot
  // - scalar/array VisuallyHiddenInput: ToggleGroupRoot, CheckboxGroupRoot,
  //   RadioGroupRoot, ListboxRoot (and therefore AutocompleteRoot and
  //   ComboboxRoot), TagsInputRoot, NumberFieldRoot, EditableRoot
  // - focusable hidden input: PinInputRoot, DateFieldRoot, DateRangeFieldRoot,
  //   TimeFieldRoot, TimeRangeFieldRoot
  // - native select: SelectRoot
  // DatePickerField and DateRangePickerField compose the corresponding date
  // roots; their public picker fixtures are covered as separate integration
  // contracts without duplicating every segment permutation.
  // SliderRoot, ColorAreaRoot, ColorSliderRoot, and ColorFieldRoot also render
  // required native inputs, but their public models always have a valid
  // non-empty default. They have no empty required state to transition from,
  // so they are intentionally outside this empty -> populated contract.

  it('validates Toggle through its checkbox bridge', async () => {
    await assertRequiredSubmission(ToggleFixture, async (_screen, scope) =>
      scope.getByRole('button', { name: 'Notifications', exact: true }).click())
  })

  it('validates ToggleGroup through its scalar bridge', async () => {
    await assertRequiredSubmission(ToggleGroupFixture, async (_screen, scope) =>
      scope.getByRole('button', { name: 'Left', exact: true }).click())
  })

  it('validates Checkbox through its checkbox bridge', async () => {
    await assertRequiredSubmission(CheckboxFixture, async (_screen, scope) =>
      scope.getByRole('checkbox', { name: 'Accept terms', exact: true }).click())
  })

  it('validates CheckboxGroup through its array bridge', async () => {
    await assertRequiredSubmission(CheckboxGroupFixture, async (_screen, scope) =>
      scope.getByRole('checkbox', { name: 'Browser', exact: true }).click())
  })

  it('validates Switch through its checkbox bridge', async () => {
    await assertRequiredSubmission(SwitchFixture, async (_screen, scope) =>
      scope.getByRole('switch', { name: 'Airplane mode', exact: true }).click())
  })

  it('validates RadioGroup through its scalar bridge', async () => {
    await assertRequiredSubmission(RadioGroupFixture, async (_screen, scope) =>
      scope.getByRole('radio', { name: 'Comfortable', exact: true }).click())
  })

  it('validates Listbox through its scalar bridge', async () => {
    await assertRequiredSubmission(ListboxFixture, async (_screen, scope) =>
      scope.getByRole('option', { name: 'Germany', exact: true }).click())
  })

  it('validates Autocomplete through its Listbox bridge', async () => {
    await assertRequiredSubmission(AutocompleteFixture, async (_screen, scope) => {
      await scope.getByRole('combobox', { name: 'Fruit', exact: true }).click()
      await scope.getByRole('option', { name: 'Apple', exact: true }).click()
    })
  })

  it('validates Combobox through its Listbox bridge', async () => {
    await assertRequiredSubmission(ComboboxFixture, async (_screen, scope) => {
      await scope.getByRole('combobox', { name: 'Fruit', exact: true }).click()
      await scope.getByRole('option', { name: 'Apple', exact: true }).click()
    })
  })

  it('validates Select through its native select bridge', async () => {
    await assertRequiredSubmission(Select, async (_screen, scope) => {
      await scope.getByRole('combobox', { name: 'Customise options', exact: true }).click()
      await scope.getByRole('option', { name: 'Apple', exact: true }).click()
    }, { required: true })
  })

  it('validates TagsInput through its array bridge', async () => {
    await assertRequiredSubmission(TagsInputFixture, async (_screen, scope) => {
      await scope.getByRole('textbox', { name: 'Tags', exact: true }).fill('browser')
      await userEvent.keyboard('{Enter}')
    })
  })

  it('validates NumberField through its scalar bridge', async () => {
    await assertRequiredSubmission(NumberField, async (_screen, scope) => {
      await scope.getByTestId('input').fill('42')
      await userEvent.tab()
    }, { name: 'quantity', required: true })
  })

  it('validates PinInput through its focusable input bridge', async () => {
    await assertRequiredSubmission(PinInput, async (_screen, scope) => {
      await scope.getByRole('textbox').first().click()
      await userEvent.keyboard('12345')
    }, { name: 'pin', required: true })
  })

  it('validates Editable through its scalar bridge', async () => {
    await assertRequiredSubmission(EditableFixture, async (_screen, scope) => {
      await scope.getByTestId('editable-preview').click()
      await scope.getByRole('textbox', { name: 'editable input', exact: true }).fill('Browser mode')
      await scope.getByTestId('outside-interaction').click()
    })
  })

  it('validates DateField through its focusable native date input', async () => {
    await assertRequiredSubmission(DateField, async (_screen, scope) => {
      await scope.getByTestId('month').click()
      await userEvent.keyboard('2')
      await userEvent.keyboard('20')
      await userEvent.keyboard('2024')
    }, { dateFieldProps: { name: 'date', required: true } })
  })

  it('validates DateRangeField through its focusable native date input', async () => {
    await assertRequiredSubmission(DateRangeField, async (_screen, scope) => {
      await scope.getByTestId('start-month').click()
      await userEvent.keyboard('2')
      await userEvent.keyboard('20')
      await userEvent.keyboard('2024')
      await userEvent.keyboard('3')
      await userEvent.keyboard('20')
      await userEvent.keyboard('2024')
    }, { dateFieldProps: { name: 'date-range', required: true } })
  })

  it('validates DatePicker through its composed DateField native input', async () => {
    await assertRequiredSubmission(DatePicker, async (_screen, scope) => {
      await scope.getByTestId('month').click()
      await userEvent.keyboard('2')
      await userEvent.keyboard('20')
      await userEvent.keyboard('2024')
    }, { datePickerProps: { granularity: 'day', name: 'picked-date', required: true } })
  })

  it('validates DateRangePicker through its composed DateRangeField native input', async () => {
    await assertRequiredSubmission(DateRangePicker, async (_screen, scope) => {
      await scope.getByTestId('start-month').click()
      await userEvent.keyboard('2')
      await userEvent.keyboard('20')
      await userEvent.keyboard('2024')
      await userEvent.keyboard('3')
      await userEvent.keyboard('20')
      await userEvent.keyboard('2024')
    }, { dateFieldProps: { name: 'picked-range', required: true } })
  })

  it('validates TimeField through its focusable native time input', async () => {
    await assertRequiredSubmission(TimeField, async (_screen, scope) => {
      await scope.getByTestId('hour').click()
      await userEvent.keyboard('9')
      await userEvent.keyboard('30')
    }, { timeFieldProps: { hourCycle: 24, name: 'time', required: true } })
  })

  it('validates TimeRangeField through its focusable native time input', async () => {
    await assertRequiredSubmission(TimeRangeField, async (_screen, scope) => {
      await scope.getByTestId('start-hour').click()
      await userEvent.keyboard('9')
      await userEvent.keyboard('30')
      await userEvent.keyboard('10')
      await userEvent.keyboard('30')
    }, { timeRangeFieldProps: { hourCycle: 24, name: 'time-range', required: true } })
  })
})
