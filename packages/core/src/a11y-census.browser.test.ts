import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { pinClock, PINNED_TODAY } from '@/test/visual'

// Not a port — no jsdom original, so `port:parity` reports this file as
// unpaired and skips it. It is an accessibility *census*: one ARIA snapshot of
// the at-rest tree of every story fixture, written to
// `__snapshots__/a11y-census.browser.test.ts.snap`.
//
// Why this is worth a file: the ARIA tree (roles, computed names, active
// states) is the layer between "axe found no rule violation" and "a keyboard
// user can operate it" — the layer where legal-but-wrong markup lives. Read
// the `.snap` the way you would read an audit. The smells are mechanical:
//
//   - an interactive role with no name           (`- button`, `- group:`)
//   - loose `- text: Label` next to a control     (a label that reaches nothing)
//   - a name that is really a placeholder/value   (`textbox "#000000"`,
//                                                  `progressbar "50%"`)
//   - the same name on every sibling              (`button "Toggle italic"` ×3)
//   - a hidden/unnamed `img` inside an overlay
//
// First run of this census (see FINDINGS.tsv, `a11y-census.browser.test.ts#census`)
// found the DateField label reaching only the hidden input, the Calendar
// `application` grid being unnamed, the TagsInput delete button named by the
// tag text, and four fixture bugs. Each product finding is pinned by an
// `it.fails` in a sibling `<Component>.aria.browser.test.ts`; this file only
// records the trees.
//
// What the tree cannot show, so do not look for it here: relations
// (`aria-controls`, `-describedby`, `-activedescendant`), states that are
// *false* (`[expanded]` appears only when true — a closed overlay looks like a
// bare button), anything `aria-hidden` or `display: none`. Open states live in
// the `*.aria.browser.test.ts` transition tests, not here.
//
// Determinism: `pinClock` fakes only `Date`, so the date fixtures render
// February 2024 on every run; the tree carries no geometry or font metrics, so
// the `.snap` is the same on every OS. The Avatar fixture is skipped because it
// loads a remote image and its tree flips from fallback text to `img` on load.

pinClock(PINNED_TODAY)

const fixtures = import.meta.glob('./*/story/_*.vue', { eager: true }) as Record<string, { default: unknown }>

// Partials that need props/context from a parent fixture, variants whose tree
// is a subset of the main fixture's, and the network-dependent Avatar.
const SKIP = /_(?:Dummy|Button|ButtonGroup|TickIcon|StoryFrame|Animation|Toggle|Submenu|SelectItem|NavigationMenuListItem|LinkGroup|DismissableBox|Radio|ScrollAreaCopy|ScrollAreaStory|NoScopeCheckbox|ScopedCheckbox|ScopedRadioGroup|ScopedToggleGroup|MenuWithAnchor|MenuWithSubmenu|StepperDynamic|TagsInputDisabled|TagsInputObject|ComboboxObject|ComboboxManualFilter|ComboboxTagsInput|CalendarMultiple|CalendarPopover|ColorSliderCompound|SelectTest|TreeNested|Avatar)\.vue$/

describe('a11y census: at-rest ARIA tree of every story fixture', () => {
  for (const [path, mod] of Object.entries(fixtures)) {
    if (SKIP.test(path))
      continue
    const name = path.replace('./', '').replace('/story/_', ' / ').replace('.vue', '')
    it(name, async () => {
      await render(mod.default as never)
      // `<html>`, not `<body>`: `toMatchAriaSnapshot` matches with *contain*
      // semantics, so an added unnamed button or stray text node passes
      // silently unless the entry carries `- /children: deep-equal`. The
      // matcher's root call flattens a role-less root (body, a container div)
      // and drops a root-level directive on the floor — measured, a template
      // listing one of two buttons passes with `- /children: equal` at the
      // top. `<html>` has the implicit role `document`, so its node survives
      // as the tree root and a directive *under it* is honoured. Every entry
      // in the `.snap` therefore reads `- document:` / `- /children:
      // deep-equal` / …. `-u` keeps that line on an entry that still matches
      // and DROPS it on one it rewrites (measured), so after an intended
      // update re-add it to every rewritten entry before committing.
      await expect.element(document.documentElement).toMatchAriaSnapshot()
    })
  }
})
