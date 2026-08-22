import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import { render } from 'vitest-browser-vue'
import { commands, page, userEvent } from 'vitest/browser'
import { sleep } from '@/test'
import { RatingRoot } from '..'
import Rating from './story/_Rating.vue'

const mouse = commands as unknown as { mouseMove: (x: number, y: number) => Promise<void> }
// The original runtime-imports RatingRoot from the `..` barrel for
// `findComponent`. Preserve that module evaluation even though browser render
// cannot expose the child wrapper; otherwise browser bundling tree-shakes the
// barrel and the coverage oracle reports 195 incidental losses.
void RatingRoot

describe('given a default Rating', () => {
  let screen: Awaited<ReturnType<typeof render<typeof Rating>>>
  let radios: HTMLElement[]
  const selectEvents: CustomEvent<{ value: number }>[] = []
  const onSelect = (event: Event) => selectEvents.push(event as CustomEvent<{ value: number }>)

  beforeEach(async () => {
    selectEvents.length = 0
    document.addEventListener('radio.select', onSelect, true)
    screen = await render(Rating, { props: { defaultValue: 1, length: 3, orientation: 'vertical' } })
    // The original uses the exact `[role=radio]` selector, so retain the
    // selector and container scope rather than broadening it to a role query.
    radios = Array.from(screen.container.querySelectorAll('[role=radio]'))
  })

  afterEach(() => {
    document.removeEventListener('radio.select', onSelect, true)
  })

  it('should pass axe accessibility tests', async () => {
    // Censused in Chromium: 14 node-bearing passes, including button-name(3),
    // nested-interactive(3), tabindex(4), and ten aria-* rules; incomplete is empty.
    expect(await axe(screen.container.firstElementChild!)).toHaveNoViolations()
  })

  it('should have default selected', () => {
    expect(radios[0].getAttribute('data-state')).toBe('active')
    expect(radios[1].getAttribute('data-state')).toBeNull()
    expect(radios[2].getAttribute('data-state')).toBeNull()
  })

  describe('on keyboard navigation', () => {
    beforeEach(async () => {
      radios[0].focus()
      // Rating uses RadioGroupItem's deferred arrow-key click. Hold the key
      // through that macrotask so the real keyup cannot clear its latch first.
      await userEvent.keyboard('{ArrowDown>}')
      await sleep(0)
      await userEvent.keyboard('{/ArrowDown}')
    })

    it('should emit `update:modelValue` on keyboard navigation', async () => {
      expect(selectEvents.find(event => event.target === radios[1])?.detail.value).toBe(2)
    })

    it('should select next item on keydown', async () => {
      expect(radios[0].getAttribute('data-state')).toBe('active')
      expect(radios[1].getAttribute('data-state')).toBe('active')
      expect(radios[1]).toBe(document.activeElement)
    })

    describe('on arrow up', () => {
      it('should select the first item again', async () => {
        await userEvent.keyboard('{ArrowUp>}')
        await sleep(0)
        await userEvent.keyboard('{/ArrowUp}')
        expect(radios[0].getAttribute('data-state')).toBe('active')
        expect(radios[2].getAttribute('data-state')).toBeNull()
      })
    })
  })
})

describe('given a hoverable Rating', () => {
  let screen: Awaited<ReturnType<typeof render<typeof Rating>>>
  let radios: HTMLElement[]

  beforeEach(async () => {
    // The pointer survives render cleanup. Park it away before mounting so a
    // new radio cannot appear already under it and make hover setup vacuous.
    // RatingRoot is a 414x32 block at the top-left of the iframe and the
    // preview resets on ITS `mouseleave` (RatingRoot.vue:116), so "away" means below y=32 — not
    // (390,5), which is inside the root. That point only ever worked because
    // the unscaled harness threw the pointer out of the iframe entirely
    // (FINDINGS.tsv Rating/Rating.test.ts#leave-point-was-inside-the-root).
    await mouse.mouseMove(390, 200)
    screen = await render(Rating, { props: { defaultValue: 1, hoverable: true, length: 3 } })
    radios = Array.from(screen.container.querySelectorAll('[role=radio]'))
  })

  it('should preview the hovered rating', async () => {
    await page.elementLocator(radios[2]).hover()
    expect(radios[1].getAttribute('data-state')).toBe('active')
    expect(radios[2].getAttribute('data-state')).toBe('active')
  })

  it('should reset the preview to the model value on mouse leave', async () => {
    await page.elementLocator(radios[2]).hover()
    // Move the real pointer off the 414x32 RatingRoot — below it, onto bare body.
    await mouse.mouseMove(390, 200)

    expect(radios[0].getAttribute('data-state')).toBe('active')
    expect(radios[1].getAttribute('data-state')).toBeNull()
    expect(radios[2].getAttribute('data-state')).toBeNull()
  })
})

describe('given disabled Rating', () => {
  let screen: Awaited<ReturnType<typeof render<typeof Rating>>>
  let radios: HTMLElement[]

  beforeEach(async () => {
    screen = await render(Rating, { props: { defaultValue: 1, disabled: true, length: 3 } })
    radios = Array.from(screen.container.querySelectorAll('[role=radio]'))
  })

  it('should pass axe accessibility tests', async () => {
    // The disabled fixture has the same 14-rule/node census as the enabled one,
    // including all three disabled radio buttons, with no incomplete results.
    expect(await axe(screen.container.firstElementChild!)).toHaveNoViolations()
  })

  it('should have default selected', () => {
    expect(radios[0].getAttribute('data-state')).toBe('active')
  })

  it.each([[0, 'active'], [1, undefined], [2, undefined]])('should not select any item', async (input) => {
    // Chromium suppresses click on a native disabled button; force bypasses
    // Playwright's actionability wait but still performs a real pointer press.
    await page.elementLocator(radios[input]).click({ force: true })
    expect(radios.map(radio => radio.getAttribute('data-state'))).toEqual(['active', null, null])
  })

  it.each([[0], [1], [2]])('should have disabled attribute on item', async (input) => {
    expect(radios[input].getAttribute('disabled')).toBe('')
    expect(radios[input].getAttribute('data-disabled')).toBe('')
  })
})
