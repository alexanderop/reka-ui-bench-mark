import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
import TagsInput from './story/_TagsInput.vue'

// Not a port — no jsdom original, so `port:parity` reports this file as
// unpaired and skips it. Found by the a11y census: the tree for a tags input
// holding one tag "Test" reads `- text: Test` / `- button "Test"` /
// `- textbox "Anything..."`. TagsInputItemDelete.vue:37 names the delete
// button by `aria-labelledby=<the tag's text id>` and nothing else, so an AT
// announces "Test, button" — the item's own name, with no hint that
// activating it removes the tag.

describe('given the TagsInput story fixture with one tag', () => {
  it('exposes the tag text, one button and the input', async () => {
    await render(TagsInput)
    await expect.element(document.body).toMatchAriaInlineSnapshot(`
      - text: Test
      - button "Test"
      - textbox "Anything..."
    `)
  })

  // @finding TagsInput/TagsInput.aria.browser.test.ts#delete-button-named-by-tag-text
  it.fails('does not name the delete button with the bare tag text', async () => {
    await render(TagsInput)
    expect(page.getByRole('button', { name: 'Test', exact: true }).elements()).toHaveLength(0)
  })
})
