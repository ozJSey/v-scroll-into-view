/**
 * The directive — lifecycle wiring plus its rAF scheduling. Edge detection
 * lives against the per-element state in `state.ts`; the actual scroll is
 * `execute-scroll.ts`'s shared executor.
 */
import type { Directive, DirectiveBinding } from 'vue'
import { executeScroll } from './execute-scroll'
import { resolveBinding } from './resolve'
import { STATE_ATTR, setState, stateMap } from './state'
import type { ElementState } from './state'
import type { ResolvedOptions, VScrollIntoViewOptions } from './types'

/**
 * Queue the scroll for the next frame, so a condition that flips during a
 * render batch scrolls once, against the layout the browser is about to paint.
 *
 * The frame is where the edge is really spent. `updated()` marks the condition
 * consumed the moment it sees it, which is the only order that lets a falling
 * edge be recorded — but a scroll can still decline to happen (a target with no
 * box, a `container` that has not rendered yet), and an edge spent on a no-op
 * is an edge that never comes back: while the condition stays true, no further
 * update is a false→true transition. So a refusal RE-ARMS the edge, and the
 * next update gets another attempt. Deciding a `nearest` target is already in
 * view is not a refusal — that is the correct answer, and it is final.
 */
function doScroll(el: HTMLElement, state: ElementState, opts: ResolvedOptions): void {
  if (state.pendingRaf !== undefined) {
    cancelAnimationFrame(state.pendingRaf)
  }

  setState(el, 'pending')

  state.pendingRaf = requestAnimationFrame(() => {
    state.pendingRaf = undefined
    setState(el, 'idle')
    if (!executeScroll(el, opts)) state.previousCondition = false
  })
}

/**
 * Vue 3 directive that reactively calls `Element.scrollIntoView()` (or the
 * `container.scrollTo()` equivalent) when a boolean condition transitions
 * from `false` to `true` (edge detection).
 *
 * @example
 * ```vue
 * <div v-scroll-into-view="isActive">...</div>
 * <div v-scroll-into-view="{ condition: isActive, behavior: 'instant' }">...</div>
 * <div v-scroll-into-view>...</div>  <!-- scrolls on mount -->
 *
 * <!-- Scroll a chosen ancestor (e.g. a chat pane) instead of the page -->
 * <div v-scroll-into-view="{ container: '#chat-pane', block: 'end' }">...</div>
 *
 * <!-- Sticky-header offset -->
 * <div v-scroll-into-view="{ offset: { top: 64 } }">...</div>
 * ```
 */
export const vScrollIntoView: Directive<
  HTMLElement,
  boolean | VScrollIntoViewOptions | undefined
> = {
  mounted(el: HTMLElement, binding: DirectiveBinding<boolean | VScrollIntoViewOptions | undefined>) {
    const opts = resolveBinding(binding.value)

    const state: ElementState = {
      previousCondition: opts.condition,
      pendingRaf: undefined,
    }
    stateMap.set(el, state)

    // Always set a deterministic starting attribute so consumer CSS sees
    // the hook from the very first frame.
    setState(el, 'idle')

    if (opts.condition) {
      doScroll(el, state, opts)
    }
  },

  updated(el: HTMLElement, binding: DirectiveBinding<boolean | VScrollIntoViewOptions | undefined>) {
    const opts = resolveBinding(binding.value)
    const state = stateMap.get(el)
    if (!state) return

    const prev = state.previousCondition
    state.previousCondition = opts.condition

    if (!opts.condition) return

    if (opts.always || !prev) {
      doScroll(el, state, opts)
    }
  },

  unmounted(el: HTMLElement) {
    const state = stateMap.get(el)
    if (state) {
      if (state.pendingRaf !== undefined) {
        cancelAnimationFrame(state.pendingRaf)
      }
      stateMap.delete(el)
    }
    el.removeAttribute(STATE_ATTR)
  },
}

export default vScrollIntoView
