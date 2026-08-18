import { beforeEach, describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import { render } from 'vitest-browser-vue'
import { AspectRatio } from '.'

describe('given a default AspectRatio', async () => {
  let screen: Awaited<ReturnType<typeof render>>

  beforeEach(async () => {
    screen = await render(AspectRatio, {
      slots: {
        default: `<img
        class="h-full w-full object-cover"
        src="https://images.unsplash.com/photo-1498855926480-d98e83099315?w=300&dpr=2&q=80"
        alt="Landscape photograph by Tobias Tullius"
      >`,
      },
    })
  })

  it('should pass axe accessibility tests', async () => {
    expect(await axe(screen.container.firstElementChild as HTMLElement)).toHaveNoViolations()
  })

  it('should render as snapshot', () => {
    expect(screen.container.innerHTML).toMatchSnapshot()
  })
})
