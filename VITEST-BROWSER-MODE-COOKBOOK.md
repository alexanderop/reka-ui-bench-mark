# A cookbook for Vitest Browser Mode

> **Draft blog post.** Written for two audiences at once: humans deciding how to
> test something in Vitest Browser Mode, and LLMs whose training data predates
> these APIs. Every recipe states its version, shows the wrong way next to the
> right way, and is self-contained — imports included, no "as we saw above".
>
> **Everything here was measured**, not inferred: every snippet pattern in this
> post runs green in headless Chromium against **Vitest 4.1.10 with the
> Playwright provider**, inside a fork of [reka-ui](https://github.com/unovue/reka-ui)
> whose entire 97-file jsdom suite was migrated to browser mode. The receipts —
> coverage diffs, mutation checks, bisected flakes — live in that repo.

---

## Why your LLM writes broken browser-mode tests

If you ask an AI assistant for a Vitest Browser Mode test today, you will
probably get one of three failure modes, and all three have the same cause:
the training data is dominated by Vitest 3 and by a decade of jsdom idioms.

1. **Vitest 3 config.** `provider: 'playwright'` as a string, imports from
   `@vitest/browser/context`. Both are gone in Vitest 4: the provider is a
   *function* from a separate package (`playwright()` from
   `@vitest/browser-playwright`), and the context import moved to
   `vitest/browser`.
2. **jsdom gestures in a real browser.** `element.dispatchEvent(new
   PointerEvent(...))`, `input.value = 'x'` plus a hand-fired `input` event,
   spying on `scrollIntoView`. These *run* in Chromium — and silently test
   nothing, because they bypass hit-testing, `beforeinput`, focus, and every
   other thing you moved to a browser to get.
3. **No knowledge of the 4.1-era APIs at all.** `userEvent.wheel`,
   `locator.fill()`, real clipboard (`copy`/`paste`/`tripleClick`), ARIA
   snapshots, `toBeInViewport`, `toHaveSelection` — a survey of 90 freshly
   migrated browser test files found **zero** uses of any of them, because the
   humans and models writing the ports didn't know they existed either.

This post is the fix for (2) and (3): a task-indexed set of recipes. If you
maintain an agent rules file (`CLAUDE.md`, `AGENTS.md`, Cursor rules), the
condensed version at the end is designed to be pasted in verbatim.

**Version pin for everything below:** Vitest **4.1.10**, provider
`@vitest/browser-playwright`, renderer `vitest-browser-vue` 2.1.0, headless
Chromium. The examples use Vue; the locator, `userEvent`, and assertion APIs
are framework-independent. A final section covers what changes in Vitest 5.

---

## The decision table

Start here. "What do you want to test?" → the API that tests it, and the
jsdom-era pattern it replaces.

| You want to test… | Use | Not | Since |
|---|---|---|---|
| typing into an input | `locator.fill('42')` or `userEvent.keyboard('42')` | `input.value = '42'` + dispatched `input` event | 4.0 |
| a paste handler | `tripleClick()` → `userEvent.copy()` → `userEvent.paste()` | hand-built `ClipboardEvent` with fabricated `DataTransfer` | 4.1 |
| a wheel/scroll-to-step handler | `locator.wheel({ delta: { y: 100 } })` | `dispatchEvent(new WheelEvent(...))` | 4.1.0 |
| a keyboard shortcut | focus the element, then `userEvent.keyboard('{ArrowUp}')` | `element.trigger('keydown', { key })` | 4.0 |
| "it scrolled into view" | `await expect.element(item).toBeInViewport()` | `vi.spyOn(HTMLElement.prototype, 'scrollIntoView')` | 4.0 |
| "the text is selected" | `await expect.element(input).toHaveSelection('…')` | `input.selectionStart === 0` | 4.1 |
| formatted value vs accessible value | `toHaveDisplayValue('EUR 5.00')` + `toHaveAttribute('aria-valuenow', '5')` | one `toHaveValue` doing double duty | 4.1 |
| accessible structure (roles, names, states) | `toMatchAriaInlineSnapshot()` | walls of individual `toHaveAttribute('role'/'aria-*')` probes | 4.1.4 |
| focus-trap behavior on Tab | `userEvent.tab()` and assert where focus *went* | synthetic Tab keydown + asserting `event.defaultPrevented` | 4.0 |
| clicking a disabled control | `locator.click({ force: true })` | `element.trigger('click')` (your test framework's guard, not the platform's) | 4.0 |
| a drag gesture | `locator.dropTo(target)` / `click({ position })` | synthetic `pointerdown`/`pointermove` with faked `pointerId` | 4.0 |
| eventual DOM state | `await expect.element(locator).toHaveAttribute(...)` (retries) | `await nextTick()` then a raw read | 4.0 |
| IME composition | **synthetic events, on purpose** — see "What stays synthetic" | — | — |

---

## Part 1 — Real input

### Recipe: type into an input with `fill()`

**Situation.** Your component validates input in a `beforeinput` handler — a
number field rejecting letters, a masked input, a pin box.

**❌ The jsdom-era way** (this pattern appeared ~15 times in a single migrated
file, and in three more files besides):

```ts
const input = screen.getByRole('spinbutton').element() as HTMLInputElement
input.value = 'abc'
input.dispatchEvent(new Event('input', { bubbles: true }))
```

This assigns behind the component's back. **The `beforeinput` guard never
runs.** A validation regression ships and this test stays green.

**✅ The recipe:**

```ts
import { expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import NumberField from './story/_NumberField.vue'

it('rejects a non-numeric fill through the real beforeinput guard', async () => {
  const screen = render(NumberField, { props: { defaultValue: 6 } })
  const input = screen.getByRole('spinbutton')

  await input.fill('abc') // focuses, selects, inserts via real insertText
  await expect.element(input).toHaveValue('6') // rejected by the component

  await input.fill('42')
  await expect.element(input).toHaveValue('42') // accepted
})
```

`fill()` focuses, selects the existing content, and inserts via a real
`insertText` — which means the component's **cancelable `beforeinput` fires**.
Measured: `fill('abc')` is genuinely rejected by the validate guard,
`fill('42')` accepted. Use `userEvent.keyboard('abc')` instead when you want
per-keystroke events (one `beforeinput` per key, not one per fill).

**Trap.** `fill` replaces content. If the contract is "typing *appends*",
click to place the caret and use `keyboard`.

---

### Recipe: test a paste handler with the real clipboard

**Situation.** A pin input distributes pasted characters across boxes; a tags
input splits on commas. You need a paste event whose `clipboardData` is real.

**❌ The jsdom-era way** — two migrated files carried this identical helper:

```ts
function paste(text: string) {
  const data = new DataTransfer()
  data.setData('text/plain', text)
  document.activeElement?.dispatchEvent(new ClipboardEvent('paste', {
    bubbles: true,
    cancelable: true,
    clipboardData: data,
  }))
}
```

It works — but the `clipboardData` is fabricated by the test. Whether the
*browser's own* paste command delivers a payload your handler can read is
exactly the thing not being tested.

**✅ The recipe** (Vitest ≥ 4.1) — put the source text in a scratch input,
select it, and run the real copy/paste chords:

```ts
import { expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { userEvent } from 'vitest/browser'
import PinInput from './story/_PinInput.vue'

it('distributes a pasted string across the boxes', async () => {
  const screen = render({
    components: { PinInput },
    template: `<input data-testid="source" value="test" /><PinInput />`,
  })

  await screen.getByTestId('source').tripleClick() // select-all gesture
  await userEvent.copy() // real {Ctrl/Meta}+C
  await screen.getByRole('textbox', { name: 'pin input' }).first().click()
  await userEvent.paste() // real {Ctrl/Meta}+V

  // the component's actual paste handler distributed t/e/s/t
  const boxes = screen.container.querySelectorAll<HTMLInputElement>('input:not([aria-hidden])')
  expect(Array.from(boxes, b => b.value)).toEqual(['t', 'e', 's', 't'])
})
```

`copy()`/`paste()` are implemented as **real modifier chords** through the
provider keyboard — so the paste is a genuine trusted `ClipboardEvent` with
real `clipboardData`, produced by the browser's own paste command. Measured
green in headless Chromium, including through a pin-input component's paste
handler.

**Trap.** Clipboard state persists across tests in a session the way held
modifiers do — overwrite it per test rather than assuming it's empty.
*[unverified — assume the worst]*

---

### Recipe: test a wheel handler with `userEvent.wheel`

**Situation.** A number field steps on scroll, a carousel advances, a zoom
control zooms. The handler has guards — "only while focused", "ignore
horizontal trackpad deltas" — and a synthetic `WheelEvent` cannot exercise
them, because a synthetic event's target is whatever you dispatched it at,
hit-testing be damned.

**✅ The recipe** (Vitest ≥ 4.1.0):

```ts
import { expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import NumberField from './story/_NumberField.vue'

it('steps when the focused input is scrolled', async () => {
  const screen = render(NumberField, { props: { defaultValue: 10 } })
  const input = screen.getByRole('spinbutton')

  await input.click()
  await input.wheel({ delta: { y: 100 } })
  await expect.element(input).toHaveValue('11')
})

it('ignores a wheel over an unfocused input — untestable with a synthetic dispatch', async () => {
  const screen = render(NumberField, { props: { defaultValue: 10 } })
  const input = screen.getByRole('spinbutton')

  // No click first. The real wheel hits the hovered input, and the handler's
  // `event.target !== getActiveElement()` guard must drop it.
  await input.wheel({ delta: { y: 100 } })
  await expect.element(input).toHaveValue('10')
})

it('ignores a mostly-horizontal trackpad scroll', async () => {
  const screen = render(NumberField, { props: { defaultValue: 10 } })
  const input = screen.getByRole('spinbutton')

  await input.click()
  await input.wheel({ delta: { x: 120, y: 50 } }) // |deltaY| <= |deltaX|: sideways intent
  await expect.element(input).toHaveValue('10')
})
```

On the Playwright provider this is **not** a dispatched event: it is a real
hover (the pointer moves onto the element) followed by `page.mouse.wheel(dx,
dy)` — trusted input, routed through Chromium hit-testing. That is why the
unfocused-guard test is possible at all: the synthetic version could only fake
"unfocused" by not calling `focus()`, which proves nothing about where a real
wheel lands. Both guard tests above were covered by **neither** the jsdom
suite nor a faithful browser port — they only became writable with this API.

**Trap.** `wheel` is for components that *listen* to wheel. Don't use it to
scroll something into view — locator actions auto-scroll already.

---

### Recipe: press a key

**Situation.** Arrow-key stepping, Escape to dismiss, Enter to commit.

**✅ The recipe.** Keyboard input goes to whatever has focus — so focus first,
then type:

```ts
import { expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { userEvent } from 'vitest/browser'
import NumberField from './story/_NumberField.vue'

it('steps with real arrow keys', async () => {
  const screen = render(NumberField, { props: { defaultValue: 0, min: 0, max: 10 } })
  const input = screen.getByRole('spinbutton')

  await input.click() // focus via a real gesture
  await userEvent.keyboard('{ArrowUp}')
  await expect.element(input).toHaveValue('1')
  await userEvent.keyboard('{End}')
  await expect.element(input).toHaveValue('10')
})
```

Three traps here, each measured the hard way:

1. **A braced key that is not a real key name is not a keystroke.**
   `userEvent.keyboard('{19}')` looks like "type 19". It is not: the provider
   checks braced contents against Playwright's real key names and otherwise
   falls back to `insertText`, which fires **no key events at all**. A
   date-segment test doing this passed 7 of 8 tests with the segment never
   filling — the failure reads like a focus bug and isn't one. Type real
   digits: `userEvent.keyboard('19')`.

2. **A synthetic keypress has zero duration, and real code races it.**
   Chromium delivers keyup before a `setTimeout(..., 0)` scheduled from the
   keydown. A radio-group that defers selection by `setTimeout(0)` and clears
   its arrow-key flag on keyup selected the item in **1 of 15** runs with a
   plain `{ArrowDown}` — and **15 of 15** with the held form:

   ```ts
   await userEvent.keyboard('{ArrowDown>}') // press and hold
   await new Promise(r => setTimeout(r, 0)) // let the deferred work run
   await userEvent.keyboard('{/ArrowDown}') // release
   ```

   The held form is also the *faithful* translation of testing-library's
   `fireEvent.keyDown`, which never dispatched a keyup at all.

3. **A held modifier persists until explicitly released — across tests.**
   `{Shift>}{Tab}` with no `{/Shift}` carried Shift into a later test's label
   click and suppressed native label activation; in another run an unreleased
   Shift made six tests in a *different component's file* fail. Append the
   release token to every chord unless continued modifier state is the
   contract.

---

### Recipe: click a disabled control

**Situation.** "Clicking a disabled toggle does nothing."

**❌ The trap in the old test:** `@vue/test-utils`' `trigger('click')`
short-circuits on disabled BUTTON/INPUT/SELECT/TEXTAREA — so the jsdom test
asserted *the test framework's own guard*, not the platform's.

**✅ The recipe:**

```ts
await toggle.click({ force: true })
await expect.element(toggle).toHaveAttribute('aria-pressed', 'false')
```

A plain `.click()` on a disabled element burns the full actionability timeout
(measured: 1503ms to failure vs 6ms forced) because "enabled" is one of
Playwright's actionability checks. `force: true` skips the **wait**, not the
gesture: Chromium still delivers a real `pointerdown` and then suppresses
`mousedown`/`mouseup`/`click` itself — which is exactly the platform behavior
such a test is about.

**Trap.** After the forced press, Chromium focuses the nearest
mouse-focusable *ancestor* (or blurs to `<body>` if there is none). So
`activeElement !== disabledTarget` is a vacuous assertion — also assert the
selection/state the disabled gesture must have preserved.

---

## Part 2 — Assertions

### Recipe: assert eventual DOM state with `expect.element`

**The one API to internalize first.** `expect.element(locator)` is
`expect.poll` in disguise: it **re-queries the locator and retries the
matcher** (50ms interval, 1s timeout by default). A bare
`locator.element()` resolves once, eagerly, and retries nothing.

```ts
// Retries until the attribute appears or 1s elapses:
await expect.element(screen.getByRole('dialog')).toHaveAttribute('data-state', 'open')

// Resolves NOW — whatever the DOM holds at this instant:
expect(screen.getByRole('dialog').element().getAttribute('data-state')).toBe('open')
```

Both forms are correct — for different contracts. The retrying form owns the
wait, which is why you can delete most `await nextTick()` calls (see the
synchronization recipes). The eager form is right when *instantaneity* is the
contract.

**Trap: a failing retrying matcher costs the full timeout.** Measured: a
failing `expect.element(...).toHaveFocus()` took **15 009ms** where the
equivalent jsdom assertion failed in 8ms. Fine on the happy path; budget for
it when you're iterating on a red test.

**Trap: two silent vacuities inherited from testing-library habits.**

1. A locator is **lazy** — `screen.getByTestId('does-not-exist')` constructs
   without throwing. In testing-library, the throw *was* the assertion; a
   test whose only "assertion" is a bare `getBy*` now asserts nothing. Write
   `await expect.element(...).toBeInTheDocument()`.
2. **Text and role-name matching is substring-based by default** in Vitest 4.
   `getByText('checked')` matches an element whose text is `unchecked`;
   `getByRole('option', { name: 'Apple' })` matches *Pineapple*;
   `toHaveTextContent('1')` passes against `1980`. Pass `{ exact: true }`
   whenever the string is data rather than a label you control, and compare
   trimmed `textContent` exactly when a rendered value is the contract.
   (Vitest 5 flips these defaults — see the last section.)

---

### Recipe: assert "it scrolled into view" with `toBeInViewport`

**Situation.** Keyboard navigation in a listbox should bring the highlighted
option into view — and mount-time highlighting must *not* scroll the page.

**❌ The jsdom-era way**, found running *in a real browser* after a faithful
migration:

```ts
scrollSpy = vi.spyOn(window.HTMLElement.prototype, 'scrollIntoView')
// ...
expect(scrollSpy).not.toHaveBeenCalled()
```

The spy observes the *call*, not the outcome. A `block: 'nearest'` call that
scrolls nothing fails the negative test for no user-visible reason; a call
that scrolls the wrong container passes the positive one.

**✅ The recipe** — assert the truth the browser can now tell you:

```ts
// Positive: entry focus brings the first item into view
await expect.element(screen.getByRole('option', { name: 'Item 0', exact: true }))
  .toBeInViewport()

// Negative: the mount highlight must not scroll the page
expect(window.scrollY).toBe(0)
```

`toBeInViewport` asserts that the element intersects the viewport, optionally
with a `ratio`. It is the outcome the user experiences; the spy was a proxy
for it that could be wrong in both directions.

---

### Recipe: assert selected text with `toHaveSelection`

**Situation.** "Focusing the input selects its content."

```ts
// ❌ implementation detail:
expect(inputElement.selectionStart).toBe(0)

// ✅ the behavior, stated directly (retrying):
await expect.element(input).toHaveSelection('42')
```

Works on inputs, textareas, and arbitrary text nodes.

---

### Recipe: keep display value and accessible value separate

**Situation.** A formatted field — currency, dates — shows the user one
string and assistive tech another.

```ts
import { expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import NumberField from './story/_NumberField.vue'

it('formats for the user, exposes the number to AT', async () => {
  const screen = render(NumberField, {
    props: {
      defaultValue: 5,
      formatOptions: { style: 'currency', currency: 'EUR', currencyDisplay: 'code' },
    },
  })
  const input = screen.getByRole('spinbutton')

  await expect.element(input).toHaveDisplayValue('EUR 5.00')
  await expect.element(input).toHaveAttribute('aria-valuenow', '5')
})
```

Two things worth stealing: `toHaveDisplayValue` asserts the formatted string
the user sees, distinct from the accessible number — one contract per
assertion. And the ` ` is spelled as an **escape**: `Intl` separates
currency code and amount with a no-break space, and a survey found four test
sites embedding it as an invisible literal that no reviewer — and no naive
grep — could see. (`grep -rlP '\x{00A0}'` finds them; BSD grep's default mode
does not.)

---

### Recipe: assert accessible structure with an ARIA snapshot

**Situation.** You're asserting roles, accessible names, and states with a
wall of `toHaveAttribute` probes — or worse, you're running axe and calling
it done.

First, the motivation, because it's the strongest one in this post: **valid
ARIA can describe the wrong product state, and axe will not tell you.**
Measured with a tabs component wired subtly wrong: the Password panel was
visible while the Account tab kept `aria-selected="true"` and the panel's
`aria-labelledby` pointed at the Account tab. axe-core returned **zero
violations** — every attribute was individually legal — while a screen reader
would announce the wrong selected tab and the wrong panel name. Their
*combined meaning* was wrong, and no rule checks combined meaning.

**✅ The recipe** (Vitest ≥ 4.1.4, experimental):

```ts
import { expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import NumberField from './story/_NumberField.vue'

it('captures the accessible structure in one assertion', async () => {
  const screen = render(NumberField, { props: { defaultValue: 5, min: 0, max: 10 } })

  await expect.element(screen.getByTestId('root')).toMatchAriaInlineSnapshot(`
    - group:
      - text: Number Field
      - button "Decrease"
      - spinbutton "Number Field": "5"
      - button "Increase"
  `)
})
```

One block proves the label association, the button names, and the spinbutton
value — the *relationships*, not just the attributes. It snapshots the
accessibility tree, not the DOM, so unlike DOM snapshots it embeds no font
metrics and survives machine differences. Normal snapshot workflow: run once
to auto-fill, `-u` to update.

Keep axe too. Snapshots don't replace its contrast, hidden-focus, or rule
checks — and in a real browser axe is *much* stronger than it was under
jsdom, where `color-contrast` structurally cannot run and focusability checks
land in an `incomplete` bucket that `toHaveNoViolations` silently treats as a
pass. One migrated suite had been green for years over a real
`aria-hidden-focus` violation jsdom filed under `incomplete`.

**When to snapshot vs. probe:** snapshot per interesting *state* (closed /
open / item-highlighted) on structure-heavy components — menus, selects,
comboboxes, date fields. Keep individual `toHaveAttribute` probes when a
single attribute *is* the contract under test.

---

### Recipe: test a focus trap with a real Tab

**Situation.** "Tab moves focus out of the non-modal menu; Tab is trapped in
the modal one."

**❌ The jsdom-era way** — dispatch a synthetic Tab, assert the proxy:

```ts
const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Tab' })
menu.dispatchEvent(event)
expect(event.defaultPrevented).toBe(true) // "prevented" ≠ "trapped"
```

jsdom had no choice: it has no native sequential focus navigation, so a real
Tab moves nothing there. Chromium does.

**✅ The recipe:**

```ts
import { userEvent } from 'vitest/browser'

await userEvent.tab()
// non-modal: focus left the menu
await expect.element(page.getByRole('menu')).not.toHaveFocus()
// modal: focus stayed inside
```

Assert the contract — where focus actually *went* — instead of the
implementation detail that stood in for it.

---

## Part 3 — Synchronization

### Recipe: wait on outcomes, not framework ticks

The jsdom habit is `await nextTick()` after every interaction. In browser
mode, almost every one of them is dead weight, for two measured reasons:

1. **An awaited real interaction already crosses Vue's microtask flush** for
   synchronous state updates — the click travels server → browser → event
   task → microtasks → response.
2. **A retrying matcher owns its own wait** — `expect.element` re-queries
   until the condition holds.

```ts
// ❌ jsdom reflex:
await button.click()
await nextTick()
expect(content.getAttribute('data-state')).toBe('open')

// ✅ the assertion owns the wait:
await button.click()
await expect.element(content).toHaveAttribute('data-state', 'open')
```

An audit of 90 migrated files found 14 surviving `nextTick` calls; all 14
were deletable. Keep an explicit tick only when "after exactly one Vue flush"
is itself the contract, or when the state change bypasses an awaited browser
action. Timers, CSS transitions, and async watchers still need a real
synchronization point — a *different* one from the assertion under test:

**Never let a retry pre-settle the assertion you're about to read.** If you
write `await expect.element(x).toHaveAttribute(expected)` and then
synchronously read the same `x`/`expected`, the retry already guaranteed the
read — mutation-tested: delaying an unmount by 500ms broke the original test
and left that two-assertion version green. Wait on a *different* precondition
(the open state before clicking closed), then keep the original's
instantaneous read.

**And never retry a condition whose *timing* is the subject.** A
`describe('after 200ms')` block asserting with a retrying matcher silently
widens "at 200ms" to "within 200ms + the retry budget". Measured: moving the
fixture's flip from 200ms to 900ms failed the strict original and passed the
retrying port. When a test name mentions a duration, use a synchronous read.

---

### Recipe: fake timers — allowed, with one sharp edge

`vi.useFakeTimers()` **works in browser mode**: it installs on the tester
iframe's window, `vi.getTimerCount()` sees the component's pending timeouts,
and Playwright actions plus retrying matchers keep running on *real* time
outside the page — you can click and poll while the page clock is frozen.

The sharp edge: the default `toFake` set includes **`requestAnimationFrame`
and `performance`**. Anything downstream of rAF freezes — floating-ui
positioning above all. Measured consequences: a select's deferred auto-focus
fired mid-`userEvent.keyboard` whenever a later RPC let a frame through
(every assertion still passed; only a coverage diff revealed the intended
handler never ran), and a navigation menu's ResizeObserver→CSS-var pipeline
starved, computing a 0px-tall viewport that made every link unhittable.

Rules under browser fake timers: never wait on anything rAF- or
positioning-dependent, don't build poll loops on `performance.now()` (frozen
too), and drive state through microtask-only paths — or pass an explicit
`toFake` list that leaves rAF real.

---

## Part 4 — Traps that don't look like traps

**The substring family.** Three separately discovered, identically shaped
hazards in Vitest 4: `getByText` matches substrings (`'checked'` finds
`unchecked`), role `name` filters match substrings (`'Apple'` finds
*Pineapple*), and `toHaveTextContent` matches substrings (`'5'` passes against
a broken `20245`). Each can leave a test green against a component that never
works. Defense: `{ exact: true }` on data-driven queries, exact trimmed
`textContent` comparison when a rendered value is the contract.

**Zero-size elements cannot be clicked.** Headless components ship no CSS,
and a contentless `<button>` under a CSS reset measures 0×0 — Playwright's
actionability check then retries the click until timeout, with an error that
looks nothing like its cause. When a click hangs, measure the target with
`getBoundingClientRect()` before blaming the locator. Giving the fixture real
content or a minimal style is a legitimate fix.

**An open modal makes the rest of the page *really* inert.** A modal overlay
that sets `body { pointer-events: none }` is honored by Chromium hit-testing:
everything outside the content — including the trigger — is unreachable by
any pointer, and `force: true` doesn't help (a forced click is still routed
by hit-testing, to `<html>`). A press at those coordinates is an *outside
press* and dismisses. The keyboard is exempt: `pointer-events` doesn't gate
keydown, so Escape and Tab are the gestures a modal test can use.

**A real click hovers first.** Playwright moves the pointer onto the element,
so every `pointerenter`/`pointermove` handler fires before `mousedown` does.
On hover-opening components (tooltips, hover cards, nav menus), "clicking
opens" tests may pass through the hover-open path instead — and "clicking
must NOT open" can be inexpressible with real input. That's one of the cases
where a synthetic event is the faithful gesture (next section).

**You cannot fake a `pointerId`.** `dispatchEvent(new PointerEvent('pointerdown',
{ pointerId: 1 }))` looks like a faithful port; Chromium throws
`NotFoundError` from `setPointerCapture(1)` for a pointer that never existed.
Use real input: `locator.click({ position })`, `locator.dropTo(target)`.

---

## Part 5 — What stays synthetic, on purpose

A cookbook that pretends everything can be real input will teach you to write
hung tests. The rule that separates the cases:

> **Is this event faking what the browser would do (delete it — use real
> input), or is it constructing the test's scenario (keep it — and say so in
> a comment)?**

Three standing exceptions, all measured:

- **IME composition.** Playwright cannot drive a real IME. A composition test
  (`compositionstart` → value change → `input` → `compositionend`) is
  *correctly* synthetic. Say so in a comment so the next reader — human or
  model — doesn't "fix" it.
- **Keydown on a disabled element.** A real keyboard cannot reach a disabled
  input, so a guard-path negative ("keydown on disabled must not step") keeps
  the synthetic dispatch to make the scenario observable at all.
- **Constructed scenarios.** A test whose *subject* is "how many times does
  the component re-render when ResizeObserver fires twice synchronously"
  mocks ResizeObserver as its input, browser or not. The mock is the
  scenario, not a compensation for a missing platform.

---

## What changes in Vitest 5

Surveyed from the `v5.0.0-rc.1` tag; re-verify against final release notes.
The headline: **v5 changes defaults more than APIs**, and two of its defaults
retire this post's biggest trap.

- **Locators match exactly by default** (`browser.locators.exact: true`).
  The entire substring family above becomes historical: `getByText('checked')`
  stops matching `unchecked`, role names stop matching *Pineapple*. Every
  defensive `{ exact: true }` in this post becomes redundant. Upgrade cost:
  tests that accidentally *relied* on substring matching fail.
- **`toHaveTextContent` becomes strict equality**; substring and RegExp
  matching move to the new, honestly named `toMatchTextContent`.
- **`clearMocks: true` becomes the default** — call history wipes before each
  test (implementations survive). Tests that count calls *across* tests
  (`toHaveBeenCalledTimes(1)` then `(2)` in a sibling) break; measured blast
  radius in one suite was 8 files, all the same shared form-submit-spy
  pattern. The rewrite — each test owning its own count — is the better test
  anyway.
- **`render` becomes async** in `vitest-browser-vue` — mechanical
  `await render(...)` sweep.
- **Unawaited async assertions fail** instead of warning, and `expect.poll`
  rejects on timeout instead of passing late — both flush latent flakes.
- **New debugging surface**: `browser.locators.errorFormat` prints an ARIA
  snapshot / prettyDOM of the searched subtree on locator failure (finally
  making the 15s timeout say *something*), and `browser.traceView` records
  replayable traces of every action and assertion, headless CI included.

If you're adopting the 4.1 APIs from this post on an existing suite, upgrade
to v5 *first* if you can — every test written against exact-by-default
locators is one you won't re-audit.

---

## The condensed version — paste this into your agent rules

Copy the block below into `CLAUDE.md` / `AGENTS.md` / your Cursor rules. It
compresses this post into what an agent needs at generation time.

```markdown
## Vitest Browser Mode rules (Vitest 4.1.x, Playwright provider)

Config: provider is a FUNCTION — `playwright()` from `@vitest/browser-playwright`
(not the v3 string). Context imports come from `vitest/browser`
(not `@vitest/browser/context`). Render via `vitest-browser-vue` (or the
react/svelte equivalent); it auto-unmounts after each test, so mount in
`beforeEach`, never once per describe.

API selection:
- Type into inputs: `locator.fill('x')` (runs real beforeinput) or
  `userEvent.keyboard('x')` (per-key events). NEVER `element.value = 'x'`
  + dispatched input event — it skips beforeinput/validation entirely.
- Paste handlers: `source.tripleClick()` → `userEvent.copy()` →
  `target.click()` → `userEvent.paste()`. Real clipboard, real chords.
  NEVER hand-built ClipboardEvent unless testing IME or another gesture
  Playwright cannot produce.
- Wheel handlers: `locator.wheel({ delta: { y: 100 } })` (>= 4.1.0) —
  real hover + mouse wheel through hit-testing. Only for components that
  LISTEN to wheel; locator actions auto-scroll into view already.
- Scrolled-into-view: `await expect.element(el).toBeInViewport()`.
  NEVER spy on scrollIntoView.
- Selection: `await expect.element(input).toHaveSelection('text')`,
  not selectionStart/End reads.
- Formatted fields: `toHaveDisplayValue(formatted)` for what the user
  sees + `toHaveAttribute('aria-valuenow', n)` for AT.
- Accessible structure: `toMatchAriaInlineSnapshot` (>= 4.1.4) per
  interesting state; keep axe for rules/contrast. axe green ≠ correct:
  valid ARIA can describe the wrong state and axe won't see it.
- Focus traps: `userEvent.tab()` + assert where focus WENT, never
  synthetic Tab + `defaultPrevented`.
- Disabled elements: `locator.click({ force: true })` — skips the wait,
  not the gesture (real pointerdown, browser suppresses click itself).
- Drags: `locator.dropTo(target)` / `click({ position })`. NEVER
  dispatch PointerEvent with a made-up pointerId — Chromium throws
  NotFoundError from setPointerCapture.

Assertions and waiting:
- `expect.element(locator)` retries (50ms/1s default) and re-queries; a
  bare `locator.element()` is eager and retries nothing. A failing
  retrying matcher costs the FULL timeout (~15s).
- Locators are lazy: a bare `getBy*` asserts nothing. Use
  `await expect.element(...).toBeInTheDocument()`.
- Substring traps (v4): getByText, role `name` filters, and
  toHaveTextContent all match SUBSTRINGS. Pass `{ exact: true }` for
  data-driven strings; compare trimmed textContent exactly for values.
  (Vitest 5 makes exact the default.)
- Delete `await nextTick()` after awaited interactions; let
  `expect.element` own the wait. Keep a synchronous read when timing or
  instantaneity IS the contract, and never pre-settle it with a retry on
  the same condition.
- Keyboard goes to focus: click/focus first, then `userEvent.keyboard`.
  `{Enter}` needs a real key name in braces — `{19}` silently becomes
  insertText with NO key events; type real digits. Release every held
  modifier (`{Shift>}...{/Shift}`) — held state persists across tests.
  For handlers that read keyup or defer via setTimeout(0), use hold
  syntax: `{Key>}` + `await sleep(0)` + `{/Key}`.
- Fake timers work but freeze rAF and performance.now — never wait on
  positioning/animation under fake timers, or exclude rAF via `toFake`.

Keep synthetic (with a comment saying why): IME composition events,
keydown-on-disabled negatives, and mocks that CONSTRUCT the scenario
(e.g. RO firing twice when re-render count is the subject) rather than
compensate for a missing platform API.

Environment truths: a modal's `body { pointer-events: none }` really
makes everything outside unreachable (keyboard is exempt); a real click
hovers first (hover-open components open before mousedown); zero-size
elements (contentless headless primitives) cannot be clicked — measure
getBoundingClientRect before blaming the locator.
```

---

## Provenance

Every claim marked *measured* comes from giving reka-ui's complete 97-file original suite a
non-jsdom destination: 87 DOM-dependent files moved to Vitest Browser Mode and 10 DOM-free files
to Node, while the 1,444-test jsdom comparison corpus stayed runnable. The paired suites run side
by side with structural-parity, coverage-parity, and
mutation oracles guarding each ported file. The reference-quality 4.1-era patterns were folded
back into the canonical
[`NumberField.browser.test.ts`](packages/core/src/NumberField/NumberField.browser.test.ts)
rather than retained as a second "improved" copy. The
full field guide to the *migration* itself — config, CSS, oracles, and the
jsdom tests that turned out to be lying — is
[`MIGRATING-TO-BROWSER-MODE.md`](MIGRATING-TO-BROWSER-MODE.md); this post
deliberately assumes you're already in browser mode and covers only how to
test each thing well once you're there.
