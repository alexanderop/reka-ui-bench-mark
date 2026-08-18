import { beforeEach, describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import { render } from 'vitest-browser-vue'
import Avatar from './story/_Avatar.vue'

const FALLBACK = 'CT'
const DELAY = 350

const ImgClass = class MockImage {
  onload: () => void = () => {}
  src = ''
  eventListeners: Record<string, Array<() => void>> = {}

  constructor() {
    setTimeout(() => {
      this.onload()
      this.eventListeners.load?.forEach(callback => callback())
    }, DELAY)
    return this
  }

  addEventListener(event: string, callback: () => void) {
    this.eventListeners[event] ??= []
    this.eventListeners[event].push(callback)
  }

  removeEventListener(event: string, callback: () => void) {
    this.eventListeners[event] = this.eventListeners[event]?.filter(cb => cb !== callback) ?? []
  }
}

it('should pass axe accessibility tests', async () => {
  const screen = await render(Avatar)
  expect(await axe(screen.container.firstElementChild as HTMLElement)).toHaveNoViolations()
})

describe('given an Avatar with fallback and a working image', async () => {
  let screen: Awaited<ReturnType<typeof render>>

  beforeEach(async () => {
    window.Image = ImgClass as unknown as typeof Image
    screen = await render(Avatar)
  })

  it('should render the fallback initially', async () => {
    await expect.element(screen.getByText(FALLBACK, { exact: true })).toBeInTheDocument()
  })

  it('should render the image, but show `display:none` initially', async () => {
    const image = screen.container.querySelector('img')
    expect(image).toBeTruthy()
    expect(image).toHaveStyle({ display: 'none' })
  })

  it('should have alt text on the image', async () => {
    await expect.element(screen.getByAltText('Colm Tuite')).toBeInTheDocument()
  })

  it('should match before image loaded snapshot', () => {
    expect(screen.container.innerHTML).toMatchSnapshot()
  })

  it('should match after image loaded snapshot', async () => {
    await expect.element(screen.getByText(FALLBACK, { exact: true })).not.toBeInTheDocument()
    expect(screen.container.innerHTML).toMatchSnapshot()
  })
})

describe('given an Avatar with fallback and delayed render', () => {
  let screen: Awaited<ReturnType<typeof render>>

  beforeEach(async () => {
    window.Image = ImgClass as unknown as typeof Image
    screen = await render(Avatar, { props: { delay: 300 } })
  })

  it('should not render a fallback immediately', async () => {
    expect(screen.container.textContent).not.toContain(FALLBACK)
  })

  it('should render a fallback after the delay', async () => {
    expect(screen.container.textContent).not.toContain(FALLBACK)
    const fallback = screen.getByText(FALLBACK, { exact: true })
    await expect.element(fallback).toBeInTheDocument()
    expect(screen.container).toContain(fallback.element())
  })
})
