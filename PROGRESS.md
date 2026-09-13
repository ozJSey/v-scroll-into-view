# v-scroll-into-view — PROGRESS

Per-package run log. Newest first. See `/PROGRESS.md` at repo root for the cross-package coordinator.

---

## 2026-05-16 — Run 13: audit fixes + executeScroll refactor + 16 new tests

**Picked task:** Cross-package CRON loop selected this package (top of root `TASKS.md` P1 frontier: complete audit + edge cases + first publish prep).

**Audit findings (3 parallel agents):**
- **Architect — CRITICAL:** Directive's `doScroll` (lines 204-205 prior) called `scrollFor()` with `offsetStart`, but composable's `scroll()` (lines 447-448 prior) did NOT. `useScrollIntoView({ container, block: 'nearest', offset: { top: 64 } })` silently broke sticky-header semantics — visibility check used full container viewport instead of shrinking by offset. Field bug class: anyone using the composable for chat panes / modal lists with `nearest` + offset would scroll incorrectly.
- **Architect — HIGH:** `resolveContainer()` called `document.querySelector(ref)` and `el.closest(remaining)` without try-catch. Empty string / malformed selector (`'>>>'`, `':scope @@'`) → unhandled `DOMException` propagating up the render cycle, contradicting the documented "silent no-op" contract.
- **OSS lead — LOW:** `LICENSE` copyright year `2025` should be `2026` (sibling `v-trap-focus` ships 2026).
- **All three — design debt:** The directive's `doScroll` rAF body and composable's `scroll()` rAF body were ~50 lines of copy-pasted code. The drift class existed *because* they were duplicated.

**What I shipped (TDD):**

**Tests (16 new, all initially failing for the bug fixes; passing for the regression pins):**
- `composable parity with directive (nearest+offset+container)` — 4 tests:
  - `nearest + offset.top + container — target obscured` (FAILED → fix)
  - `inline: nearest + offset.left + container — target obscured` (FAILED → fix)
  - `nearest + offset.top + container — target NOT obscured: no scroll` (passed; regression pin)
  - `start + offset.top + container — final scrollTop matches directive` (passed; regression pin)
- `malformed selectors (resolveContainer hardening)` — 5 tests:
  - `container: ""` directive (FAILED → fix)
  - `container: ">>>"` directive (FAILED → fix)
  - `container: ":scope >>>"` directive (FAILED → fix)
  - composable container `""` (FAILED → fix)
  - composable container `":scope @@"` (FAILED → fix)
- `teardown races + plugin idempotence` — 7 tests:
  - rAF cb resilient after unmount (the `stateMap.has(el)` guard)
  - rapid condition flips `false→true→false→true` within one frame coalesce to one scroll
  - plugin double-install on same app (Vue's `_installedPlugins` guard fires; warning asserted)
  - two independent apps install plugin separately (isolated `_context`)
  - `always: true` + rapid flips coalesce per rAF
  - composable: `scroll()` + `cancel()` + `scroll()` within same tick → final scroll fires
  - composable: `update()` between `scroll()` and rAF flush → snapshot semantics (in-flight call unaffected; next call merged)

**Source changes:**
- `vScrollIntoView.ts` — extracted `executeScroll(el, opts)` containing the entire container-path (`resolveContainer` + relative-rect math + `scrollFor` with `offsetStart` + post-hoc subtraction for `start/end/center` + nearest leading-edge subtraction + `container.scrollTo`) AND native path (ephemeral `scrollMarginTop/Left` write-then-restore wrapped around `el.scrollIntoView`).
- `doScroll()` now wraps `executeScroll` in the directive's WeakMap-tracked rAF + state attribute toggle.
- Composable's `scroll()` now wraps `executeScroll` in its own rAF + `state` ref toggle.
- **Net source SHRANK ~50 lines** — single source of truth means future changes can't drift.
- Defensive `if (!stateMap.has(el)) return` added at the start of the directive's rAF cb — if `unmounted()` raced ahead of `cancelAnimationFrame` (heavy-load browsers may queue the cb before seeing the cancel), the cb bails cleanly rather than re-setting the state attribute on a detached element.
- `resolveContainer()` now try-catches BOTH `document.querySelector` and `el.closest`; early `if (!ref) return null` for empty-string inputs.

**Other:**
- `LICENSE` — 2025 → 2026.
- `README.md` — added "Malformed selectors" paragraph in the Custom scroll container section documenting the silent-no-op guarantee for empty / invalid CSS selectors.

**Verification:**
- `npx vitest run` → **236/236 green** (was 204/204) across `vue-3.5`, `vue-3.3`, `ssr-node`, playground × 2; 550ms total.
- `npm run build` → 6 dist artifacts: `vScrollIntoView.min.js` **3.5 KB** (was 4.2 KB) / `vScrollIntoView.min.cjs` **4.0 KB** (was 4.8 KB) / `vScrollIntoView.d.ts` 5.87 KB / sourcemaps + `.d.cts`.
- `gzip -c dist/vScrollIntoView.min.js | wc -c` → **1411 bytes** (was ~1600). Refactoring shrunk the bundle.
- `npm pack --dry-run` → 9-file tarball, 17.9 kB packed / 83.6 kB unpacked. LICENSE + README + package.json + 6 dist artifacts. No source/test/playground leakage.
- ESM + CJS smoke: both expose `['DIRECTIVE_NAME', 'ScrollIntoViewPlugin', 'default', 'useScrollIntoView', 'vScrollIntoView']`.

**Reachability:**
- Composable parity fix: any consumer using `useScrollIntoView({ container, block: 'nearest', offset })` silently benefits without API change. 4 tests pin the parity going forward.
- Malformed-selector hardening: README "Custom scroll container" section now explicitly documents the silent-no-op contract for empty / invalid CSS selectors. 5 tests cover the failure modes.
- rAF-after-unmount guard: invisible safety net; protects against state attribute resurrection after `unmounted()` cleared it.
- Plugin double-install: README already documents `app.use(ScrollIntoViewPlugin)` as the recommended path; new test pins Vue's `[Vue warn]: Plugin has already been applied to target app.` console output as the visible affordance for misuse.

**Status after this run:** Publish-ready. Surface API stable. Test coverage rigorous (236 tests). Bundle compact (3.5 KB / 1.4 KB gz). Tarball clean. Open question for next runs: tag v1.1.0 + first `npm publish`.

---
