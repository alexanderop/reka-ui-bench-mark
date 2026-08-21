import type { RenderResult } from 'vitest-browser-vue'
import type { Component, PropType, VNode, VNodeChild } from 'vue'
import type { VisualCell } from './sheet'
import { expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent, Fragment, inject, provide, reactive } from 'vue'
import { assertSheetFitsViewport, cellQueries, kebab, renderSheetCell, renderSheetHost, SHEET_TEST_ID } from './sheet'

/**
 * Render an existing Histoire `*.story.vue` as a visual story sheet.
 *
 * Histoire has no portable-stories API: its `<Story>` reads the story object
 * Histoire's own `MountStory` sub-app hands it, and its `<Variant>` renders
 * `null` — the slot is mounted later by `RenderStory` in the sandbox iframe
 * (`@histoire/plugin-vue/src/client/app/{Story,Variant,RenderStory}.ts`). So a
 * story file cannot be composed and mounted the way Storybook's `composeStory`
 * output can. What *is* true is that the SFCs reference `Story` and `Variant`
 * as global components, so the test registers stand-ins: `Story` renders the
 * shared sheet host, `Variant` renders one cell. The component markup inside
 * each variant is the story's own, untouched.
 *
 * Supported: every `<Story>`/`<Variant>` prop Histoire declares (accepted and
 * ignored, so nothing leaks onto the DOM), `initState` (sync) feeding the
 * `{ state }` slot prop, variant-less single stories (rendered as one cell
 * named `default`, as Histoire does), untitled variants (`untitled`), and the
 * `single` layout (one column). Not supported: `#controls` / `#source` slots,
 * `setupApp`, and async `initState` — none of the 176 stories in this tree use
 * them (grep-verified), so they are ignored rather than emulated.
 */
export interface HistoireStoryOptions {
  /** Override the derived `toMatchScreenshot` reference name (`<kebab story title>-story`). */
  screenshot?: string
  /**
   * CSS selectors, scoped to the sheet, whose elements are masked in the
   * screenshot — for content a story author never meant to be deterministic
   * (`AspectRatio`'s remote Unsplash `<img>`). Layout still has to be stable;
   * the mask hides pixels, not geometry.
   */
  mask?: string[]
  /**
   * Cells per row (default 2, or 1 when the story's `layout.type` is
   * `single`). Use 1 for stories whose variants are wider than a 356px
   * half-sheet cell — Histoire's `width: '50%'` grid is a much wider column,
   * and a clipped field is not a reviewable reference.
   */
  columns?: 1 | 2
}

export interface HistoireVariant {
  /** The `<Variant title>` (or `default` / `untitled`, as Histoire names them). */
  name: string
}

export interface MountedHistoireStory {
  screen: RenderResult<Record<string, never>>
  /** The whole sheet — what the screenshot captures. */
  sheet: HTMLElement
  /** The rendered `<Story title>`. */
  title: string
  /** One entry per rendered variant, in story order. */
  cells: VisualCell<HistoireVariant>[]
  /** Look a cell up by its variant title. */
  cell: (name: string) => VisualCell<HistoireVariant>
  /** `toMatchScreenshot` of the sheet under the story's reference name. */
  screenshot: (name?: string) => Promise<void>
}

export interface HistoireStory {
  /** The `.story.vue` component, as given. */
  Story: Component
  mount: () => Promise<MountedHistoireStory>
  /** `it(name, …)` that mounts the story, runs your assertions, then takes the one reference screenshot. */
  it: (name: string, fn: (mounted: MountedHistoireStory) => Promise<void> | void) => void
}

type StateFactory = () => Record<string, unknown>

const STORY_STATE_KEY = Symbol('histoire-story-state')
const SHEET_COLUMNS_KEY = Symbol('histoire-sheet-columns')
const VARIANT_MARKER = '__visualHistoireVariant'

/**
 * Histoire's `StoryLayout`, widened: upstream stories put `iframe` on a
 * `grid` layout too (Editable, Listbox, Splitter), which Histoire ignores.
 */
interface StoryLayout {
  type?: 'single' | 'grid'
  width?: string | number
  iframe?: boolean
}

/** Histoire's `Story` props (`@histoire/plugin-vue/components.d.ts`), so none of them fall through as attrs. */
export const StoryStandIn = defineComponent({
  name: 'Story',
  inheritAttrs: false,
  props: {
    title: { type: String, default: undefined },
    id: { type: String, default: undefined },
    layout: { type: Object as PropType<StoryLayout>, default: undefined },
    setupApp: { type: Function, default: undefined },
    group: { type: String, default: undefined },
    icon: { type: String, default: undefined },
    iconColor: { type: String, default: undefined },
    docsOnly: { type: Boolean, default: false },
    source: { type: String, default: undefined },
    responsiveDisabled: { type: Boolean, default: false },
    autoPropsDisabled: { type: Boolean, default: false },
    meta: { type: Object, default: undefined },
    initState: { type: Function as PropType<StateFactory>, default: undefined },
  },
  setup(props, { slots }) {
    provide(STORY_STATE_KEY, props.initState)
    const columns = inject<1 | 2 | undefined>(SHEET_COLUMNS_KEY, undefined)
    const state = reactive(props.initState?.() ?? {})
    return () => {
      const children = slots.default?.({ state }) ?? []
      const cells = containsVariant(children)
        ? children
        : renderSheetCell('default', children)
      return renderSheetHost(props.title ?? 'Story', cells, columns ?? (props.layout?.type === 'single' ? 1 : 2))
    }
  },
})

/** Histoire's `Variant` props, same source; `title` defaults to Histoire's own `untitled`. */
export const VariantStandIn = defineComponent({
  name: 'Variant',
  [VARIANT_MARKER]: true,
  props: {
    title: { type: String, default: 'untitled' },
    id: { type: String, default: undefined },
    setupApp: { type: Function, default: undefined },
    icon: { type: String, default: undefined },
    iconColor: { type: String, default: undefined },
    source: { type: String, default: undefined },
    responsiveDisabled: { type: Boolean, default: false },
    autoPropsDisabled: { type: Boolean, default: false },
    meta: { type: Object, default: undefined },
    variant: { type: Object, default: undefined },
    initState: { type: Function as PropType<StateFactory>, default: undefined },
  },
  setup(props, { slots }) {
    const storyInitState = inject<StateFactory | undefined>(STORY_STATE_KEY, undefined)
    const state = reactive(props.initState?.() ?? storyInitState?.() ?? {})
    return () => renderSheetCell(props.title, slots.default?.({ state }))
  },
})

function containsVariant(children: VNodeChild): boolean {
  if (!Array.isArray(children))
    return false
  return children.some((child) => {
    if (!child || typeof child !== 'object' || Array.isArray(child))
      return Array.isArray(child) && containsVariant(child)
    const vnode = child as VNode
    if (vnode.type === Fragment)
      return containsVariant(vnode.children as VNodeChild)
    return typeof vnode.type === 'object' && VARIANT_MARKER in vnode.type
  })
}

export function defineHistoireStory(Story: Component, options: HistoireStoryOptions = {}): HistoireStory {
  async function mount(): Promise<MountedHistoireStory> {
    const screen = await render(Story, {
      global: {
        components: { Story: StoryStandIn, Variant: VariantStandIn },
        provide: { [SHEET_COLUMNS_KEY]: options.columns },
      },
    })
    const sheetLocator = screen.getByTestId(SHEET_TEST_ID)
    await expect.element(sheetLocator).toBeVisible()
    const sheet = sheetLocator.element() as HTMLElement
    const title = sheet.dataset.storyTitle ?? 'Story'
    const screenshotName = options.screenshot ?? `${kebab(title)}-story`

    const cells = Array.from(sheet.querySelectorAll<HTMLElement>('[data-variant]'), (el, index): VisualCell<HistoireVariant> => {
      const name = el.dataset.variant ?? 'untitled'
      return { index, name, variant: { name }, el, ...cellQueries(el, title, name) }
    })
    expect(cells.length, `[${title}] renders at least one variant`).toBeGreaterThan(0)

    return {
      screen,
      sheet,
      title,
      cells,
      cell: (name) => {
        const found = cells.find(cell => cell.name === name)
        if (!found)
          throw new Error(`[${title}] has no variant named "${name}"`)
        return found
      },
      screenshot: async (name = screenshotName) => {
        assertSheetFitsViewport(sheet, title)
        const mask = (options.mask ?? []).flatMap(selector => [...sheet.querySelectorAll(selector)])
        await expect(sheet).toMatchScreenshot(name, mask.length ? { screenshotOptions: { mask } } : {})
      },
    }
  }

  return {
    Story,
    mount,
    it: (name, fn) => {
      it(name, async () => {
        const mounted = await mount()
        await fn(mounted)
        await mounted.screenshot()
      })
    },
  }
}
