# @ozjsey/v-scroll-into-view

**See it live: [ozjsey.github.io/npm-portfolio-playground#v-scroll-into-view](https://ozjsey.github.io/npm-portfolio-playground/#v-scroll-into-view)** — fifteen cards, every one editable in the browser.

Straight to a card: [the parity sweep](https://ozjsey.github.io/npm-portfolio-playground/#v-scroll-into-view/parity-matrix) ·
[custom container](https://ozjsey.github.io/npm-portfolio-playground/#v-scroll-into-view/container) · [sticky-header offset](https://ozjsey.github.io/npm-portfolio-playground/#v-scroll-into-view/offset) ·
[alignment](https://ozjsey.github.io/npm-portfolio-playground/#v-scroll-into-view/alignment) · [`useScrollIntoView`](https://ozjsey.github.io/npm-portfolio-playground/#v-scroll-into-view/composable) ·
[the state attribute](https://ozjsey.github.io/npm-portfolio-playground/#v-scroll-into-view/state-attribute).

## Playground

[**The parity sweep**](https://ozjsey.github.io/npm-portfolio-playground/#v-scroll-into-view/parity-matrix) is the one to open first if you are deciding whether to
trust this over native `scrollIntoView`: it sweeps the `container` path against the browser's own
`scrollIntoView` on an identical pane across 192 geometries — border, padding, target size, offset,
alignment, and which side the target is approached from — and prints one number. Source:
[npm-portfolio-playground](https://github.com/ozJSey/npm-portfolio-playground).

[![npm](https://img.shields.io/npm/v/@ozjsey/v-scroll-into-view)](https://www.npmjs.com/package/@ozjsey/v-scroll-into-view)

## Reactive scroll-into-view for Vue 3 — with custom containers and sticky-header offsets

A Vue 3 directive that calls `Element.scrollIntoView()` when a boolean condition transitions from `false` to `true`. Ships with a composable, a plugin install path, a CSS state hook, and first-class support for custom scroll containers and sticky-header offsets.

## Features

- Edge detection: scrolls only on `false` → `true` transitions (not on every re-render)
- `condition` boolean, options object, or bare `<div v-scroll-into-view>`
- Configurable `behavior` (`'smooth' | 'instant' | 'auto'`), `block`, `inline` — the native alignment rules, `nearest` included, applied to the container you pick, and **held to the browser's own answer across a 192-geometry sweep** rather than to numbers someone chose
- The `container` path reads what the browser reads: the target's CSS `scroll-margin`, the scroller's `scroll-padding`, its `clientTop`/`clientLeft` border, and any `transform: scale()` above it
- Honours `prefers-reduced-motion`: the **default** `behavior` resolves to `'instant'` when the user has asked for less motion. An explicit `behavior` is never overridden
- A target with no layout box (`v-show="false"`, `display: none`, detached) is a no-op on both paths — the scroller stays where the user left it
- `always` to re-scroll on every truthy update
- **Custom scroll container** — pick a specific ancestor (chat pane, modal list, virtualized scroller) as the OUTERMOST thing that moves. Scrollers between it and the target are still scrolled, as native does, so an inner pane cannot leave the target invisible while the outer one reports success
- **Sticky-header offset** — `offset` is a per-side override of the target's CSS `scroll-margin`, and means the same thing on both paths
- **`ScrollIntoViewPlugin`** for `app.use(...)` install
- **`useScrollIntoView` composable** for imperative scrolling outside templates
- **`data-scroll-into-view-state`** attribute for CSS transitions (`'idle' | 'pending'`)
- Uses `requestAnimationFrame` so layout is ready before scrolling; coalesces repeated calls
- Cancels pending scroll on unmount / scope dispose — no stale callbacks
- Dual ESM + CJS build; full TypeScript declarations
- Tree-shakable (`"sideEffects": false`); zero runtime dependencies

## Install

```bash
npm install @ozjsey/v-scroll-into-view
```

Vue 3 is a peer dependency — it won't be bundled.

## Register

**Recommended — `app.use(ScrollIntoViewPlugin)`:**

```ts
import { createApp } from "vue";
import { ScrollIntoViewPlugin } from "@ozjsey/v-scroll-into-view";
import App from "./App.vue";

createApp(App).use(ScrollIntoViewPlugin).mount("#app");
```

This registers the directive globally as `v-scroll-into-view`. Mirrors the pattern used by `TrapFocusPlugin` / `TeleportToPlugin`.

**Local (per-component):**

```vue
<script setup lang="ts">
import { vScrollIntoView } from "@ozjsey/v-scroll-into-view";
</script>
```

Vue auto-registers the variable as `v-scroll-into-view` because the name starts with `v`.

**Direct registration with a custom name:**

```ts
import { vScrollIntoView, DIRECTIVE_NAME } from "@ozjsey/v-scroll-into-view";
app.directive(DIRECTIVE_NAME, vScrollIntoView); // "scroll-into-view"
```

## Usage

### Boolean value

```vue
<div v-scroll-into-view="isActive">...</div>
```

Scrolls when `isActive` transitions from `false` to `true`. Does nothing when it stays `true` or becomes `false`.

### Object value

```vue
<div v-scroll-into-view="{ condition: isActive, behavior: 'instant', block: 'center' }">
  ...
</div>
```

### Bare directive (scroll on mount)

```vue
<div v-scroll-into-view>...</div>
```

Equivalent to `v-scroll-into-view="true"` — scrolls the element into view as soon as it mounts.

### `v-for` — scroll the active item

```vue
<script setup lang="ts">
import { ref } from "vue";
import { vScrollIntoView } from "@ozjsey/v-scroll-into-view";

// Enough rows to overflow the box — five 40px rows in a 200px box do not
// scroll, and a directive with nowhere to go looks exactly like a broken one.
const items = ref(Array.from({ length: 24 }, (_, i) => `Item ${i + 1}`));
const activeIndex = ref(0);

function next() {
  activeIndex.value = (activeIndex.value + 1) % items.value.length; // wraps
}
</script>

<template>
  <div id="list" style="height: 200px; overflow-y: auto">
    <div
      v-for="(item, i) in items"
      :key="item"
      style="height: 40px"
      v-scroll-into-view="{ condition: i === activeIndex, container: '#list' }"
    >
      {{ item }}
    </div>
  </div>
  <button @click="next">Next</button>
</template>
```

Only the element whose condition transitions to `true` will scroll — the rest are ignored.

### Anchor-link navigation (table of contents)

```vue
<script setup lang="ts">
import { ref } from "vue";
import { vScrollIntoView } from "@ozjsey/v-scroll-into-view";

const activeId = ref<string | null>(null);
const sections = [
  { id: "intro", label: "Introduction" },
  { id: "install", label: "Install" },
  { id: "api", label: "API" },
];

function goto(id: string) {
  activeId.value = id;
  // Reset on next frame so the next click on the same link still scrolls.
  requestAnimationFrame(() => (activeId.value = null));
}
</script>

<template>
  <nav>
    <a v-for="s in sections" :key="s.id" @click.prevent="goto(s.id)">
      {{ s.label }}
    </a>
  </nav>

  <section
    v-for="s in sections"
    :key="s.id"
    :id="s.id"
    v-scroll-into-view="{
      condition: s.id === activeId,
      block: 'start',
      offset: { top: 64 },
    }"
  >
    <h2>{{ s.label }}</h2>
    <!-- ... -->
  </section>
</template>
```

The `offset.top: 64` leaves a gap so the section heading doesn't slide under a sticky header.

This recipe depends on one thing worth naming, because it looks like an accident: a condition that
goes `true` and back to `false` inside a single frame **still scrolls**. The rising edge queues the
frame; withdrawing the condition does not cancel it. That is deliberate — the reset is what lets a
second click on the same link scroll again — and it is pinned by a test, so a future "cancel the
pending scroll when the condition goes false" cleanup fails loudly rather than quietly breaking
every trigger pattern in this file.

### Custom scroll container

> [Custom scroll container](https://ozjsey.github.io/npm-portfolio-playground/#v-scroll-into-view/container) runs all four forms — element, selector,
> `":scope <sel>"` and getter — against the same pane.

By default, native `scrollIntoView` scrolls the *nearest scrollable ancestor* — which is often the page itself, not the chat pane or modal list you actually wanted to scroll. Pass `container` to pin a specific scrollable parent.

```vue
<script setup lang="ts">
import { ref } from "vue";
import { vScrollIntoView } from "@ozjsey/v-scroll-into-view";

const messages = ref([/* ... */]);
const activeId = ref<string | null>(null);
</script>

<template>
  <div id="chat-pane" style="height: 400px; overflow-y: auto">
    <div
      v-for="msg in messages"
      :key="msg.id"
      v-scroll-into-view="{
        condition: msg.id === activeId,
        container: '#chat-pane',
        block: 'end',
      }"
    >
      {{ msg.text }}
    </div>
  </div>
</template>
```

`container` accepts:

- **`HTMLElement` reference** — e.g. from `ref()` / `useTemplateRef()`.
- **CSS selector** — resolved via `document.querySelector` at scroll time.
- **`:scope <sel>`** — resolved via `el.closest(<sel>)`, useful inside `v-for` where the same selector should walk up from the host.
- **Getter `() => HTMLElement | null`** — called every scroll, so you can return a freshly resolved element without re-rendering.

`container` must be an **ancestor** of the element it is given to, and setting it opts out of
native `scrollIntoView` entirely — there is no fallback, which is what makes it always win, and
also what makes a misconfiguration silent. So the four ways to get it wrong each say so once, in
the console, in a sentence you can paste into a search box:

| What happened | What the directive does |
|---|---|
| Resolves to `null`, or to a detached element | Nothing scrolls. Warns once. |
| Resolves to an element that is not an ancestor of the host | Nothing scrolls. Warns once, and names `:scope`. |
| Resolves to an element with no scrollable overflow | Warns once, then scrolls it anyway (`scrollTo` clamps to 0). |
| Host is in a vertical writing mode | Warns once: `block`/`inline` swap axes there and the container path scrolls the horizontal one. Drop `container` and let the browser resolve the axes. |

The second row is the one that bites in a `v-for` of panes: a plain CSS selector is
`document.querySelector`, which returns the **first** match in the whole document, so every row in
every pane resolves to pane #1. `:scope .pane` walks up from the element instead.

**Nested scrollers.** `container` means "this is the outermost thing I want moved" — not "ignore
the panes inside it". Every scroller between the target and the container is scrolled too,
innermost first, with the same alignment, exactly as native `scrollIntoView` walks the chain.
Pinning the outer pane while an inner one is scrolled away used to leave the target invisible while
the outer pane reported success.

**Malformed selectors** (empty string, invalid CSS syntax like `>>>`, `:scope @@`) resolve to `null` rather than throwing — the directive will not crash your render cycle even if a feature flag or runtime config produces a bad value.

### Sticky-header offset

> [Sticky-header offset](https://ozjsey.github.io/npm-portfolio-playground/#v-scroll-into-view/offset), and [CSS `scroll-margin` with `offset` as its
> override](https://ozjsey.github.io/npm-portfolio-playground/#v-scroll-into-view/scroll-margin) for the interaction between the two.

Leave a gap between the target and the scroll edge — useful for fixed toolbars, sticky headers, or floating action bars.

```vue
<template>
  <div
    v-for="anchor in anchors"
    :key="anchor.id"
    :id="anchor.id"
    v-scroll-into-view="{
      condition: anchor.id === activeAnchor,
      block: 'start',
      offset: { top: 64 },
    }"
  >
    {{ anchor.label }}
  </div>
</template>
```

`offset` is a **per-side override of the target's CSS `scroll-margin`** — the same request in both
paths' vocabularies:

- **Without `container`:** written as an inline `scroll-margin-top` / `-left` on the host across the
  native `scrollIntoView` call, then restored. Any pre-existing inline value is put back.
- **With `container`:** substituted for the computed `scroll-margin` on that side, which the
  container path reads.

Two consequences worth stating out loud, because both are the *point* rather than a quirk:

- `offset: { top: 0 }` **removes** a stylesheet's `scroll-margin-top` for the duration of the
  scroll. It is an override, not an addition, so "no gap" is a thing you can ask for. If you meant
  "leave the CSS alone", omit the key.
- Being a leading-edge gap, it lands where CSS puts a `scroll-margin-top`: **fully** on `'start'`,
  **half** on `'center'` (both edges of the scroll box move the centre), and **not at all** on
  `'end'`, whose alignment is made from the trailing edge. `scroll-margin-bottom` / `-right` are
  read from CSS and are what an `end` alignment uses.

Only the axes you explicitly provide are touched — `{ top: 64 }` leaves `scroll-margin-left` alone.
`offset.top` and `offset.left` are independent, and negative values are supported (push past
natural alignment). Sticky-region detection works in combination with `block: 'nearest'`: a target
already in the raw viewport but obscured by the offset region triggers a scroll.

### Alignment — and the one place `container` differs from native

Without `container` the directive hands the scroll to `Element.scrollIntoView()`, so `block`,
`inline` and `behavior` are the native ones by construction. With `container` it does the
arithmetic itself and calls `container.scrollTo()`.

The two are measured against each other rather than asserted equal.
[The parity sweep](https://ozjsey.github.io/npm-portfolio-playground/#v-scroll-into-view/parity-matrix) builds two identical panes, moves one with the directive and
one with the browser's own `scrollIntoView`, and compares the resting `scrollTop` **exactly** across
every combination of:

| Swept | Values |
|---|---|
| container border | `0`, `1px`, `10px` |
| container padding | `0`, `20px` |
| target height | `40px` (fits), `400px` (taller than the pane) |
| gap | none, or `offset: { top: 60 }` against `scroll-margin-top: 60px` |
| `block` | `start`, `center`, `end`, `nearest` |
| approached from | above, below |

192 rows, one number at the end, and no tolerance — both numbers come from the same browser on the
same frame. Reverting any one of the fixes below turns a nameable subset of those rows red and
leaves the rest green: dropping `clientTop` reddens 120 rows, all of them bordered, every delta
exactly the border width; the `nearest` rule reddens 12, all of them the 400px target; the `offset`
rule reddens 54, all of them `center` (by half the gap) or `end` (by all of it).

`block: 'nearest'` (the default) follows the native rules:

- a target already fully in view is a **no-op**;
- a target already covering the whole scrolling box is a no-op too: every scroll from there hides
  something that is currently on screen;
- anything else moves the **shortest distance that brings an edge in**. For a target that fits,
  that is the edge which is out of view. For a target bigger than the scrolling box, it is the edge
  you are travelling towards: scroll **down** to reach it and you get its top, scroll **up** to
  reach it and you get its bottom. Both are the same rule, and both are what the browser does — up
  to 1.2.0 this library and this README claimed the first half applied to everything, and the
  directive was a full pane height away from native on the second.

**The one exception — `offset` bends `nearest`, which native has no equivalent for.** The gap
shrinks the visible region by that many pixels at the leading edge, and is honoured only while the
target still fits in what is left. A target too big for that is aligned **without** the gap rather
than clipped by it: being visible beats being tidy. The browser, handed the same request as a
`scroll-margin`, clips — measured, a 200px target under `scroll-margin-top: 40px` in a 198px
scrollport lands 42px past the fold. Card 15 excludes exactly those rows, by name rather than by
tolerance.

What used to be exception 1 is gone: since 1.3.0 the `container` path reads the target's computed
`scroll-margin` and the scroller's `scroll-padding`, so a global `scroll-margin-top: 64px` for a
sticky header keeps working when you add `container`. These two are now the same scroll:

```vue
<!-- these two leave the same 64px gap, container or no container -->
<div v-scroll-into-view="{ block: 'start' }" style="scroll-margin-top: 64px">…</div>
<div v-scroll-into-view="{ block: 'start', container: '#pane' }" style="scroll-margin-top: 64px">…</div>
```

**Writing modes.** `block` and `inline` are logical, and the container path resolves them against
the target's computed `direction`: in an RTL list `inline: 'start'` is the **right** edge, and
`scrollLeft` runs `0 … -max`, both of which it handles. A *vertical* writing mode swaps the axes
entirely and is not supported on the `container` path — it warns once and asks you to drop
`container` so the browser can resolve the axes itself.

### Pairing with `focus()`

`focus()` makes the browser scroll the element into view **itself**, on its own rules, before the
directive's frame runs. With `block: 'nearest'` the directive then finds the target already inside
the visible region and — correctly — does nothing, so the resting position is the browser's, not
the one your `block` and `offset` asked for. Measured in Chrome on
[the `focus()` card](https://ozjsey.github.io/npm-portfolio-playground/#v-scroll-into-view/focus), the two disagree by more than 80px.

```ts
// The browser scrolls, then the directive has nothing left to do.
el.focus();

// The directive decides, and lands where `block` / `offset` say.
el.focus({ preventScroll: true });
```

Ordering does not save you: the browser's focus scroll is synchronous and the directive's is one
`requestAnimationFrame` later, so `focus()` always lands first. `preventScroll: true` is the fix.

### Reduced motion

`behavior` defaults to `'smooth'` — except when the user has asked their operating system for
reduced motion (`prefers-reduced-motion: reduce`), where the default resolves to `'instant'`.
The preference is read at scroll time, so a change mid-session is picked up on the next scroll.

An **explicit** `behavior` is passed through untouched: `{ behavior: 'smooth' }` animates
regardless, because that is you making the call rather than the library's default overriding an
accessibility preference. A page-level `scroll-behavior: auto` reset in CSS cannot do this for you
— an explicit `behavior` on the scroll call beats the stylesheet.

### Hidden targets

An element with no layout box — `v-show="false"`, `display: none`, `display: contents`, or simply
detached — has no position, so there is nothing to scroll to. Both paths are a silent no-op and the
scroller stays exactly where the user left it, matching native `scrollIntoView`. A
`visibility: hidden` element *does* have a box, and is scrolled to, also matching native.

The no-op does **not** consume the edge that asked for it. Mount a panel with `condition: true`
while an ancestor is still `display: none`, or with `container: '#pane'` where `#pane` is behind a
`v-if` that resolves a tick later, and the next update tries again — rather than the element never
scrolling for the whole life of the component.

### CSS state hook — `data-scroll-into-view-state`

The directive sets `data-scroll-into-view-state` on the host: `'pending'` from the moment the rAF is
queued until that frame runs, then `'idle'`. It flips back to `'idle'` immediately *before* the
scroll is issued, not after it lands — the attribute tracks the queued frame, not the animation. A
smooth scroll is still travelling long after the hook says `'idle'`.

```css
[data-scroll-into-view-state="pending"] {
  outline: 2px solid royalblue;
  transition: outline 200ms ease;
}
```

Useful for "I'm about to be the focus" affordances — selection rings, fade-ins, etc.

### Imperative — `useScrollIntoView` composable

> [The composable card](https://ozjsey.github.io/npm-portfolio-playground/#v-scroll-into-view/composable) drives `scroll()` / `cancel()` / `update()` from buttons,
> with the reactive `pending` state printed beside them.

Use this when the element to scroll is held outside the template (e.g. a programmatic API surface) or when you want to drive `scroll()` from a button click without a reactive condition.

```vue
<script setup lang="ts">
import { useTemplateRef } from "vue";
import { useScrollIntoView } from "@ozjsey/v-scroll-into-view";

const sectionRef = useTemplateRef<HTMLElement>("section");
const scroller = useScrollIntoView({
  target: () => sectionRef.value,
  options: { behavior: "smooth", block: "start", offset: { top: 64 } },
});

function jumpToSection() {
  scroller.scroll();
}

function changeBehavior() {
  scroller.update({ behavior: "instant" }); // MERGES — offset.top stays at 64
  scroller.scroll();
}
</script>

<template>
  <button @click="jumpToSection">Jump</button>
  <section ref="section">...</section>
</template>
```

`cancel()` is for code that supersedes a queued scroll, not for a button:

```ts
// A route change while a scroll is queued for the page you are leaving.
onBeforeRouteLeave(() => scroller.cancel());
```

Returned API:

| Field | Type | Notes |
|---|---|---|
| `state` | `Ref<'idle' \| 'pending'>` | Reactive — `'pending'` between `scroll()` call and rAF flush. |
| `scroll()` | `() => void` | Scrolls using the current merged options. Coalesces repeated calls — only the most recent wins. |
| `cancel()` | `() => void` | Cancels any pending rAF. Safe to call when nothing is queued. |
| `update(next)` | `(next: UseScrollIntoViewOptions) => void` | **Merges** `next` into prior options — partial updates preserve previous keys. |

`state` is `'pending'` for exactly one frame by construction, so it is a hook for code, not a
control a person can catch: a Cancel button gated on `state.value === 'idle'` is disabled every time
you look at it. Earlier versions of this README shipped exactly that button as the example.

The composable takes `UseScrollIntoViewOptions`, which is the directive's options **minus
`condition` and `always`**. Both are answers to "did something change?", and calling `scroll()` has
already answered it. They used to be accepted and ignored —
`useScrollIntoView({ options: { condition: false } }).scroll()` scrolled anyway, with full
TypeScript approval — so the type is the fix: gate the call site instead.

```ts
if (isOpen.value) scroller.scroll();
```

SSR-safe: `target: null`, getters that throw, or `document === undefined` are all silent no-ops. Cleans up on `onScopeDispose` automatically — pending rAF cancelled, `state` reset to `'idle'`.

## Options

```vue
<div v-scroll-into-view="{ condition: isActive, behavior: 'instant' }">…</div>
```

| Option | Type | Default | Description |
|---|---|---|---|
| `condition` | `boolean` | `true` | When `true` (or transitions to `true`), scrolls the element into view. |
| `behavior` | `ScrollBehavior` | `'smooth'`, or `'instant'` under `prefers-reduced-motion` | Scroll animation: `'smooth'`, `'instant'`, or `'auto'` — matches the native `scrollIntoView` API. Only the default bends for reduced motion; an explicit value is always honoured. |
| `block` | `ScrollLogicalPosition` | `'nearest'` | Vertical alignment: `'start'`, `'center'`, `'end'`, or `'nearest'`. |
| `inline` | `ScrollLogicalPosition` | `'nearest'` | Horizontal alignment: `'start'`, `'center'`, `'end'`, or `'nearest'`. |
| `always` | `boolean` | `false` | If `true`, re-scrolls on every truthy update — not just `false` → `true` transitions. |
| `container` | `ContainerRef` | — | Scrollable **ancestor** to scroll, and the outermost one moved — scrollers between it and the target are scrolled too. `HTMLElement`, CSS selector, `:scope <sel>` (closest), or getter. Resolves at scroll time; a non-ancestor, a detached element or `null` warns once and scrolls nothing. |
| `offset` | `{ top?: number; left?: number }` | — | Per-side override of the target's CSS `scroll-margin`, on both paths. Applies fully to `'start'`, half to `'center'`, not at all to `'end'`. `{ top: 0 }` removes a stylesheet gap. On `'nearest'` the gap is dropped rather than clipping a target too big to fit under it. |

When a plain boolean is passed (`v-scroll-into-view="true"`), it is equivalent to `{ condition: true }`. When the directive has no value (`v-scroll-into-view`), condition defaults to `true`.

`null` / numeric / string binding values are silent no-ops — defensively treated as "disabled". An
**array**, a `Date` or a class instance is not: `typeof value === 'object'` is true for all of them, so
they take the options branch, where a missing `condition` resolves to `true`. `v-scroll-into-view="items"` — a plausible slip for `items.length > 0` — therefore scrolls on mount.

## Exports

| Name | Kind | Purpose |
|---|---|---|
| `vScrollIntoView` | Directive | The directive itself (also the default export). |
| `ScrollIntoViewPlugin` | Plugin | `app.use(...)` install path. Registers under `DIRECTIVE_NAME`. |
| `useScrollIntoView` | Composable | Imperative API — `scroll()`, `cancel()`, `update()`, `state`. |
| `DIRECTIVE_NAME` | `'scroll-into-view'` | The conventional Vue directive name (used by the plugin and any custom registration). |
| `VScrollIntoViewOptions` | Type | Options accepted by a directive binding. |
| `UseScrollIntoViewOptions` | Type | What the composable accepts — the above minus `condition` and `always`, which only mean something to a directive. |
| `ContainerRef` | Type | `HTMLElement \| string \| () => HTMLElement \| null` — every form the `container` option takes. |
| `ScrollIntoViewOptions` | Type (deprecated alias) | Re-exported as an alias for v1.0.x consumers. Planned for removal in v2. |
| `ScrollIntoViewState` | Type | `'idle' \| 'pending'` — value of `data-scroll-into-view-state` and `state` ref. |
| `UseScrollIntoViewParams` | Type | Parameter shape for the composable. |
| `UseScrollIntoViewReturn` | Type | Return shape of the composable. |

## TypeScript

```ts
import { vScrollIntoView } from "@ozjsey/v-scroll-into-view";
import type { VScrollIntoViewOptions } from "@ozjsey/v-scroll-into-view";

const opts: VScrollIntoViewOptions = {
  condition: true,
  behavior: "smooth",
  block: "start",
  container: "#chat-pane",
  offset: { top: 64 },
};
```

## How it works

1. On mount, the directive resolves the binding into a normalized options object and stores per-element state in a `WeakMap`.
2. If the condition is truthy on mount (boolean `true`, object with truthy condition, or bare directive), a `requestAnimationFrame` is queued. The host attribute flips to `data-scroll-into-view-state="pending"`.
3. Inside the rAF, the directive checks that the host still has a layout box — no box, no position, no scroll — resolves `behavior` (this is where `prefers-reduced-motion` is read, once, on the element that is actually about to move), and then either calls native `scrollIntoView` (when no `container`) or measures the target against the container and calls `container.scrollTo` (when a `container` is set). The state attribute returns to `'idle'`.
4. On update, the directive compares the current condition against the stored previous condition. A scroll triggers only on `false` → `true` transitions (edge detection), unless `always: true`. A scroll that could not happen — no layout box, a `container` that has not rendered yet — **re-arms** the edge, so a panel mounted behind a `v-if` gets another attempt instead of never scrolling again. Deciding that a `nearest` target is already in view is not a refusal: that is the right answer, and it spends the edge.
5. On unmount, the pending rAF is cancelled and the WeakMap entry is cleared. The `data-scroll-into-view-state` attribute is removed.

A note on `behavior: 'smooth'` (the default) plus `block: 'nearest'` (also the default): while a
scroll this library started is still travelling, `container.scrollTop` is a coordinate that has not
arrived, and judging "is the target visible?" against it is how a held arrow key walks the active
row off the screen. The container path remembers where it asked each scroller to go, decides
against that, and forgets it on `scrollend` — including the `scrollend` the browser fires when the
user grabs the scrollbar and cancels the animation. Where `scrollend` is unimplemented nothing is
remembered and the old live-position behaviour stands.

## Browser support

Requires browsers that support `Element.scrollIntoView()` with options and `requestAnimationFrame`. All modern browsers (Chrome, Firefox, Safari, Edge). SSR-safe — composable no-ops when `document` is undefined.

## License

MIT
