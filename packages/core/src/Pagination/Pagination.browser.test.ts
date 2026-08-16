import { beforeEach, describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import { render } from 'vitest-browser-vue'
import Pagination from './story/_Pagination.vue'

type PaginationScreen = Awaited<ReturnType<typeof render<typeof Pagination>>>

function byLabel(screen: PaginationScreen, label: string) {
  return screen.getByLabelText(label, { exact: true })
}

function selectedLabel(screen: PaginationScreen) {
  return screen.container.querySelector('[data-selected="true"]')?.getAttribute('aria-label')
}

describe('given default Pagination', () => {
  let screen: PaginationScreen

  beforeEach(async () => {
    screen = await render(Pagination)
  })

  it('should pass axe accessibility tests', async () => {
    // Not vacuous: both environments evaluate `button-name` on all nine
    // controls, and removing their labels/content produces nine violations.
    // Chromium additionally evaluates `color-contrast` on seven text nodes;
    // jsdom reports that rule incomplete with zero nodes.
    expect(await axe(screen.container.firstElementChild!)).toHaveNoViolations()
  })

  it('should have first page selected by default', async () => {
    await expect.element(byLabel(screen, 'Page 1')).toHaveAttribute('data-selected', 'true')
    await expect.element(byLabel(screen, 'Page 2')).not.toHaveAttribute('data-selected')
  })

  describe('after clicking on Next Page trigger', () => {
    beforeEach(async () => {
      await byLabel(screen, 'Next Page').click()
    })

    it('should have set to page 2', async () => {
      await expect.element(byLabel(screen, 'Page 1')).not.toHaveAttribute('data-selected')
      await expect.element(byLabel(screen, 'Page 2')).toHaveAttribute('data-selected', 'true')
    })
  })

  describe('after clicking on Page 3 trigger', () => {
    beforeEach(async () => {
      await byLabel(screen, 'Page 3').click()
    })

    it('should have set to page 2', async () => {
      await expect.element(byLabel(screen, 'Page 1')).not.toHaveAttribute('data-selected')
      await expect.element(byLabel(screen, 'Page 3')).toHaveAttribute('data-selected', 'true')
    })
  })

  describe('after clicking on Last Page trigger', () => {
    beforeEach(async () => {
      await byLabel(screen, 'Last Page').click()
    })

    it('should have set to page 10', async () => {
      // first page will be hidden
      await expect.element(byLabel(screen, 'Page 1')).not.toBeInTheDocument()
      await expect.element(byLabel(screen, 'Page 10')).toHaveAttribute('data-selected', 'true')
    })
  })
})

const ALL_PAGINATION_BUTTONS_AS_A_PROPS = {
  first: { as: 'a' },
  prev: { as: 'a' },
  listItem: { as: 'a' },
  next: { as: 'a' },
  last: { as: 'a' },
}

describe('given Pagination with <a> as buttons', () => {
  let screen: PaginationScreen

  beforeEach(async () => {
    screen = await render(Pagination, { props: { ...ALL_PAGINATION_BUTTONS_AS_A_PROPS } })
  })

  it('should pass axe accessibility tests', async () => {
    // All nine `<a>` elements lack `href`, role, and tabindex. Axe records
    // `aria-prohibited-attr` as incomplete on all nine rather than a
    // violation, so `toHaveNoViolations` stays green despite them being
    // skipped by Chromium's sequential focus navigation.
    expect(await axe(screen.container.firstElementChild!)).toHaveNoViolations()
  })

  it('should not unselect page 1 after clicking on Prev Page trigger', async () => {
    await byLabel(screen, 'Previous Page').click()
    await expect.element(byLabel(screen, 'Page 1')).toHaveAttribute('data-selected', 'true')
  })

  it('should not unselect last page after clicking on Next Page trigger', async () => {
    await byLabel(screen, 'Last Page').click()
    const lastPageLabel = selectedLabel(screen)
    await byLabel(screen, 'Next Page').click()
    expect(selectedLabel(screen)).toBe(lastPageLabel)
  })
})

describe('given Pagination with <a> as buttons and disabled', () => {
  let screen: PaginationScreen

  const INITIAL_PAGE = 2 // Do not set to first or last page

  beforeEach(async () => {
    screen = await render(Pagination, { props: { ...ALL_PAGINATION_BUTTONS_AS_A_PROPS } })
    await byLabel(screen, `Page ${INITIAL_PAGE}`).click()
    await screen.rerender({ root: { disabled: true } })
  })

  it('should pass axe accessibility tests', async () => {
    expect(await axe(screen.container.firstElementChild!)).toHaveNoViolations()
  })

  it('should ignore clicking on First Page trigger', async () => {
    await byLabel(screen, 'First Page').click()

    expect(selectedLabel(screen)).toBe(`Page ${INITIAL_PAGE}`)
  })

  it('should ignore clicking on Last Page trigger', async () => {
    await byLabel(screen, 'Last Page').click()

    expect(selectedLabel(screen)).toBe(`Page ${INITIAL_PAGE}`)
  })

  it('should ignore clicking on any non-selected page', async () => {
    await byLabel(screen, 'Page 1').click()

    expect(selectedLabel(screen)).toBe(`Page ${INITIAL_PAGE}`)
  })
})

describe('given show-edges Pagination', () => {
  let screen: PaginationScreen

  beforeEach(async () => {
    screen = await render(Pagination, { props: { root: { showEdges: true } } })
  })

  it('should pass axe accessibility tests', async () => {
    expect(await axe(screen.container.firstElementChild!)).toHaveNoViolations()
  })

  it('should have first page selected by default', async () => {
    await expect.element(byLabel(screen, 'Page 1')).toHaveAttribute('data-selected', 'true')
    await expect.element(byLabel(screen, 'Page 2')).not.toHaveAttribute('data-selected')
  })

  it('should always show Page 1 & Page 10', async () => {
    // The original checked Page 2 despite naming Page 10. Exercise the edge
    // page that this existing test claims to cover.
    await expect.element(byLabel(screen, 'Page 1')).toBeInTheDocument()
    await expect.element(byLabel(screen, 'Page 10')).toBeInTheDocument()
  })

  describe('after clicking on Next Page trigger', () => {
    beforeEach(async () => {
      await byLabel(screen, 'Next Page').click()
    })

    it('should have set to page 2', async () => {
      await expect.element(byLabel(screen, 'Page 1')).not.toHaveAttribute('data-selected')
      await expect.element(byLabel(screen, 'Page 2')).toHaveAttribute('data-selected', 'true')
    })
  })

  describe('after clicking on Last Page trigger', () => {
    beforeEach(async () => {
      await byLabel(screen, 'Last Page').click()
    })

    it('should have set to page 10', async () => {
      await expect.element(byLabel(screen, 'Page 1')).toBeInTheDocument()
      await expect.element(byLabel(screen, 'Page 10')).toHaveAttribute('data-selected', 'true')
    })
  })

  describe('after clicking on Page 5 trigger', () => {
    beforeEach(async () => {
      await byLabel(screen, 'Page 5').click()
    })

    it('should have page 2', async () => {
      await expect.element(byLabel(screen, 'Page 2')).toBeInTheDocument()
      await expect.element(byLabel(screen, 'Page 3')).toBeInTheDocument()
      await expect.element(byLabel(screen, 'Page 4')).toBeInTheDocument()
    })

    it('should not have page 8', async () => {
      await expect.element(byLabel(screen, 'Page 6')).toBeInTheDocument()
      await expect.element(byLabel(screen, 'Page 7')).toBeInTheDocument()
      await expect.element(byLabel(screen, 'Page 8')).not.toBeInTheDocument()
    })

    it('should have right ellipsis', () => {
      expect(screen.container.querySelectorAll('[data-type="ellipsis"]').length).toBe(1)
    })
  })
})

describe('given small total value', () => {
  let screen: PaginationScreen

  beforeEach(async () => {
    screen = await render(Pagination, { props: { root: { total: 13 } } })
  })

  it('should pass axe accessibility tests', async () => {
    expect(await axe(screen.container.firstElementChild!)).toHaveNoViolations()
  })

  it('should have first page selected by default', async () => {
    await expect.element(byLabel(screen, 'Page 1')).toHaveAttribute('data-selected', 'true')
    await expect.element(byLabel(screen, 'Page 2')).not.toHaveAttribute('data-selected')
  })

  it('should have only 2 page button', () => {
    expect(screen.container.querySelectorAll('[data-type="page"]').length).toBe(2)
  })

  describe('after clicking on Next Page trigger', () => {
    beforeEach(async () => {
      await byLabel(screen, 'Next Page').click()
    })

    it('should have set to page 2', async () => {
      await expect.element(byLabel(screen, 'Page 1')).not.toHaveAttribute('data-selected')
      await expect.element(byLabel(screen, 'Page 2')).toHaveAttribute('data-selected', 'true')
    })
  })

  describe('after clicking on Last Page trigger', () => {
    beforeEach(async () => {
      await byLabel(screen, 'Last Page').click()
    })

    it('should have set to page 2', async () => {
      // first page will be hidden
      await expect.element(byLabel(screen, 'Page 1')).toBeInTheDocument()
      await expect.element(byLabel(screen, 'Page 2')).toHaveAttribute('data-selected', 'true')
    })
  })
})

describe('given 0 total value', () => {
  let screen: PaginationScreen

  beforeEach(async () => {
    screen = await render(Pagination, { props: { root: { total: 0 } } })
  })

  it('should pass axe accessibility tests', async () => {
    expect(await axe(screen.container.firstElementChild!)).toHaveNoViolations()
  })

  it('should have first page selected by default', async () => {
    await expect.element(byLabel(screen, 'Page 1')).toHaveAttribute('data-selected', 'true')
  })

  it('all button should disabled', () => {
    expect(byLabel(screen, 'First Page').element().hasAttribute('disabled')).toBe(true)
    expect(byLabel(screen, 'Previous Page').element().hasAttribute('disabled')).toBe(true)
    expect(byLabel(screen, 'Next Page').element().hasAttribute('disabled')).toBe(true)
    expect(byLabel(screen, 'Last Page').element().hasAttribute('disabled')).toBe(true)
  })
})
