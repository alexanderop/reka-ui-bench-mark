import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import NoScopeCheckbox from '@/Checkbox/story/_NoScopeCheckbox.vue'
import ScopedCheckbox from '@/Checkbox/story/_ScopedCheckbox.vue'
import ScopedRadioGroup from '@/RadioGroup/story/_ScopedRadioGroup.vue'
import ScopedToggleGroup from '@/ToggleGroup/story/_ScopedToggleGroup.vue'

function scopeIdOf(el: Element): string | undefined {
  return el.getAttributeNames().find(name => name.startsWith('data-v-'))
}

describe('useForwardScopeId', () => {
  // A multi-root component loses Vue's automatic parent scope-id fallthrough, which
  // would break consumer `<style scoped>` targeting the component's root. The forwarded
  // scope id must land on the interactive control so scoped styles keep working.
  it('forwards the parent scope id onto a multi-root component root', async () => {
    const screen = await render(ScopedCheckbox)

    const marker = screen.container.querySelector('.marker')!
    const button = screen.container.querySelector('button')!
    const parentScopeId = scopeIdOf(marker)

    expect(parentScopeId).toBeTruthy()
    expect(button.hasAttribute(parentScopeId!)).toBe(true)
  })

  // `RadioGroupItem` sets `inheritAttrs: false` and wraps the multi-root `Radio`, so the
  // parent scope id is dropped unless it is forwarded onto the inner control. (issue #2751)
  it('forwards the parent scope id through RadioGroupItem onto its control', async () => {
    const screen = await render(ScopedRadioGroup)

    const marker = screen.container.querySelector('.marker')!
    const button = screen.container.querySelector('button')!
    const parentScopeId = scopeIdOf(marker)

    expect(parentScopeId).toBeTruthy()
    expect(button.hasAttribute(parentScopeId!)).toBe(true)
  })

  // `ToggleGroupItem` wraps the multi-root `Toggle` the same way, so it has the same
  // scope-id-drop and must forward it too.
  it('forwards the parent scope id through ToggleGroupItem onto its control', async () => {
    const screen = await render(ScopedToggleGroup)

    const marker = screen.container.querySelector('.marker')!
    const button = screen.container.querySelector('button')!
    const parentScopeId = scopeIdOf(marker)

    expect(parentScopeId).toBeTruthy()
    expect(button.hasAttribute(parentScopeId!)).toBe(true)
  })

  // When the parent has no `<style scoped>`, `vnode.scopeId` is null and there is
  // nothing to forward — the control should carry no scope id. This is a no-op, not
  // a bug (a parent that doesn't scope its styles has no selector to apply).
  it('forwards nothing when the parent has no scoped styles', async () => {
    const screen = await render(NoScopeCheckbox)

    const button = screen.container.querySelector('button')!
    expect(scopeIdOf(button)).toBeUndefined()
  })
})
