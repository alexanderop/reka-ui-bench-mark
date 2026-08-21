/// <reference types="vite/client" />
/// <reference types="node" />

// The visual project's `env.d.ts`. It deliberately does not reference
// Histoire's `components.d.ts`: in this project `<Story>`/`<Variant>` *are*
// the stand-ins `defineHistoireStory` registers, so the story SFCs are
// type-checked against what actually renders them. (Histoire's own
// `StoryLayout` also rejects the `iframe` key three upstream grid stories
// pass, which Histoire ignores at runtime and upstream never type-checks.)
import type { StoryStandIn, VariantStandIn } from './src/test/visual/defineHistoireStory'

declare module 'vue' {
  export interface GlobalComponents {
    Story: typeof StoryStandIn
    Variant: typeof VariantStandIn
  }
}
