// Visual stories use the same deterministic Tailwind fixture styles as the
// functional browser project, but do not need its axe matcher wiring.
import { icons as radixIcons } from '@iconify-json/radix-icons'
import { addAPIProvider, addCollection } from '@iconify/vue'
import './vitest.browser.css'
// Registers `toBeNear` for the geometry assertions every sheet makes.
import './src/test/visual/matchers'

// Every story icon is `radix-icons:*` through `@iconify/vue`, which otherwise
// fetches icon data from api.iconify.design at runtime — a network round trip
// whose timing decides whether the reference PNG has icons in it. Preload the
// whole set so `<Icon>` renders synchronously from storage on mount, and point
// the API at a dead host so an icon outside the set renders empty instead of
// quietly depending on the network.
addCollection(radixIcons)
addAPIProvider('', { resources: ['http://127.0.0.1:9'] })
