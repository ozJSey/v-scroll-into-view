import { defineWorkspace } from 'vitest/config'
import { fileURLToPath } from 'node:url'

/**
 * Vitest projects:
 *
 *   - `vue-3.5` / `vue-floor-3.2.0` — same `vScrollIntoView.test.ts` and
 *     `playground.smoke.test.ts` run against both ends of the declared peer
 *     range: the default `^3.5.0` and the aliased `vue_floor`, pinned to the
 *     exact floor `vue@3.2.0`. The alias is pinned, not a caret: `^3.2.0`
 *     resolves to 3.5.x on a fresh install, which would make the low rung a
 *     copy of the high one.
 *
 *     What this pair proves: the source RUNS on the floor. `useScrollIntoView`
 *     calls `getCurrentScope()` / `onScopeDispose()`, so the rung reddens on
 *     anything older — measured, not assumed: aliased to 3.1.5 it fails 29 of
 *     its 167 tests (26 of 146 in `vScrollIntoView.test.ts`, 3 of 21 in the
 *     smoke file): 28 on `TypeError: getCurrentScope is not a function`, one on
 *     `effectScope`, which the test file imports and 3.2.0 also introduced.
 *
 *     What it does NOT prove, and what PEER-1 corrected the range over: that a
 *     consumer can IMPORT the package on a given Vue. Vitest's SSR transform
 *     rewrites named imports to property reads, so an export the linked Vue
 *     lacks arrives as `undefined` instead of throwing at link time — probed
 *     here: under the 3.2.0 rung a file doing `import { useTemplateRef } from
 *     'vue'` (a 3.5 API) loads anyway and logs `useTemplateRef=undefined`.
 *     `playground.smoke.test.ts:37` does exactly that import, and its 21 tests
 *     pass on this rung. A real `import` of the built ESM on 3.1.5 throws
 *     `SyntaxError: Named export 'getCurrentScope' not found` on the spot.
 *     Only installing the packed tarball against a floor-version Vue tests
 *     that, and no unit run here can stand in for it.
 *
 *   - `ssr-node` — runs `vScrollIntoView.ssr.test.ts` in `environment: 'node'`
 *     (no jsdom, no `window`, no `document`) to prove the library imports
 *     cleanly server-side and the plugin + composable handle the no-DOM
 *     case without throwing.
 */
export default defineWorkspace([
  {
    test: {
      name: 'vue-3.5',
      environment: 'jsdom',
      include: ['vScrollIntoView.test.ts', 'playground.smoke.test.ts'],
    },
  },
  {
    resolve: {
      alias: {
        vue: fileURLToPath(new URL('./node_modules/vue_floor/dist/vue.esm-bundler.js', import.meta.url)),
      },
    },
    test: {
      name: 'vue-floor-3.2.0',
      environment: 'jsdom',
      include: ['vScrollIntoView.test.ts', 'playground.smoke.test.ts'],
    },
  },
  {
    test: {
      name: 'ssr-node',
      environment: 'node',
      include: ['vScrollIntoView.ssr.test.ts'],
    },
  },
])
