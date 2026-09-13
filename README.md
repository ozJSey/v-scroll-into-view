# @ozjsey/v-scroll-into-view

## Playground

Try the live examples in the [npm portfolio playground](https://github.com/ozJSey/npm-portfolio-playground).

[![npm](https://img.shields.io/npm/v/@ozjsey/v-scroll-into-view)](https://www.npmjs.com/package/@ozjsey/v-scroll-into-view)

## Reactive scroll-into-view for Vue 3 — with custom containers and sticky-header offsets

A Vue 3 directive that calls `Element.scrollIntoView()` when a boolean condition transitions from `false` to `true`. Ships with a composable, a plugin install path, a CSS state hook, and first-class support for custom scroll containers and sticky-header offsets.

## Features

- Edge detection: scrolls only on `false` → `true` transitions (not on every re-render)
- `condition` boolean, options object, or bare `<div v-scroll-into-view>`
- Configurable `behavior` (`'smooth' | 'instant' | 'auto'`), `block`, `inline` — the native alignment rules, `nearest` included, applied to the container you pick
- Honours `prefers-reduced-motion`: the **default** `behavior` resolves to `'instant'` when the user has asked for less motion. An explicit `behavior` is never overridden
- A target with no layout box (`v-show="false"`, `display: none`, detached) is a no-op on both paths — the scroller stays where the user left it
- `always` to re-scroll on every truthy update
- **Custom scroll container** — pick a specific ancestor (chat pane, modal list, virtualized scroller) instead of letting the browser walk the ancestor chain
- **Sticky-header offset** — leave a gap between target and scroll edge
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

### Custom scroll container

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

If the container resolves to `null` or is detached from the DOM at scroll time, the directive is a silent no-op — it does **not** fall back to native `scrollIntoView`. This guarantees `container` always wins when set.

Nested scroll containers work as expected: pass the inner container and the outer one is left untouched.

**Malformed selectors** (empty string, invalid CSS syntax like `>>>`, `:scope @@`) resolve to `null` rather than throwing — the directive will not crash your render cycle even if a feature flag or runtime config produces a bad value.

### Sticky-header offset

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

- **With `container`:** subtracts from the computed `scrollTop` / `scrollLeft`.
- **Without `container`:** writes inline `scrollMarginTop` / `scrollMarginLeft` on the host across the native `scrollIntoView` call, then restores prior values. Any pre-existing inline value is preserved — and only the axes you explicitly provide are touched (`{ top: 64 }` leaves `scrollMarginLeft` alone).

`offset.top` and `offset.left` are independent — pass either, both, or neither. Negative values are supported (push past natural alignment). Sticky-region detection works in combination with `block: 'nearest'`: a target already in the raw viewport but obscured by the offset region triggers a scroll.

### Alignment — and the two places `container` differs from native

Without `container` the directive hands the scroll to `Element.scrollIntoView()`, so `block`,
`inline` and `behavior` are the native ones by construction. With `container` it does the
arithmetic itself and calls `container.scrollTo()`. The alignments agree — the playground runs the
directive and native `scrollIntoView` on two identical panes side by side and compares them
(`12-nearest-oversized.vue`) — with two deliberate exceptions, both documented below.

`block: 'nearest'` (the default) follows the native rules:

- a target already fully in view is a **no-op**;
- a target whose near edge is out of view is aligned by that **near** edge;
- a target whose far edge is out of view is aligned by its **far** edge — unless it is bigger than
  the scrolling box, in which case the near edge wins. You get the top of a too-tall target, not
  its bottom;
- a target already covering the whole scrolling box is a no-op: every scroll from there hides
  something that is currently on screen.

**Exception 1 — CSS `scroll-margin-*` is a native-path feature.** `getBoundingClientRect()` does
not include scroll margins, so a global `scroll-margin-top: 64px` for a sticky header opens its gap
when the directive has no `container`, and is silently ignored the moment you add one. Mirror it
with `offset`, which is the same number in the same place:

```vue
<!-- these two leave the same 64px gap -->
<div v-scroll-into-view="{ block: 'start' }" style="scroll-margin-top: 64px">…</div>
<div v-scroll-into-view="{ block: 'start', container: '#pane', offset: { top: 64 } }">…</div>
```

**Exception 2 — `offset` bends `nearest`, which native has no equivalent for.** The offset shrinks
the visible region by that many pixels at the leading edge, and the gap is honoured only while the
target still fits in what is left. A target too tall for that is aligned without the gap rather
than clipped by it: being visible beats being tidy.

### Pairing with `focus()`

`focus()` makes the browser scroll the element into view **itself**, on its own rules, before the
directive's frame runs. With `block: 'nearest'` the directive then finds the target already inside
the visible region and — correctly — does nothing, so the resting position is the browser's, not
the one your `block` and `offset` asked for. Measured in Chrome on the playground's card 14, the
two disagree by more than 80px.

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

### CSS state hook — `data-scroll-into-view-state`

The directive sets `data-scroll-into-view-state` on the host: `'pending'` while the rAF is queued, then `'idle'` after the scroll fires.

```css
[data-scroll-into-view-state="pending"] {
  outline: 2px solid royalblue;
  transition: outline 200ms ease;
}
```

Useful for "I'm about to be the focus" affordances — selection rings, fade-ins, etc.

### Imperative — `useScrollIntoView` composable

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
  <button @click="scroller.cancel()" :disabled="scroller.state.value === 'idle'">
    Cancel
  </button>
  <section ref="section">...</section>
</template>
```

Returned API:

| Field | Type | Notes |
|---|---|---|
| `state` | `Ref<'idle' \| 'pending'>` | Reactive — `'pending'` between `scroll()` call and rAF flush. |
| `scroll()` | `() => void` | Scrolls using the current merged options. Coalesces repeated calls — only the most recent wins. |
| `cancel()` | `() => void` | Cancels any pending rAF. Safe to call when nothing is queued. |
| `update(next)` | `(next: VScrollIntoViewOptions) => void` | **Merges** `next` into prior options — partial updates preserve previous keys. |

`state` is `'pending'` for exactly one frame, so a Cancel button disabled on `state.value === 'idle'` is disabled essentially always. `cancel()` is for code that supersedes a queued scroll — a route change, a new selection — not for a button a user could realistically hit.

SSR-safe: `target: null`, getters that throw, or `document === undefined` are all silent no-ops. Cleans up on `onScopeDispose` automatically — pending rAF cancelled, `state` reset to `'idle'`.

## Options

```vue
<div v-scroll-into-view="{ condition: isActive, behavior: 'instant' }">
```

| Option | Type | Default | Description |
|---|---|---|---|
| `condition` | `boolean` | `true` | When `true` (or transitions to `true`), scrolls the element into view. |
| `behavior` | `ScrollBehavior` | `'smooth'`, or `'instant'` under `prefers-reduced-motion` | Scroll animation: `'smooth'`, `'instant'`, or `'auto'` — matches the native `scrollIntoView` API. Only the default bends for reduced motion; an explicit value is always honoured. |
| `block` | `ScrollLogicalPosition` | `'nearest'` | Vertical alignment: `'start'`, `'center'`, `'end'`, or `'nearest'`. |
| `inline` | `ScrollLogicalPosition` | `'nearest'` | Horizontal alignment: `'start'`, `'center'`, `'end'`, or `'nearest'`. |
| `always` | `boolean` | `false` | If `true`, re-scrolls on every truthy update — not just `false` → `true` transitions. |
| `container` | `HTMLElement \| string \| () => HTMLElement \| null` | — | Scrollable ancestor to scroll. CSS selector, `:scope <sel>` (closest), or getter. Resolves at scroll time. |
| `offset` | `{ top?: number; left?: number }` | — | Gap between target and scroll edge. With `container` subtracts from scrollTop/Left; without, sets ephemeral `scrollMargin{Top,Left}`. On `block: 'nearest'` the gap is dropped rather than clipping a target too big to fit under it. |

When a plain boolean is passed (`v-scroll-into-view="true"`), it is equivalent to `{ condition: true }`. When the directive has no value (`v-scroll-into-view`), condition defaults to `true`.

`null` / numeric / string binding values are silent no-ops — defensively treated as "disabled".

## Exports

| Name | Kind | Purpose |
|---|---|---|
| `vScrollIntoView` | Directive | The directive itself (also the default export). |
| `ScrollIntoViewPlugin` | Plugin | `app.use(...)` install path. Registers under `DIRECTIVE_NAME`. |
| `useScrollIntoView` | Composable | Imperative API — `scroll()`, `cancel()`, `update()`, `state`. |
| `DIRECTIVE_NAME` | `'scroll-into-view'` | The conventional Vue directive name (used by the plugin and any custom registration). |
| `VScrollIntoViewOptions` | Type | Options accepted by directive binding + composable. |
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
3. Inside the rAF, the directive checks that the host still has a layout box — no box, no position, no scroll — and then either calls native `scrollIntoView` (when no `container`) or computes the target position and calls `container.scrollTo` (when a `container` is set). The state attribute returns to `'idle'`.
4. On update, the directive compares the current condition against the stored previous condition. A scroll triggers only on `false` → `true` transitions (edge detection), unless `always: true`.
5. On unmount, the pending rAF is cancelled and the WeakMap entry is cleared. The `data-scroll-into-view-state` attribute is removed.

## Browser support

Requires browsers that support `Element.scrollIntoView()` with options and `requestAnimationFrame`. All modern browsers (Chrome, Firefox, Safari, Edge). SSR-safe — composable no-ops when `document` is undefined.

## License

MIT
