// Visual stories use the same deterministic Tailwind fixture styles as the
// functional browser project, but do not need its axe matcher wiring.
import { icons as radixIcons } from '@iconify-json/radix-icons'
import { addAPIProvider, addCollection } from '@iconify/vue'
import { afterEach, beforeEach } from 'vitest'
import './vitest.browser.css'
// Registers `toBeNear` for the geometry assertions every sheet makes.
import './src/test/visual/matchers'

const resizeObserverWarning = 'ResizeObserver loop completed with undelivered notifications.'
const visualGlobal = globalThis as typeof globalThis & { __rekaUiVisualConsoleFilter?: true }
let unexpectedWindowErrors: unknown[]

if (!visualGlobal.__rekaUiVisualConsoleFilter) {
  const originalError = console.error.bind(console)
  console.error = (...args) => {
    if (args.length === 1 && args[0] instanceof Error && args[0].message === resizeObserverWarning)
      return
    originalError(...args)
  }
  visualGlobal.__rekaUiVisualConsoleFilter = true
}

function handleWindowError(event: ErrorEvent) {
  if (event.message === resizeObserverWarning) {
    event.preventDefault()
    event.stopImmediatePropagation()
    return
  }

  unexpectedWindowErrors.push(event.error ?? new Error(event.message))
}

beforeEach(() => {
  unexpectedWindowErrors = []
  // The ScrollArea story mounts several observer-driven tracks at once. Own
  // Chromium's standard "deliver the rest next frame" event here so it is not
  // forwarded a second time through console.error. Vitest 4.1.10 still prints
  // its own Vite-client diagnostic before applying onUnhandledError. Every
  // other window error is rethrown in afterEach, preserving the usual
  // fail-on-error contract.
  window.addEventListener('error', handleWindowError, { capture: true })
})

afterEach(() => {
  window.removeEventListener('error', handleWindowError, { capture: true })
  if (unexpectedWindowErrors.length)
    throw unexpectedWindowErrors[0]
})

// Every story icon is `radix-icons:*` through `@iconify/vue`, which otherwise
// fetches icon data from api.iconify.design at runtime — a network round trip
// whose timing decides whether the reference PNG has icons in it. Preload the
// whole set so `<Icon>` renders synchronously from storage on mount, and point
// the API at a dead host so an icon outside the set renders empty instead of
// quietly depending on the network.
addCollection(radixIcons)
addAPIProvider('', { resources: ['http://127.0.0.1:9'] })
