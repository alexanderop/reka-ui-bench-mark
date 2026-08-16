import { expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import { render } from 'vitest-browser-vue'
import Arrow from './Arrow.vue'

it('should pass axe accessibility tests', async () => {
  const wrapper = await render(Arrow)
  expect(await axe(wrapper.container.firstElementChild!)).toHaveNoViolations()
})
