import { expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import { render } from 'vitest-browser-vue'
import Separator from './Separator.vue'

// Browser-mode port of `Separator.test.ts`. The original is the whole file: one
// top-level `it`, no `describe`, two mounts of the raw primitive (not the story
// fixture) and two axe runs. It installs no stubs, so nothing is deleted here.
//
// Three things were checked rather than assumed; all three are in FINDINGS.tsv.
//
//  - TWO RENDERS INSIDE ONE TEST BEHAVE SANELY. `vitest-browser-vue`'s cleanup
//    runs in a `beforeEach`, not between renders, so the second `render` does
//    NOT unmount the first: each call appends its own container to
//    `document.body` and both stay mounted for the rest of the test (probed:
//    `document.body.children.length === 2`, both elements still connected).
//    Both are torn down before the next test (probed: 0 children). So the
//    original's mount-twice shape ports literally.
//
//  - `wrapper.element` → `container.firstElementChild`. `render` unwraps VTU's
//    intermediate node, so the component root is a direct child of `container`.
//    Passing `container` instead would audit the wrapper div as well, which the
//    original does not do.
//
//  - WHAT AXE ACTUALLY AUDITS HERE IS ALMOST NOTHING, in both environments.
//    See `Separator/Separator.test.ts#axe-near-vacuous` — the horizontal mount
//    runs 5 rules, all of them checks that the *string* `separator` is a real,
//    non-deprecated, correctly-parented role; removing `role` from the
//    component entirely produces zero violations and zero passes, so this test
//    cannot fail for the most obvious way the component could break. It is kept
//    verbatim because that is the rule, and the observation is the deliverable.
it('should pass axe accessibility tests', async () => {
  const wrapper = await render(Separator)
  expect(await axe(wrapper.container.firstElementChild!)).toHaveNoViolations()

  const wrapperVertical = await render(Separator, {
    props: {
      orientation: 'vertical',
    },
  })
  expect(await axe(wrapperVertical.container.firstElementChild!)).toHaveNoViolations()
})
