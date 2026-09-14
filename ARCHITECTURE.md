# Architecture

`vScrollIntoView.ts` is the build entry; it re-exports `src/index.ts`. Each module has one purpose;
dependencies point strictly downward — no cycles.

```
vScrollIntoView.ts             entry — re-exports src/index
└── src/
    ├── index.ts               public surface: directive, plugin, composable, types
    ├── directive.ts           lifecycle wiring + its rAF scheduling (edge detection)
    ├── plugin.ts              ScrollIntoViewPlugin + DIRECTIVE_NAME
    ├── use-scroll-into-view.ts  useScrollIntoView — scroll()/cancel()/update()
    ├── execute-scroll.ts      THE scroll executor — composes the four below
    │   ├── geometry.ts        element rects → numbers in the container's scroll space
    │   ├── scroll-box.ts      those numbers + `offset` → a box and a viewing region
    │   ├── align.ts           box + region → where the scroll offset goes
    │   ├── scrollers.ts       the scrollers between the target and the pinned container
    │   └── pending-scroll.ts  where an in-flight smooth scroll is heading
    ├── resolve.ts             binding normalization, `behavior`, the four container forms
    ├── warn.ts                console warnings, latched once per element per message
    ├── state.ts               per-element WeakMap + data-scroll-into-view-state
    └── types.ts               public types + internal ResolvedOptions
```

The invariant that matters: **`execute-scroll.ts` is the only place a scroll happens.** The
directive and the composable are both thin schedulers over it — that is what killed the historical
`nearest + offset + container` drift, and splitting the file must never reintroduce a second copy.
It was violated for four months by `playground.html`, a hand-written miniature of the directive in
this same folder; that file was deleted in 1.3.0 rather than kept in sync, because nothing
(test, lint, or build) can detect a copy that does not import anything.

## Why the executor was split (1.3.0)

`execute-scroll.ts` used to own the arithmetic as well as the orchestration, and SIV-4 found three
divergences from native inside it at once. All three lived in the *conversion* from DOM into
numbers, not in the alignment rule — so the two now live in different files and can be wrong
independently:

- **`align.ts` is the rule, and it is DOM-free.** Four numbers in, one number or `null` out. It is
  CSSOM-View's *scroll a target into view* transcribed, and because it touches no DOM it can be
  checked by choosing the numbers.
- **`geometry.ts` is the conversion, and it is where the bugs were.** Three invariants are spelled
  out at the top of the file because each of them was broken:
  - **Origin.** `getBoundingClientRect()` reports the BORDER box; `scrollTop` and `clientHeight`
    are measured from the PADDING box. The difference is `clientTop`/`clientLeft` — which also
    carry the vertical scrollbar's width when it sits on the left, as it does in RTL. Every
    container scroll was off by the border width until 1.3.0.
  - **Space.** Rects are viewport pixels, scroll offsets are layout pixels. A `transform: scale()`
    above the container makes those different units. The ratio that measures it comes from
    `offsetWidth`, which is ROUNDED — so a difference of less than one layout pixel is rounding, not
    a transform, and is ignored (1.3.1).
  - **Precision.** `clientWidth` / `clientHeight` / `offsetWidth` / `offsetHeight` are the only
    rounded numbers the browser will give you here; everything else is fractional. Mixing the two
    put `center` a pixel off native on any pane whose width is not an integer — which is every pane
    sized by a `1fr` column or a percentage. The scrollport is derived from the rect instead (1.3.1).
  - **Direction, twice.** `start`/`end` are logical and resolve against the TARGET's computed
    `direction`; the sign of the container's `scrollLeft` range comes from the CONTAINER's. One
    flag for both jobs (1.3.0) broke every mixed-direction pane, and a `null` inline axis run
    through the resulting clamp broke vertical-only scrolls in them as well (1.3.1).

Three consequences of the executor's invariant are load-bearing:

- **The "does this element have a box?" test lives in the executor, above the path split**, so the
  `container` path and the native path answer a hidden target the same way (1.2.0).
- **`offset` is folded into the scroll box, never applied afterwards.** The pre-1.2.0 code
  subtracted it post-hoc and had to *infer* which branch `nearest` had taken — an inference that is
  wrong exactly when the target is the size of the scrolling box. Since 1.3.0 `offset` is a per-side
  override of CSS `scroll-margin`, which is what makes it produce the same answer on both paths.
- **`executeScroll` returns whether the request was SERVICED**, and the directive re-arms its edge
  when it was not. Nothing else can tell the scheduler that a scroll did not happen.

## What holds it to native

Not the unit tests. jsdom has no layout, so every number in `vScrollIntoView.test.ts` is one the
fixture was told — and a fixture can be told a lie: the old `makeContainer()` took rect,
clientHeight and scrollTop as three free numbers, could not express a border at all, and therefore
made the border defect undetectable while pinning 236 tests green.

The proof is two sweeps, both of which put this package and the browser's own `scrollIntoView` on
identical panes and compare them at an exact pixel:

- `playground/src/demos/v-scroll-into-view/15-parity-matrix.vue` — the vertical axis, 192
  geometries (border × padding × target size × offset × alignment × approach direction);
- `playground/src/demos/v-scroll-into-view/16-direction.vue` — the horizontal axis, 36 rows
  (pane `direction` × target `direction` × `inline` × both ends of the rail, plus a vertical-only
  row per direction pair). Card 15 pins `inline` to `'nearest'` on equal-width panes, so it could
  not see the direction defect SIV-6 found in the published 1.3.0 — nor the two sub-pixel ones the
  new sweep turned up on its own, which only appear on a pane whose width is not a whole number.

`playground/scripts/interactions/v-scroll-into-view.mjs` runs both headless.

Copy-paste consumers: every file under `src/` plus the entry is self-contained TypeScript with no
dependencies beyond the `vue` peer — take the folder as-is.
