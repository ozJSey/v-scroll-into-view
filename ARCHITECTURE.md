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
    ├── execute-scroll.ts      THE scroll executor — container math + native path
    ├── resolve.ts             binding normalization + the four container forms
    ├── state.ts               per-element WeakMap + data-scroll-into-view-state
    └── types.ts               public types + internal ResolvedOptions
```

The invariant that matters: **`execute-scroll.ts` is the only place a scroll happens.** The
directive and the composable are both thin schedulers over it — that is what killed the historical
`nearest + offset + container` drift, and splitting the file must never reintroduce a second copy.

Two consequences of that invariant are load-bearing, both added in 1.2.0 after a browser audit
found them missing:

- **The "does this element have a box?" test lives in the executor, above the path split**, so the
  `container` path and the native path answer a hidden target the same way. It was previously only
  the browser's answer, on the one path that asked the browser.
- **`offset` is folded into `scrollFor`, never applied afterwards.** The old code subtracted the
  offset post-hoc and had to *infer* which branch `nearest` had taken by comparing the result back
  against the target's own position — an inference that is wrong exactly when the target is the
  size of the scrolling box, because the two alignments coincide there.

Copy-paste consumers: every file under `src/` plus the entry is self-contained TypeScript with no
dependencies beyond the `vue` peer — take the folder as-is.
