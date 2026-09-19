# @ozjsey/v-scroll-into-view

**Reactive scroll-into-view for Vue 3** — scrolls when a condition turns true, into the container
you pick, with the gap your sticky header needs.

[![npm](https://img.shields.io/npm/v/@ozjsey/v-scroll-into-view)](https://www.npmjs.com/package/@ozjsey/v-scroll-into-view)

## The problem

By default, native `scrollIntoView` scrolls the *nearest scrollable ancestor* — which is often the
page itself, not the chat pane or modal list you actually wanted to scroll. It is imperative, so
keeping "the active row is visible" true costs a watcher, a frame's wait, and a guard so it does not
re-scroll on every render that changed nothing. And the heading it lands on slides under your
sticky header.

## The solution

A Vue 3 directive that calls `Element.scrollIntoView()` when a boolean condition transitions from
`false` to `true` — not on every re-render — with a **custom scroll container** and a
**sticky-header offset** as first-class options.

```vue
<script setup lang="ts">
import { ref } from "vue";
const isActive = ref(false);
</script>

<template>
  <div v-scroll-into-view="isActive">…</div>
</template>
```

Setting `container` opts out of native `scrollIntoView` entirely and does the arithmetic here, so
the two are measured against each other rather than asserted equal: [the parity sweep](https://ozjsey.github.io/npm-portfolio-playground/#v-scroll-into-view/parity-matrix)
compares the resting `scrollTop` **exactly** against the browser's own `scrollIntoView` on an
identical pane across 192 geometries, and [the direction sweep](https://ozjsey.github.io/npm-portfolio-playground/#v-scroll-into-view/direction) does the
same for the horizontal axis across every combination of pane `direction`, target `direction` and
alignment.

**When the container is a template ref, pass the getter.** A binding value is computed while the host
renders and a parent assigns `ref="pane"` only *after* its children have rendered, so on the
mount-time scroll `paneRef.value` is `null`, every time — and `paneRef.value ?? undefined` means *no
container*, which falls back to native and moves the page, the one thing `container` exists to
prevent. `container: () => paneRef.value` resolves at scroll time; all three say so in the console.

## Install

```bash
npm install @ozjsey/v-scroll-into-view
```

Requires Vue 3.2 or newer — `useScrollIntoView` calls `getCurrentScope()` / `onScopeDispose()`.

```ts
import { createApp } from "vue";
import { ScrollIntoViewPlugin } from "@ozjsey/v-scroll-into-view";
import App from "./App.vue";

createApp(App).use(ScrollIntoViewPlugin).mount("#app");
```

## Usage

### `v-for` — scroll the active item, inside its own pane

```vue
<script setup lang="ts">
import { ref } from "vue";

const items = ref(Array.from({ length: 24 }, (_, i) => `Item ${i + 1}`));
const activeIndex = ref(0);

function next() {
  activeIndex.value = (activeIndex.value + 1) % items.value.length;
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

Only the element whose condition transitions to `true` scrolls. `container` is the **outermost**
thing moved, not the only one: scrollers between it and the target are scrolled too, exactly as
native walks the chain, so an inner pane cannot leave the target invisible while the outer one
reports success. A plain CSS selector is `document.querySelector`, so in a `v-for` of panes use
`:scope .pane`, which walks up from the element instead.

### Anchor navigation under a sticky header

```vue
<script setup lang="ts">
import { ref } from "vue";

const activeId = ref<string | null>(null);
const sections = [{ id: "intro", label: "Introduction" }, { id: "install", label: "Install" }];

function goto(id: string) {
  activeId.value = id;
  // Reset next frame so a second click on the same link still scrolls.
  requestAnimationFrame(() => (activeId.value = null));
}
</script>

<template>
  <nav>
    <a v-for="s in sections" :key="s.id" @click.prevent="goto(s.id)">{{ s.label }}</a>
  </nav>

  <section
    v-for="s in sections"
    :key="s.id"
    :id="s.id"
    v-scroll-into-view="{ condition: s.id === activeId, block: 'start', offset: { top: 64 } }"
  >
    <h2>{{ s.label }}</h2>
  </section>
</template>
```

`offset` is a **per-side override of the target's CSS `scroll-margin`**, and means the same thing with or
without a `container`. Being a leading-edge gap, it lands where CSS puts a `scroll-margin-top`: fully on
`'start'`, half on `'center'`, not at all on `'end'`. A condition that goes true and back to false inside one
frame still scrolls — the rising edge queues the frame, which is what lets the reset above work.

## Everything else

**[The `v-scroll-into-view` playground tab](https://ozjsey.github.io/npm-portfolio-playground/#v-scroll-into-view)** is the reference: sixteen cards, every option and every alignment driven in a real browser, each one editable as you read.

- [The parity sweep](https://ozjsey.github.io/npm-portfolio-playground/#v-scroll-into-view/parity-matrix) and [the direction sweep](https://ozjsey.github.io/npm-portfolio-playground/#v-scroll-into-view/direction) — open these first if you are deciding whether to trust this over native `scrollIntoView`
- [Custom container](https://ozjsey.github.io/npm-portfolio-playground/#v-scroll-into-view/container), running every form — getter, element, selector, `":scope <sel>"` — against the same pane, with a control that mounts the row already active so you can watch which spellings survive it
- [Sticky-header offset](https://ozjsey.github.io/npm-portfolio-playground/#v-scroll-into-view/offset) · [CSS `scroll-margin` beside it](https://ozjsey.github.io/npm-portfolio-playground/#v-scroll-into-view/scroll-margin) · [alignment](https://ozjsey.github.io/npm-portfolio-playground/#v-scroll-into-view/alignment) · [`nearest` on an oversized target](https://ozjsey.github.io/npm-portfolio-playground/#v-scroll-into-view/nearest-oversized)
- [Pairing with `focus()`](https://ozjsey.github.io/npm-portfolio-playground/#v-scroll-into-view/focus) — the browser's own focus scroll lands first and `block: 'nearest'` then has nothing left to do, so the resting position is the browser's rather than the one your `block` and `offset` asked for, until you pass `preventScroll: true`
- [`useScrollIntoView`](https://ozjsey.github.io/npm-portfolio-playground/#v-scroll-into-view/composable) for scrolling from code rather than from a condition · [the `data-scroll-into-view-state` hook](https://ozjsey.github.io/npm-portfolio-playground/#v-scroll-into-view/state-attribute) · [hidden targets](https://ozjsey.github.io/npm-portfolio-playground/#v-scroll-into-view/hidden-target) · [`always`](https://ozjsey.github.io/npm-portfolio-playground/#v-scroll-into-view/always)

[`CHANGELOG.md`](./CHANGELOG.md) · [`ARCHITECTURE.md`](https://github.com/ozjsey/v-scroll-into-view/blob/main/ARCHITECTURE.md)

## License

MIT
