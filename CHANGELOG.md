# Changelog

All notable changes to `v-scroll-into-view`.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[semver](https://semver.org/spec/v2.0.0.html). Entries before 1.2.0 are reconstructed from
`PROGRESS.md` and the source's own notes — this file starts at the point where the package began
keeping one, and says so rather than inventing detail it cannot source. **Their dates are work
dates, not release dates:** `registry.npmjs.org` holds only 1.2.0 (2026-09-13T13:52:57Z), 1.3.0
(2026-09-14T10:02:02Z) and 1.3.1 (2026-09-14T22:12:23Z) under the `@ozjsey` scope, and the unscoped
`v-scroll-into-view` name was never this package's. From 1.2.0 down, every heading date below is the
registry's publish time.

## [1.3.2] — 2026-09-17

A one-line `package.json` fix, and the line was a false statement about which Vue versions this
package runs on (PEER-1). Nothing in the runtime changed, and that is checked rather than
asserted: rebuilt from the HEAD source and from this one, `dist/vScrollIntoView.min.js` hashes
`55ab6573…` both times and `dist/vScrollIntoView.min.cjs` hashes `335ef6d7…` both times. The only
source edit is a comment, and the comment was wrong.

### Fixed

- **`peerDependencies.vue` said `^3.0.0`, and no 3.0.x or 3.1.x install of this package has ever
  worked.** It now says `^3.2.0`. This corrects a false claim — it withdraws no platform, because
  the platform it named was never reachable. `src/use-scroll-into-view.ts:6` imports
  `getCurrentScope` and `onScopeDispose`; both arrived in **Vue 3.2.0**. Measured against the
  published Vue packages rather than read out of a changelog:

  ```
  vue 3.0.11  getCurrentScope=undefined onScopeDispose=undefined effectScope=undefined
  vue 3.1.5   getCurrentScope=undefined onScopeDispose=undefined effectScope=undefined
  vue 3.2.0   getCurrentScope=function  onScopeDispose=function  effectScope=function
  ```

  What the old range bought a consumer, run against the 1.3.1 tarball npm serves today:

  ```
  $ npm install vue@3.1.5 @ozjsey/v-scroll-into-view@1.3.1
  added 15 packages in 288ms                       ← npm raises nothing
  $ node -e "import('@ozjsey/v-scroll-into-view')"
  SyntaxError: Named export 'getCurrentScope' not found.
  ```

  With `^3.2.0` the same install is refused up front — `npm error ERESOLVE ... peer vue@"^3.2.0"
  from @ozjsey/v-scroll-into-view@1.3.2` — instead of failing later at the import. Forced past that
  refusal with `--legacy-peer-deps`, 1.3.2 throws the same `SyntaxError`, which is the negative
  control for the floor: the range is now exactly as wide as the package.

  On the CJS entry the break is quieter and later: `require()` succeeds on 3.1.5 and the first
  `useScrollIntoView()` call throws `TypeError: (0 , g.getCurrentScope) is not a function`.

  Certified on the built tarball, not on the source tree: `vue@3.2.0` + `npm pack` output →
  `import` succeeds, exporting `DIRECTIVE_NAME, ScrollIntoViewPlugin, default, useScrollIntoView,
  vScrollIntoView`.

- **A comment in shipped source said `getCurrentScope()` is "available in Vue 3.0+".** It is not,
  and this source is read and copied more often than it is installed.
  `src/use-scroll-into-view.ts` now names 3.2.0 and says what was checked to get there.

### Changed

- **The Vue test matrix now runs the floor instead of a version above it.** The low rung was
  `vue3_3@3.3.13` while the API it was supposedly covering for landed in 3.2.0, so it could not
  have caught this. It is now `vue_floor`, pinned to exactly `vue@3.2.0` — pinned rather than
  `^3.2.0`, which a fresh install resolves to 3.5.x, quietly making the low rung a copy of the high
  one. The rung can fail: pointed at 3.1.5 it reddens 29 of its 167 tests — 26 of the 146 in
  `vScrollIntoView.test.ts` and 3 of the 21 in `playground.smoke.test.ts`, which are the cases that
  reach `useScrollIntoView`. 28 die on `TypeError: getCurrentScope is not a function`; the 29th on
  `TypeError: effectScope is not a function`, the test file's own `effectScope` import, which is a
  3.2.0 export too.
- **`vitest.workspace.ts` no longer claims that matrix proves the peer range.** It cannot: Vitest's
  SSR transform rewrites named imports to property reads, so an export the linked Vue lacks arrives
  as `undefined` rather than throwing. Probed on the 3.2.0 rung, a file doing
  `import { useTemplateRef } from 'vue'` — a 3.5 API absent from 3.2.0 — loaded anyway and logged
  `useTemplateRef=undefined`. That is not hypothetical here: `playground.smoke.test.ts:37` imports
  `useTemplateRef` and its 21 tests pass on the 3.2.0 rung. Only installing the packed tarball
  against a floor-version Vue tests importability, and the comment now says so.
- README states the floor in the Install section.

## [1.3.1] — 2026-09-14

A blind certification of the **published 1.3.0 tarball** (SIV-6) — the certifier unpacked it,
diffed it byte-for-byte against a fresh build of the source, and then ran ~2,400 rows of its own
parity sweeps against `Element.scrollIntoView()`. Four of the five sweeps came back with zero
divergences. The fifth, 384 rows of direction combinations, came back with 256.

This release is that defect, its regression half, the API trap that made the container path fall
back to native without saying so, and two sub-pixel divergences found while building the sweep that
now guards all of it.
`playground/src/demos/v-scroll-into-view/16-direction.vue` is new and is the horizontal counterpart
to card 15: two identical rails, one moved by this package and one by the browser, compared at
**exact** `scrollLeft` across pane `direction` × target `direction` × `inline`
`start|center|end|nearest` × both ends of the rail, plus one vertical-only row per direction pair.
36 rows, no tolerance.

### Fixed

- **A target whose `direction` differed from its container's broke the horizontal axis entirely.**
  Two different facts wear the same word, and 1.3.0 read one flag off the target and used it for
  both: WHICH physical edge `inline: 'start'` names (genuinely the target's — Chrome aligns the
  right edge of a `dir="rtl"` card even inside an LTR rail, and that is measured, not assumed) and
  THE SIGN of the container's `scrollLeft` range (genuinely the container's — an LTR scroller runs
  `0 … +max` whatever is written inside it). Mixing them clamped a positive destination into a
  negative range, which is `scrollLeft 0`, every alignment, every time. The realistic shape is this
  package's own headline use case: a horizontally scrollable LTR card rail whose items carry
  `dir="auto"` for user-generated text. Certified: LTR pane + RTL target 128/128 rows wrong, RTL
  pane + LTR target 128/128 wrong, matched directions 0/128. *Negative control: taking the clamp
  sign from the target again reddens 3 unit tests and 3 of the 36 sweep rows plus both single-row
  direction checks in the playground; matched-direction rows stay green.*
- **A vertical-only scroll moved the horizontal axis.** `inline` defaults to `'nearest'`, which
  computes `null` for a target that is already horizontally visible — and 1.3.0 ran that `null`
  through the clamp anyway (`clamp(left ?? container.scrollLeft, …)`), rewriting a coordinate
  nobody had asked about. Measured against the published artifact with a `dir="rtl"` target: a pane
  at `scrollLeft 650` went to 0, where 1.2.0 and native both stayed at 650 — strictly worse than
  the version it replaced. An axis that computes `null` is now passed through untouched, and
  reports zero movement to the scroller outside it. *Negative control: re-clamping it reddens the
  sub-pixel pass-through test.*
- **A pane whose width was not a whole number of pixels was treated as if it were scaled.**
  `offsetWidth` / `offsetHeight` are rounded to whole pixels and `getBoundingClientRect()` is not,
  so a pane sized by a `1fr` grid column — 463.40625px — produced a scale ratio of 1.00088 with no
  transform anywhere on the page. The ratio divides `rel`, so the error was proportional to how far
  into the content the target sat: measured on a 960px rail, 1px short of native for a target 600px
  in. A difference of less than one layout pixel is now read as rounding rather than as a
  transform; a real `scale(0.5)` is 200px away from that threshold. Found by the new direction
  sweep, which is the first parity sweep here to run on a pane whose width is not an integer.
- **The scrollport was measured with `clientWidth` / `clientHeight`, which are rounded.** Every
  other input to the arithmetic is fractional, so the rounding landed in `portEnd` — and on
  `center`, where it is halved, it was enough to put a destination of 429.5 on the other side of a
  rounding boundary from the browser's 429.3. The scrollport is now derived from the rect minus the
  computed borders and the scrollbar, which is exact. *Negative control for both of the above:
  restoring either one reddens the same unit test, and 4 of the 36 sweep rows — all of them
  `center`, all of them by 1px.*

### Changed

- **`ContainerRef` admits `null`.** `container: paneRef.value` is the spelling everyone reaches for
  and TypeScript rejected it, because a template ref is `HTMLElement | null` and the union had no
  `null` arm. The spelling that compiled instead — `container: paneRef.value ?? undefined` — is the
  wrong one: `undefined` means "no container", so on the mount-time scroll (the binding is computed
  while the host renders, before the parent assigns the ref) the directive took the **native** path
  and moved every scrollable ancestor, the page included. That is the one thing `container` exists
  to prevent, and it was silent. `null` now type-checks and behaves: nothing scrolls, no fallback,
  one warning. **The form to reach for is still the getter** — `container: () => paneRef.value` —
  which is resolved at scroll time and is what the README now leads with.
- **A `container` key whose value is `undefined` now warns.** It still falls back to native, because
  `undefined` is how JavaScript spells "absent" and changing that in a patch would break code that
  deliberately writes `container: enabled ? pane : undefined`. But it is no longer silent about
  having done so. Omitting the key entirely is unchanged and unwarned.
- **Warnings latch per element, not globally per message.** One `Set` of strings for the whole
  session meant the first element to reach a sentence spent it for every element after it: an
  identical misconfiguration on an unrelated row produced nothing, and a single false alarm
  disarmed every other message too. Each element now says each sentence once. Identical strings are
  what a console groups, so a `v-for` of broken rows collapses behind a repeat badge rather than
  being silently dropped.
- **"`container` has no scrollable overflow" fires on the `overflow` style, not on the current
  content.** A chat pane with `overflow-y: auto` and two messages in it is correctly configured and
  simply not full yet — the package's own `always` demo tripped this warning at page load, on a
  perfectly good card, and thereby spent the global latch before anything real could use it. Only an
  `overflow` that can never scroll is warned about now.
- **`container: 'body'` gets its own sentence.** The generic warning was wrong about it: `<body>`
  usually does overflow, it is simply not the thing that scrolls. The message now names the document
  element, and `container: 'html'` is exempt from the warning entirely.

## [1.3.0] — 2026-09-14

The `container` path is the only reason to install this over native `scrollIntoView`, and it was
the part that disagreed with native. A blind re-audit (SIV-4) measured three divergences **in the
paths the 1.2.0 audit had just fixed**, and the card built to prove native parity — card 12, whose
own prose says "the two panes must land on the same pixel" — was printing all three and calling
them parity, because its assertion was `<= 2` and the largest of the three was 1px.

Everything below is measured against the browser rather than against a number someone chose.
`playground/src/demos/v-scroll-into-view/15-parity-matrix.vue` is new and is the reason to trust
this release: two identical panes, one moved by this package and one by `Element.scrollIntoView()`,
compared at **exact** `scrollTop` across 192 geometries — container border `0/1/10px` × padding
`0/20px` × target `40/400px` × gap `none/60px` × `block` `start|center|end|nearest` × approached
from above or below. Each fix was negative-controlled individually against that sweep: the old
behaviour restored, the sweep confirmed red on a nameable subset and green everywhere else, the fix
put back.

### Fixed

- **Every container scroll was off by the container's border width.** `getBoundingClientRect()`
  reports the BORDER box; `scrollTop` and `clientHeight` are measured from the PADDING box. The gap
  between the two origins is `clientTop` / `clientLeft`, and it appeared nowhere in the package, so
  the error was the border width — always, on every alignment, on every target, and on `nearest`'s
  in-view test. 1px in every pane in the playground, which is a hairline clip on `block: 'start'`
  and a visible slice at 4px. Padding was never affected, and the sweep keeps it as the control.
  *Negative control: dropping `clientTop`/`clientLeft` again reddens 120 of the 192 rows, all of
  them bordered, every delta exactly the border width; the 72 unbordered rows stay green.*
- **`block: 'nearest'` disagreed with native by a full pane height for an oversized target
  approached from below.** 1.2.0 fixed the from-above case and generalised it into a rule CSSOM-View
  does not have: "a target taller than the pane aligns its top". The spec's rule is the same
  minimum-distance rule as everywhere else — scroll **down** to reach an oversized target and its
  top aligns, scroll **up** to reach it and its bottom does. Measured on card 12 at `size = 400`,
  `from = below`: directive `scrollTop` 229 against native 430. *Negative control: restoring the
  1.2.0 rule reddens 12 rows, every one of them `nearest` on the 400px target, deltas ±200 and
  ±160 — a pane height, and a pane height less its padding.*
- **`offset.top` applied to `center` and `end` on the container path only.** The container-less
  path implements `offset` as an inline `scroll-margin-top`, and CSS applies that fully to
  `'start'`, half to `'center'` and not at all to `'end'` — while the container path subtracted it
  bluntly from all three. A chat pane with a sticky header and a global `offset: { top: 64 }`
  pinned with `block: 'end'` therefore rested 64px above the bottom, and the same options without
  `container` rested on it. The two now agree. *Negative control: restoring the blunt subtraction
  reddens 54 rows, every one of them with a gap set, `center` by half of it and `end` by all of it;
  every gap-free row stays green.*
- **A scroll that could not happen still spent the edge that asked for it.** `updated()` recorded
  the condition as consumed and then queued a frame that could decline to scroll — a target with no
  layout box, a `container` behind a `v-if` that resolves a tick later. While the condition stayed
  true no later update was a `false` → `true` transition, so the element never scrolled again for
  the life of the component. `executeScroll` now reports whether the request was serviced and the
  directive re-arms the edge when it was not. Deciding a `nearest` target is already in view is not
  a refusal and still spends the edge.
- **A scroller between the target and the pinned container was never scrolled.** `container` means
  "this is the outermost thing I want moved"; it was behaving as "ignore the panes inside it", so an
  inner pane scrolled away kept the target invisible while the outer pane reported success. Every
  scroller between target and container is now scrolled too, innermost first, as native
  `scrollIntoView` walks the chain.
- **`nearest` judged visibility against a scroll position that had not arrived.** With
  `behavior: 'smooth'` and `block: 'nearest'` — both defaults — a previous scroll still animating
  meant `container.scrollTop` was a moving coordinate. Judged against it the new target often read
  as already visible, so the request was answered with "nothing to do" and the OLD animation
  carried on to a destination computed for a different target. Held-arrow-key navigation walked the
  active row off the screen, differently every time. The container path now decides against where
  each scroller is *going*, and forgets that destination on `scrollend` — including the `scrollend`
  the browser fires when the user grabs the scrollbar. Where `scrollend` is unimplemented, nothing
  is remembered and the previous live-position behaviour stands.
- **`prefers-reduced-motion` was read on every update of every bound element.** Three separate
  places said it was "read at scroll time"; it was read in `resolveBinding`, which runs on every
  `mounted`/`updated` of every host — 40 media queries per keypress on a 40-row list, 1000 per
  re-render on a virtualised table — for a value only consulted by the one row that actually
  scrolls. It is now resolved in the frame the scroll happens, by `behaviorFor`.
- **`useScrollIntoView` accepted `condition` and `always` and ignored them.**
  `useScrollIntoView({ options: { condition: false } }).scroll()` scrolled, with full TypeScript
  approval. The composable's options are now a named type that excludes both.

### Added

- **The `container` path reads CSS `scroll-margin` and `scroll-padding`** (SIV-2, decided in favour
  of converging). A global `scroll-margin-top: 64px` for a sticky header used to stop working the
  moment you added `container`; it now opens the same gap on both paths. The container path also
  divides out any `transform: scale()` / `zoom` between target and container, and resolves
  `inline: 'start'` against the target's computed `direction`, so RTL lists align the right edge
  and negative `scrollLeft` is handled.
- **One-shot console warnings for a misconfigured `container`.** Setting `container` opts out of
  native `scrollIntoView` with no fallback, so every way of getting it wrong used to produce
  silence — the hardest bug to search for. A container that resolves to `null` or a detached
  element, one that is not an ancestor of the host (which is what a plain `document.querySelector`
  gives you for every row in a `v-for` of panes — the warning names `:scope`), one with no
  scrollable overflow, and a host in a vertical writing mode each say so once.
- **`ContainerRef` and `UseScrollIntoViewOptions` are exported.** `ContainerRef` describes the whole
  `container` feature and was exported from `types.ts` but dropped by the barrel, so consumers
  hand-copied the union.
- **Playground card 15, the parity sweep** described above, and exact-`scrollTop` checks on cards 12
  and 13 in place of the `<= 2` tolerance that was wider than the defect it was written to catch.

### Changed

- **`offset` is now defined as a per-side override of the target's CSS `scroll-margin`**, on both
  paths. `offset: { top: 0 }` therefore *removes* a stylesheet's `scroll-margin-top` for the
  duration of the scroll rather than doing nothing — the same thing the native path has always
  done, now true of the container path too. Omit the key to leave the CSS alone.
- **`block: 'end'` with `offset.top` no longer opens a gap at the bottom** (see Fixed). If you were
  relying on that gap, it was never the native answer; use `scroll-margin-bottom`, which the
  container path now reads.
- Card 12's blurb, its tags and the README's alignment section asserted that an oversized target
  always aligns its top. They now say what the browser does, and card 12 prints a Δ line so the
  parity claim is one number rather than two readouts to subtract.
- The executor was split into `geometry.ts`, `scroll-box.ts`, `align.ts`, `scrollers.ts` and
  `pending-scroll.ts`. All three SIV-4 defects were in the conversion from DOM into numbers rather
  than in the alignment rule, so the rule now lives in a DOM-free leaf module and the conversion
  lives somewhere it can be wrong on its own. See ARCHITECTURE.md.

### Removed

- **`playground.html`** (SIV-3). It carried a hand-written miniature of the directive — no
  `container`, no `offset`, pre-1.2.0 `nearest` — in the same folder as the real source, which is
  the one thing ARCHITECTURE.md's invariant forbids, and its comment had claimed "same logic as the
  package". Nothing could keep it honest, because a copy that imports nothing cannot be detected by
  a test, a lint rule or the build. The exhibit is the shared playground, which compiles this
  package's actual source.
- The `!stateMap.has(el)` guard in the directive's rAF callback, and the test that named it.
  `cancelAnimationFrame` is specified to remove the callback, so the state it defended against is
  not reachable — and the test never reached it either: the mocked cancel had already emptied the
  queue, so both of its assertions passed vacuously.

### Tests

272 → 320. The container fixture was the thing that made the border defect undetectable: it took
rect, `clientHeight` and `scrollTop` as three free numbers, so it could describe a geometry no
element can have, and could not express a border at all. It now derives the border box from the
scrollport and the border width, and reports `clientTop`, `scrollHeight` and `offsetHeight` to
match. The new cases cover the border, the scale factor, RTL, `scroll-margin`, `scroll-padding`
(including percentages), the scroller chain, the re-armed edge, each warning, and the in-flight
destination.

## [1.2.0] — 2026-09-13

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
