# Contributing to Reka UI

Thanks for your interest in improving Reka UI! This guide covers everything you
need to get a local checkout running, find your way around the monorepo, and
open a pull request that fits the project's conventions.

## Welcome & getting help

We would love your contributions — PRs for core components, docs, tests, and
stories are all welcome. The best place to ask questions or pair up is our
Discord: [chat.unovue.com](https://chat.unovue.com). Bugs and feature requests
belong in the [issue tracker](https://github.com/unovue/reka-ui/issues).

By participating you agree to abide by our [Code of Conduct](./CODE_OF_CONDUCT.md).

## Repository layout

This is a pnpm monorepo. The pieces you are most likely to touch:

| Path | What it is |
|---|---|
| `packages/core` | The published `reka-ui` package. All components and composables live in `src/`. |
| `packages/plugins` | Build-tool integration (auto-import resolver, Nuxt module). |
| `docs/` | The VitePress documentation site (its own workspace — install separately). |
| `playground/` | Local sandboxes for trying things out. |
| `.histoire/` | Histoire setup for the component stories. |

Inside `packages/core/src/`:

- One directory per **component family** (e.g. `Accordion/`, `Dialog/`,
  `Checkbox/` … through the date pickers).
- `shared/` — shared composables (`createContext`, `useForwardExpose`, the
  prop/emit forwarding helpers, typeahead, selection, etc.).
- `date/` — date/calendar utilities used by the date-family components.

## Getting started

**Prerequisites:** Node ≥ 22 and pnpm 10 (the repo pins `pnpm@10.13.1` via the
`packageManager` field; [Corepack](https://nodejs.org/api/corepack.html) will
pick this up automatically).

```bash
git clone --branch browserMode https://github.com/alexanderop/reka-ui-bench-mark.git
cd reka-ui-bench-mark
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
```

Recommended dev loops, depending on what you're working on:

- **Visual / interactive work** — `pnpm story:dev` opens Histoire with the
  component stories.
- **TDD on a component or composable** — `pnpm --filter reka-ui exec vitest <path>`
  runs that file in watch mode.
- **Testing against an external app** — `pnpm --filter reka-ui watch` rebuilds
  the package on change so a linked app sees your edits.

## Project commands

All commands run from the repo root.

| Task | Command |
|---|---|
| Install | `pnpm i` |
| Build core | `pnpm --filter reka-ui build` (vue-tsc type-check + tsdown bundle) |
| Watch build | `pnpm --filter reka-ui watch` |
| Type-check only | `pnpm --filter reka-ui type-check` |
| Tests (watch) | `pnpm test` |
| Tests (all projects, one-shot) | `pnpm --filter reka-ui exec vitest run` |
| Browser destination | `pnpm --filter reka-ui test:browser` |
| Retained jsdom comparison | `pnpm --filter reka-ui test:unit` |
| Cross-browser | `pnpm --filter reka-ui test:cross-browser` |
| Visual references | `pnpm --filter reka-ui test:visual` |
| Test coverage | `pnpm --filter reka-ui test:coverage` |
| Lint / auto-fix | `pnpm lint` / `pnpm lint:fix` |
| Stories | `pnpm story:dev` |
| Docs dev | `pnpm --filter reka-ui build && pnpm docs:install && pnpm docs:dev` |
| Docs API regen | `pnpm docs:gen` (regenerates `docs/content/meta/*.md`) |
| Bundle size | `pnpm --filter reka-ui size` |

> - `pnpm test` is **watch mode**. For a one-shot run (CI-style) use
>   `pnpm --filter reka-ui exec vitest run`.
> - The docs site needs `packages/core/dist` to exist — `docs/.vitepress/config.ts`
>   imports `reka-ui/dist/constant.js` through the workspace link. On a fresh
>   checkout run `pnpm --filter reka-ui build` first, or `pnpm docs:dev` fails
>   with `Cannot find module … /dist/constant.js`.

## Component architecture

A few patterns recur in every component family — learn them once and the rest of
the codebase reads the same way. `packages/core/src/Checkbox/` is a small,
complete example to read alongside this section.

- **Family folders & naming.** Components are Vue SFCs named
  `<Family><Part>.vue` — `CheckboxRoot.vue`, `CheckboxIndicator.vue`,
  `DialogRoot.vue`, `DialogContent.vue`, and so on. Each family has an
  `index.ts` re-exporting its parts and prop types, and every family is
  re-exported from `packages/core/src/index.ts` (the public surface).
- **Context.** State flows from a root to its descendants via
  `createContext('<ComponentName>')` (see
  `packages/core/src/shared/createContext.ts`). It returns
  `[injectContext, provideContext]` around a typed `InjectionKey`: the
  `*Root.vue` calls the provide function, descendants call inject.
- **Rendering.** Output goes through `Primitive`
  (`packages/core/src/Primitive`) which implements the `as` / `asChild` props
  (`asChild` merges props onto the consumer's own element instead of rendering
  a wrapper). Expose template refs with `useForwardExpose()`, and forward
  props/emits with `useForwardProps`, `useEmitAsProps`, or
  `useForwardPropsEmits` from `src/shared/`.

## Testing

- DOM-dependent contracts are colocated as paired `<Name>.test.ts` (retained jsdom comparison)
  and `<Name>.browser.test.ts` (the Chromium destination). The `describe` and `it` names stay
  identical so `port:parity` can check the pair mechanically.
- DOM-free files run in the `node` project. Do not send pure data transformations to either jsdom
  or a browser merely because the file historically used the unit setup.
- Browser tests render story fixtures with `vitest-browser-vue`, query through Vitest locators,
  and use trusted `userEvent` or locator input for ordinary interaction. The browser project has
  its own `vitest.browser.setup.ts`; it must not inherit jsdom's canvas, style, or DOM API patches.
- `vitest-axe` remains the general accessibility-rule oracle. ARIA snapshots and relation queries
  cover intended names, state, and cross-component semantics that axe cannot infer.
- The original jsdom setup and tests remain runnable intentionally. New DOM behavior belongs in
  Browser Mode; update a paired original only when preserving the comparison requires it.
- New components and composables should ship with colocated tests, including an
  axe check for anything that renders.

## Documentation

Each component has a page under `docs/content/`. The **API tables**
(props / emits / slots) are **auto-generated** — after changing a component's
public props, emits, or slots, run `pnpm docs:gen` and commit the regenerated
`docs/content/meta/*.md`. Never hand-edit those generated files.

## Commits & pull requests

- **Conventional Commits**, enforced by commitlint via a pre-commit hook
  (simple-git-hooks). The scope is the component family:
  `feat(Dialog): …`, `fix(shared): …`, `docs: …`, `ci: …`.
- **lint-staged** runs `eslint --fix` on staged files when you commit (the
  `@antfu/eslint-config` lints JSON / Markdown / YAML too — that's intentional).
- Open PRs against the default branch. CI runs build, tests, and bundle-size
  checks; please make sure they're green.

## Releases

Releasing is maintainer-only: versions are bumped with `pnpm bumpp` and
`reka-ui` is published from `packages/core` with npm provenance. As a
contributor you don't need to run anything release-related — just land
conventional commits and a maintainer will cut the release.
