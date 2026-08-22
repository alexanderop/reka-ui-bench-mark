import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page, userEvent } from 'vitest/browser'
import { defineComponent, h, ref } from 'vue'
import { TabsIndicator, TabsList, TabsRoot, TabsTrigger } from '.'

const horizontalIndicatorStyle = {
  position: 'absolute',
  left: '0',
  bottom: '0',
  height: '2px',
  width: 'var(--reka-tabs-indicator-size)',
  transform: 'translateX(var(--reka-tabs-indicator-position))',
}

const verticalIndicatorStyle = {
  position: 'absolute',
  right: '0',
  top: '0',
  width: '2px',
  height: 'var(--reka-tabs-indicator-size)',
  transform: 'translateY(var(--reka-tabs-indicator-position))',
}

function makeTabsFixture(orientation: 'horizontal' | 'vertical', defaultValue = 'first') {
  return defineComponent({
    setup() {
      const firstSize = ref(80)
      const secondSize = ref(100)

      const triggerStyle = (size: number) => orientation === 'horizontal'
        ? { width: `${size}px`, height: '40px', flex: 'none', padding: '0', border: '0' }
        : { width: '60px', height: `${size}px`, flex: 'none', padding: '0', border: '0' }

      return () => h('div', [
        h(TabsRoot, { defaultValue, orientation }, () => [
          h(TabsList, {
            style: orientation === 'horizontal'
              ? { position: 'relative', display: 'flex', width: '320px', height: '40px' }
              : { position: 'relative', display: 'flex', flexDirection: 'column', width: '60px', height: '320px' },
          }, () => [
            h(TabsIndicator, {
              'data-testid': 'indicator',
              'style': orientation === 'horizontal' ? horizontalIndicatorStyle : verticalIndicatorStyle,
            }),
            h(TabsTrigger, { value: 'first', style: triggerStyle(firstSize.value) }, () => 'First'),
            h(TabsTrigger, { value: 'second', style: triggerStyle(secondSize.value) }, () => 'Second'),
          ]),
        ]),
        h('button', {
          type: 'button',
          onClick: () => {
            firstSize.value = 140
            secondSize.value = 150
          },
        }, 'Resize tabs'),
      ])
    },
  })
}

function cssNumber(element: HTMLElement, name: string) {
  return Number.parseFloat(getComputedStyle(element).getPropertyValue(name))
}

async function expectIndicatorToMatch(
  container: HTMLElement,
  tabName: 'First' | 'Second',
  orientation: 'horizontal' | 'vertical',
) {
  const tab = page.elementLocator(container).getByRole('tab', { name: tabName })
  const indicator = page.elementLocator(container).getByTestId('indicator')

  await expect.element(indicator).toBeVisible()
  await expect.poll(() => {
    const tabElement = tab.element() as HTMLElement
    const indicatorElement = indicator.element() as HTMLElement
    return {
      size: cssNumber(indicatorElement, '--reka-tabs-indicator-size'),
      thickness: cssNumber(indicatorElement, '--reka-tabs-indicator-thickness'),
      position: cssNumber(indicatorElement, '--reka-tabs-indicator-position'),
    }
  }).toEqual(orientation === 'horizontal'
    ? {
        size: (tab.element() as HTMLElement).offsetWidth,
        thickness: (tab.element() as HTMLElement).offsetHeight,
        position: (tab.element() as HTMLElement).offsetLeft,
      }
    : {
        size: (tab.element() as HTMLElement).offsetHeight,
        thickness: (tab.element() as HTMLElement).offsetWidth,
        position: (tab.element() as HTMLElement).offsetTop,
      })

  await expect.poll(() => {
    const tabRect = (tab.element() as HTMLElement).getBoundingClientRect()
    const indicatorRect = (indicator.element() as HTMLElement).getBoundingClientRect()
    return orientation === 'horizontal'
      ? [Math.round(indicatorRect.left), Math.round(indicatorRect.width)]
      : [Math.round(indicatorRect.top), Math.round(indicatorRect.height)]
  }).toEqual(orientation === 'horizontal'
    ? [
        Math.round((tab.element() as HTMLElement).getBoundingClientRect().left),
        Math.round((tab.element() as HTMLElement).getBoundingClientRect().width),
      ]
    : [
        Math.round((tab.element() as HTMLElement).getBoundingClientRect().top),
        Math.round((tab.element() as HTMLElement).getBoundingClientRect().height),
      ])
}

describe('tabs indicator browser geometry', () => {
  it('tracks the selected horizontal tab after real pointer and keyboard selection', async () => {
    const screen = await render(makeTabsFixture('horizontal'))
    const scopedPage = page.elementLocator(screen.container)

    await expectIndicatorToMatch(screen.container, 'First', 'horizontal')

    await scopedPage.getByRole('tab', { name: 'Second' }).click()
    await expect.element(scopedPage.getByRole('tab', { name: 'Second', selected: true })).toBeVisible()
    await expectIndicatorToMatch(screen.container, 'Second', 'horizontal')

    await userEvent.keyboard('{ArrowLeft}')
    await expect.element(scopedPage.getByRole('tab', { name: 'First', selected: true })).toBeVisible()
    await expectIndicatorToMatch(screen.container, 'First', 'horizontal')
  })

  it('tracks vertical tab geometry', async () => {
    const screen = await render(makeTabsFixture('vertical'))
    const scopedPage = page.elementLocator(screen.container)

    await expectIndicatorToMatch(screen.container, 'First', 'vertical')
    await scopedPage.getByRole('tab', { name: 'Second' }).click()
    await expectIndicatorToMatch(screen.container, 'Second', 'vertical')
  })

  it('reacts to real ResizeObserver measurements when tabs change size', async () => {
    const screen = await render(makeTabsFixture('horizontal', 'second'))
    const scopedPage = page.elementLocator(screen.container)
    const secondTab = scopedPage.getByRole('tab', { name: 'Second' })

    await expectIndicatorToMatch(screen.container, 'Second', 'horizontal')
    expect((secondTab.element() as HTMLElement).offsetLeft).toBe(80)
    expect((secondTab.element() as HTMLElement).offsetWidth).toBe(100)

    await scopedPage.getByRole('button', { name: 'Resize tabs' }).click()

    await expect.poll(() => (secondTab.element() as HTMLElement).offsetLeft).toBe(140)
    await expect.poll(() => (secondTab.element() as HTMLElement).offsetWidth).toBe(150)
    await expectIndicatorToMatch(screen.container, 'Second', 'horizontal')
  })
})
