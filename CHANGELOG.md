# Changelog

All notable changes to `v-scroll-into-view`.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[semver](https://semver.org/spec/v2.0.0.html). Entries before 1.2.0 are reconstructed from
`PROGRESS.md` and the source's own notes — this file starts at the point where the package began
keeping one, and says so rather than inventing detail it cannot source.

## [1.2.0] — 2026-09-07

Three defects found by an independent audit that drove the library in a real browser and in a
clean Vite consumer app. All three were invisible to the 236 unit tests because jsdom implements
no layout: every element reports the same all-zero rect there, so a hidden target and a rendered
one are indistinguishable, and a 400px target in a 200px pane is the same nothing as a 40px one.

Each fix is pinned twice — by unit tests against mocked rects, and by a browser check in
`playground/scripts/interactions/v-scroll-into-view.mjs` that reads the resulting scroll position
back out of the live DOM. Every browser check was verified with a negative control: the old
behaviour restored, the check confirmed red, the fix put back.

### Fixed

- **A hidden target with `container` scrolled the pane to the top.** An element with no layout box
  (`v-show="false"`, `display: none`, `display: contents`, detached) reports a 0×0 rect at (0, 0);
  the container path fed that to its arithmetic, produced a large negative offset, and
  `scrollTo` clamped it to 0. Measured in Chrome: `scrollTop` 300 → 0, while the container-less
  path on the same markup correctly stayed at 300. Both paths now return early for an element with
  no box, which is what native `scrollIntoView` does.
- **`block: 'nearest'` (the default) scrolled the wrong way for a target taller than its
  container.** A 400px target in a 200px pane landed with its top 220px above the pane — showing
  its bottom — where native `scrollIntoView({ block: 'nearest' })` shows its top. `nearest` now
  aligns the far edge only when the target is small enough for that to reveal its near edge too,
  and treats a target already covering the whole scrolling box as a no-op. Verified by running the
  directive and native `scrollIntoView` on two identical panes and comparing.
- **`block: 'nearest'` + `offset` clipped a target the exact height of its container.** A 200px
  target in a 200px pane with `offset: { top: 40 }` landed at top 40 / bottom 240 — 40px below the
  fold — when top 0 was available. The offset was applied post-hoc, which forced the code to infer
  which alignment `nearest` had chosen by comparing the result back against the target's position;
  that inference is wrong exactly when the target is the size of the pane, because the two
  alignments coincide there. `offset` is now folded into the alignment itself, and on `nearest` the
  gap is honoured only while the target still fits in what it leaves behind.

### Changed

- **The default `behavior` honours `prefers-reduced-motion`.** It resolves to `'instant'` when the
  user has asked their operating system for reduced motion, and stays `'smooth'` otherwise. An
  explicit `behavior` is passed through untouched — `{ behavior: 'smooth' }` still animates,
  because that is the consumer's call, not the library's default overriding an accessibility
  preference. Previously a default nobody chose animated across ~24 distinct positions with reduce
  emulated.

### Documented

- **Pairing with `focus()` voids the directive.** `focus()` scrolls the element into view
  synchronously on the browser's own rules, before the directive's frame; `nearest` then correctly
  finds nothing to do, so the browser decides where you land — measured 80+px away from what
  `block` / `offset` asked for. `focus({ preventScroll: true })` is the fix; ordering is not.
- **CSS `scroll-margin-*` is a native-path feature.** `getBoundingClientRect()` does not include
  scroll margins, so a sticky-header `scroll-margin-top` opens its gap without a `container` and is
  silently ignored with one. Mirror it with `offset`.
- The `README`'s "full native API parity" claim is now a scoped statement of which rules match and
  which two deliberately do not.
- The `v-for` recipe could not scroll when pasted (five 40px rows in a 200px box) and its
  `activeIndex++` walked off the end of the list. It now overflows and wraps.
- `useScrollIntoView`'s `state` is `'pending'` for one frame, so a Cancel button gated on it is
  disabled essentially always. `cancel()` is for code that supersedes a queued scroll.

### Playground

Five new cards, closing the gap that let all of this through: **no card exercised the bare binding
or the container-less native path**, so the default configuration was never demonstrated.
`10-native-path.vue`, `11-hidden-target.vue`, `12-nearest-oversized.vue` (directive vs native, side
by side), `13-scroll-margin.vue`, `14-focus.vue` — plus the tab's first interaction spec, 16 checks
over 8 cards.

## [1.1.0] — 2026-05-16

- `ScrollIntoViewOptions` renamed to `VScrollIntoViewOptions` to avoid the namespace collision with
  the browser's own `ScrollIntoViewOptions` from `lib.dom.d.ts`. The old name remains exported as a
  deprecated alias; removal is planned for 2.0.0.
- `useScrollIntoView` and the directive were unified behind one `executeScroll`, fixing a drift
  where the composable's `nearest + offset + container` path ignored the offset when deciding
  whether the target was already visible.
- `resolveContainer` no longer lets a malformed CSS selector (`''`, `'>>>'`, `':scope @@'`) throw a
  `DOMException` into the render cycle; resolution failure is a silent no-op, as documented.
- `src/` split into single-purpose modules behind a thin entry, with `ARCHITECTURE.md`.

## [1.0.0]

Initial implementation: the directive with edge detection, `container`, `offset`, `always`, the
`ScrollIntoViewPlugin` install path, the `useScrollIntoView` composable, and the
`data-scroll-into-view-state` CSS hook. No changelog was kept at the time; this entry names the
surface, not the sequence.
