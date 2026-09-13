/**
 * The directive — lifecycle wiring plus its rAF scheduling. Edge detection
 * lives against the per-element state in `state.ts`; the actual scroll is
 * `execute-scroll.ts`'s shared executor.
 */
import type { Directive, DirectiveBinding } from 'vue'
import { executeScroll } from './execute-scroll'
import { resolveBinding } from './resolve'
import { STATE_ATTR, setState, stateMap } from './state'
import type { ResolvedOptions, VScrollIntoViewOptions } from './types'

function doScroll(el: HTMLElement, opts: ResolvedOptions): void {
  const state = stateMap.get(el)
  if (!state) return

  if (state.pendingRaf !== undefined) {
    cancelAnimationFrame(state.pendingRaf)
  }

  setState(el, 'pending')

  state.pendingRaf = requestAnimationFrame(() => {
    // Defensive: if `unmounted()` raced ahead of cancelAnimationFrame (browser
    // queued the cb before seeing the cancel), the WeakMap entry will be gone.
    // Skip the work — `el` is detached and the host CSS hook is already cleared.
    if (!stateMap.has(el)) return
    state.pendingRaf = undefined
    setState(el, 'idle')
    executeScroll(el, opts)
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

    stateMap.set(el, {
      previousCondition: opts.condition,
      pendingRaf: undefined,
    })

    // Always set a deterministic starting attribute so consumer CSS sees
    // the hook from the very first frame.
    setState(el, 'idle')

    if (opts.condition) {
      doScroll(el, opts)
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
      doScroll(el, opts)
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
