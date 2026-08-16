import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'
import { render } from 'vitest-browser-vue'
import { nextTick } from 'vue'
import { handleSubmit } from '@/test'
import { CheckboxRoot } from '.'
import Checkbox from './story/_Checkbox.vue'
import CheckboxGroup from './story/_CheckboxGroup.vue'

// The original's file-global ResizeObserver replacement is deliberately absent.
// It always reports a synthetic 0x0 box, but no Checkbox production path creates
// a ResizeObserver or calls useSize. It is therefore stale compensation rather
// than scenario construction; Chromium needs no replacement for it.

describe('given a default Checkbox', () => {
  it('should pass axe accessibility tests', async () => {
    const screen = await render(Checkbox)
    // The original also disabled `nested-interactive`, but the hidden input is
    // now a sibling of the button. Chromium exercises that rule against the
    // live control, so keeping the stale exclusion would only narrow the audit.
    expect(await axe(screen.container, {
      rules: {
        label: { enabled: false },
      },
    })).toHaveNoViolations()
  })

  it('should render checkbox', async () => {
    const screen = await render(Checkbox)
    expect(screen.container.firstElementChild).toBeTruthy()
  })

  describe('when clicking the checkbox', () => {
    let screen: Awaited<ReturnType<typeof render<typeof Checkbox>>>

    beforeEach(async () => {
      screen = await render(Checkbox)
      await screen.getByRole('checkbox', { name: 'Test' }).click()
    })

    it('should render a visible indicator', async () => {
      expect(screen.container.querySelector('[data-testid="test-indicator"]')).toBeTruthy()
    })

    describe('when clicking the checkbox again', () => {
      beforeEach(async () => {
        await screen.getByRole('checkbox', { name: 'Test' }).click()
      })

      it('should remove the indicator', async () => {
        expect(screen.container.querySelector('[data-testid="test-indicator"]')).toBe(null)
      })
    })
  })
})

describe('given a Checkbox with an explicit aria-label', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should not query the DOM for a label', async () => {
    const querySpy = vi.spyOn(document, 'querySelector')
    const screen = await render(CheckboxRoot, {
      attrs: { 'id': 'with-label', 'aria-label': 'Accept terms' },
    })
    const checkbox = screen.container.querySelector('button')

    expect(checkbox?.getAttribute('aria-label')).toBe('Accept terms')
    expect(querySpy).not.toHaveBeenCalledWith('[for="with-label"]')
  })

  it('should query for the associated label when no aria-label is given', async () => {
    const querySpy = vi.spyOn(document, 'querySelector')
    await render(CheckboxRoot, {
      attrs: { id: 'without-label' },
    })
    await nextTick()

    expect(querySpy).toHaveBeenCalledWith('[for="without-label"]')
  })
})

describe('given a required Checkbox', () => {
  let screen: Awaited<ReturnType<typeof render>>

  beforeEach(async () => {
    screen = await render({
      components: { Checkbox },
      template: '<form><Checkbox required /></form>',
    })
  })

  it('should have [aria-required] of "true"', () => {
    expect(screen.container.querySelector('button')?.getAttribute('aria-required')).toEqual('true')
    expect(screen.container.querySelector('input[type="checkbox"]')?.hasAttribute('required')).toBe(true)
  })
})

describe('given CheckboxGroup', () => {
  it('should pass axe accessibility tests', async () => {
    const screen = await render(CheckboxGroup)
    expect(await axe(screen.container, {
      rules: {
        label: { enabled: false },
      },
    })).toHaveNoViolations()
  })

  it('should render checkbox', async () => {
    const screen = await render(CheckboxGroup)
    expect(screen.container.firstElementChild).toBeTruthy()
  })

  describe('when clicking the checkbox', () => {
    let screen: Awaited<ReturnType<typeof render<typeof CheckboxGroup>>>

    beforeEach(async () => {
      screen = await render(CheckboxGroup)
      await screen.getByRole('checkbox', { name: 'jack' }).click()
    })

    it('should render a visible indicator', async () => {
      expect(screen.container.querySelector('#jack span')).toBeTruthy()
    })

    describe('when clicking the checkbox again', () => {
      beforeEach(async () => {
        await screen.getByRole('checkbox', { name: 'jack' }).click()
      })

      it('should remove the indicator', async () => {
        expect(screen.container.querySelector('#jack span')).toBe(null)
      })
    })

    describe('when clicking another checkbox', () => {
      beforeEach(async () => {
        await screen.getByRole('checkbox', { name: 'john' }).click()
      })

      it('should render 2 checkboxes', async () => {
        await expect.element(screen.getByRole('checkbox', { name: 'jack' })).toHaveAttribute('data-state', 'checked')
        await expect.element(screen.getByRole('checkbox', { name: 'john' })).toHaveAttribute('data-state', 'checked')
        await expect.element(screen.getByRole('checkbox', { name: 'mike' })).toHaveAttribute('data-state', 'unchecked')
      })
    })
  })
})

describe('given a disabled Checkbox', () => {
  let screen: Awaited<ReturnType<typeof render<typeof Checkbox>>>

  beforeEach(async () => {
    screen = await render(Checkbox, { props: { disabled: true } })
  })

  it('should have no accessibility violations', async () => {
    expect(await axe(screen.container, {
      rules: {
        label: { enabled: false },
      },
    })).toHaveNoViolations()
  })

  describe('when clicking the checkbox', () => {
    beforeEach(async () => {
      await screen.getByRole('checkbox', { name: 'Test' }).click({ force: true })
    })

    it('should not render a indicator', async () => {
      expect(screen.container.querySelector('[data-testid="test-indicator"]')).toBeFalsy()
      await expect.element(screen.getByRole('checkbox', { name: 'Test' })).toHaveAttribute('data-state', 'unchecked')
    })
  })
})

describe('given a disabled CheckboxGroup', () => {
  let screen: Awaited<ReturnType<typeof render<typeof CheckboxGroup>>>

  beforeEach(async () => {
    screen = await render(CheckboxGroup, { props: { disabled: true } })
  })

  it('should have no accessibility violations', async () => {
    expect(await axe(screen.container, {
      rules: {
        label: { enabled: false },
      },
    })).toHaveNoViolations()
  })

  describe('when clicking the checkboxGroup', () => {
    beforeEach(async () => {
      await screen.getByRole('checkbox', { name: 'jack' }).click({ force: true })
    })

    it('should not render a indicator', async () => {
      expect(screen.container.querySelector('#jack span')).toBeFalsy()
      expect(Array.from(screen.container.querySelectorAll('[role="checkbox"]'), checkbox => checkbox.getAttribute('data-state'))).toStrictEqual([
        'unchecked',
        'unchecked',
        'unchecked',
      ])
    })
  })
})

describe('given value as "indeterminate"', () => {
  let screen: Awaited<ReturnType<typeof render<typeof Checkbox>>>

  beforeEach(async () => {
    screen = await render(Checkbox, { props: { modelValue: 'indeterminate' } })
  })

  it('should have [data-state] of "indeterminate"', () => {
    expect(screen.container.querySelector('button')?.getAttribute('data-state')).toBe('indeterminate')
    expect(screen.container.querySelector('[data-testid="test-indicator"]')?.getAttribute('data-state')).toBe('indeterminate')
  })

  it('should still be clickable', async () => {
    await screen.getByRole('checkbox', { name: 'Test' }).click()
    await expect.element(screen.getByRole('checkbox', { name: 'Test' })).toHaveAttribute('data-state', 'checked')
  })
})

describe('given checkbox in a form', () => {
  let screen: Awaited<ReturnType<typeof render>>

  beforeEach(async () => {
    handleSubmit.mockClear()
    screen = await render({
      props: ['handleSubmit'],
      components: { Checkbox },
      template: '<form @submit="handleSubmit"><Checkbox value="true" /><button type="submit">Submit</button></form>',
    }, {
      props: { handleSubmit },
    })
  })

  it('should have hidden input field', async () => {
    expect(screen.container.querySelector('input[type="checkbox"]')).toBeTruthy()
  })

  it('should pass axe accessibility tests', async () => {
    expect(await axe(screen.container.firstElementChild!)).toHaveNoViolations()
  })

  it('should not nest the hidden input inside the interactive control', () => {
    expect(screen.container.querySelector('button input')).toBe(null)
  })

  describe('after clicking submit button', () => {
    beforeEach(async () => {
      const checkbox = screen.getByRole('checkbox', { name: 'Test' })
      await checkbox.click()
      await expect.element(checkbox).toHaveAttribute('data-state', 'checked')
      await screen.getByRole('button', { name: 'Submit' }).click()
    })

    it('should trigger submit once', () => {
      expect(handleSubmit).toHaveBeenCalledTimes(1)
      expect(handleSubmit.mock.results[0].value).toStrictEqual({ test: 'true' })
    })
  })

  describe('after uncheck and click submit button again', () => {
    beforeEach(async () => {
      const checkbox = screen.getByRole('checkbox', { name: 'Test' })
      await checkbox.click()
      await expect.element(checkbox).toHaveAttribute('data-state', 'checked')
      await screen.getByRole('button', { name: 'Submit' }).click()

      await checkbox.click()
      await expect.element(checkbox).toHaveAttribute('data-state', 'unchecked')
      await screen.getByRole('button', { name: 'Submit' }).click()
    })

    it('should trigger submit once', () => {
      expect(handleSubmit).toHaveBeenCalledTimes(2)
      expect(handleSubmit.mock.results[1].value).toStrictEqual({ })
    })
  })
})

describe('given checkboxGroup in a form', () => {
  let screen: Awaited<ReturnType<typeof render>>

  beforeEach(async () => {
    handleSubmit.mockClear()
    screen = await render({
      props: ['handleSubmit'],
      components: { CheckboxGroup },
      template: '<form @submit="handleSubmit"><CheckboxGroup name="test" /><button type="submit">Submit</button></form>',
    }, {
      props: { handleSubmit },
    })
  })

  it('should have hidden input field', async () => {
    const jack = screen.getByRole('checkbox', { name: 'jack' })
    await jack.click()
    await expect.element(jack).toHaveAttribute('data-state', 'checked')
    expect(screen.container.querySelector('input[data-hidden]')).toBeTruthy()
  })

  describe('after clicking submit button', () => {
    it('should trigger submit once', async () => {
      const jack = screen.getByRole('checkbox', { name: 'jack' })
      await jack.click()
      await expect.element(jack).toHaveAttribute('data-state', 'checked')
      await screen.getByRole('button', { name: 'Submit' }).click()

      const event = handleSubmit.mock.calls[0][0]
      const formData = new FormData(event.target)
      const submittedData = Object.fromEntries(formData as any)

      expect(handleSubmit).toHaveBeenCalledTimes(1)
      expect(submittedData).toStrictEqual({ 'test[0][name]': 'jack' })
    })
  })

  describe('after uncheck and click submit button again', () => {
    beforeEach(async () => {
      const jack = screen.getByRole('checkbox', { name: 'jack' })
      await jack.click()
      await expect.element(jack).toHaveAttribute('data-state', 'checked')
      await jack.click()
      await expect.element(jack).toHaveAttribute('data-state', 'unchecked')
      await screen.getByRole('button', { name: 'Submit' }).click()
    })

    it('should trigger submit once', () => {
      const event = handleSubmit.mock.calls[0][0]
      const formData = new FormData(event.target)
      const submittedData = Object.fromEntries(formData as any)

      expect(handleSubmit).toHaveBeenCalledTimes(1)
      expect(submittedData).toStrictEqual({ })
    })
  })
})
