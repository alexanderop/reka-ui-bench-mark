import { beforeEach, describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import { render } from 'vitest-browser-vue'
import Tooltip from './stories/_Tooltip.vue'
import { TOOLTIP_OPEN } from './utils'

describe('given default Tooltip', () => {
  let screen: Awaited<ReturnType<typeof render>>
  beforeEach(async () => { screen = await render(Tooltip) })

  it('should pass axe accessibility tests', async () => {
    expect(await axe(screen.container.firstElementChild as HTMLElement)).toHaveNoViolations()
    screen.getByRole('button').element().focus()
    await expect.element(screen.getByText('Add to library', { exact: true })).toBeInTheDocument()
    expect(await axe(document.body)).toHaveNoViolations()
  })

  it('should open when focus', async () => {
    screen.getByRole('button').element().focus()
    await expect.element(screen.getByText('Add to library', { exact: true })).toBeInTheDocument()
  })

  describe('after focusing out', () => {
    beforeEach(() => { document.body.focus() })
    it('should close the tooltip', async () => {
      await expect.element(screen.getByText('Add to library', { exact: true })).not.toBeInTheDocument()
    })
  })

  describe('disabled tooltip', () => {
    it('should not be open when focus', async () => {
      await screen.rerender({ disabled: true })
      screen.getByRole('button').element().focus()
      await expect.element(screen.getByText('Add to library', { exact: true })).not.toBeInTheDocument()
    })
  })

  it('should close when another tooltip broadcasts that it opened', async () => {
    screen.getByRole('button').element().focus()
    await expect.element(screen.getByText('Add to library', { exact: true })).toBeInTheDocument()
    document.dispatchEvent(new CustomEvent(TOOLTIP_OPEN))
    await expect.element(screen.getByText('Add to library', { exact: true })).not.toBeInTheDocument()
  })
})

describe('given tooltip within TooltipProvider', () => {
  let screen: Awaited<ReturnType<typeof render>>
  beforeEach(async () => { screen = await render(Tooltip) })

  it('should use the provider content values', async () => {
    screen.container.style.padding = '200px'
    screen.getByRole('button').element().focus()
    await expect.element(screen.getByText('Add to library', { exact: true })).toBeInTheDocument()
    let content = document.querySelector<HTMLElement>('[data-dismissable-layer]')
    expect(content).toBeTruthy()
    await expect.element(content!).toHaveAttribute('data-side', 'top')
    await screen.rerender({ tooltipProvider: { content: { side: 'left' } } })
    content = document.querySelector<HTMLElement>('[data-dismissable-layer]')
    expect(content).toBeTruthy()
    await expect.element(content!).toHaveAttribute('data-side', 'left')
  })
})
