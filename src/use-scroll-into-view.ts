/**
 * Composable form — imperative scroll without binding to a template. Shares
 * `execute-scroll.ts` with the directive; only the rAF bookkeeping differs
 * (a local variable here vs the per-element WeakMap there).
 */
import { getCurrentScope, onScopeDispose, ref, type Ref } from 'vue'
import { executeScroll } from './execute-scroll'
import { resolveBinding } from './resolve'
import type { ScrollIntoViewState, VScrollIntoViewOptions } from './types'

/**
 * What a composable call can act on: the directive's options minus the two that
 * only mean something to a directive.
 *
 * `condition` is edge-detected against the previous render and `always` decides
 * whether a repeated truthy render re-scrolls — both are answers to "did
 * something change?", and an imperative `scroll()` has already answered it. The
 * composable used to ACCEPT them and ignore them:
 * `useScrollIntoView({ options: { condition: false } }).scroll()` scrolled, with
 * full TypeScript approval. Naming the narrower type is the whole fix — a
 * consumer who gates on `condition` now finds out at compile time.
 */
export type UseScrollIntoViewOptions = Omit<VScrollIntoViewOptions, 'condition' | 'always'>

export interface UseScrollIntoViewParams {
  /**
   * Element to scroll. Accepts either a static `HTMLElement` (e.g. from
   * `useTemplateRef()`'s `.value`), `null`, or a getter `() => HTMLElement | null`
   * (resolved every `scroll()` call so reactive ref unwrapping works).
   */
  target: HTMLElement | (() => HTMLElement | null) | null
  /** Initial options. Updated reactively via {@link UseScrollIntoViewReturn.update}. */
  options?: UseScrollIntoViewOptions
}

export interface UseScrollIntoViewReturn {
  /**
   * Current scroll state — `'pending'` between the `scroll()` call and the
   * next animation frame; `'idle'` otherwise.
   */
  state: Ref<ScrollIntoViewState>
  /** Imperatively trigger a scroll using the current options. */
  scroll: () => void
  /** Cancel any pending rAF; safe to call when nothing is queued. */
  cancel: () => void
  /** Merge new options. Affects the next `scroll()` call. */
  update: (next: UseScrollIntoViewOptions) => void
}

/**
 * Composable form of the directive — imperative scroll without binding to a
 * template. Useful for:
 *   - Programmatic scroll on user action (button click, route change)
 *   - Components that don't render the scrolled element themselves
 *   - SSR-safe code paths where the target may be `null` server-side
 *
 * @example
 * ```ts
 * const sectionRef = useTemplateRef<HTMLElement>('section')
 * const scroller = useScrollIntoView({
 *   target: () => sectionRef.value,
 *   options: { behavior: 'smooth', block: 'start', offset: { top: 64 } },
 * })
 * function jumpToSection() {
 *   scroller.scroll()
 * }
 * ```
 *
 * SSR-safe: when `document` is undefined or `target` resolves to `null`,
 * `scroll()` is a no-op and `state` stays at `'idle'`.
 */
export function useScrollIntoView(params: UseScrollIntoViewParams): UseScrollIntoViewReturn {
  const state = ref<ScrollIntoViewState>('idle')
  let lastOpts: UseScrollIntoViewOptions = { ...(params.options ?? {}) }
  // Track the in-flight rAF id so cancel(), repeated scroll() calls, and
  // effectScope dispose can all coalesce by reusing/canceling it.
  let pendingRaf: number | undefined

  function resolveTargetEl(): HTMLElement | null {
    if (!params.target) return null
    if (typeof params.target === 'function') {
      try {
        return params.target() ?? null
      } catch {
        return null
      }
    }
    return params.target
  }

  function scroll(): void {
    if (typeof document === 'undefined') return
    const el = resolveTargetEl()
    if (!el) return

    // Coalesce repeated scroll() calls — drop the prior frame so only the
    // most recent options/target win.
    if (pendingRaf !== undefined) {
      cancelAnimationFrame(pendingRaf)
      pendingRaf = undefined
    }

    state.value = 'pending'

    // `condition` last, not first: an imperative call IS the condition, and a
    // stray one spread in from a JS caller must not be able to turn it off.
    const opts = resolveBinding({ ...lastOpts, condition: true })
    pendingRaf = requestAnimationFrame(() => {
      pendingRaf = undefined
      state.value = 'idle'
      // Shared executor — single source of truth for the directive AND the
      // composable. Eliminates the prior `nearest + offset + container` drift
      // where the composable's scrollFor() call omitted offsetStart.
      executeScroll(el, opts)
    })
  }

  function cancel(): void {
    if (pendingRaf !== undefined) {
      cancelAnimationFrame(pendingRaf)
      pendingRaf = undefined
    }
    state.value = 'idle'
  }

  function update(next: UseScrollIntoViewOptions): void {
    // MERGE rather than replace so partial updates preserve prior keys
    // (e.g. `update({ behavior: 'instant' })` keeps an earlier `container`).
    lastOpts = { ...lastOpts, ...next }
  }

  // Only register cleanup when called inside an active effect scope. Avoids
  // Vue's "no active effect scope" warning when the composable is invoked
  // outside setup() (unit tests, imperative code). `getCurrentScope()` and
  // `onScopeDispose()` landed in Vue 3.2.0 — checked against the published
  // packages, not the docs: 3.1.5 exports neither — which is what sets this
  // package's peer floor at `^3.2.0`. `onScopeDispose`'s `failSilently` second
  // arg came later still, in 3.5, so guarding manually keeps the library quiet
  // across the whole supported range.
  if (getCurrentScope()) {
    onScopeDispose(() => {
      if (pendingRaf !== undefined) {
        cancelAnimationFrame(pendingRaf)
        pendingRaf = undefined
      }
      state.value = 'idle'
    })
  }

  return { state, scroll, cancel, update }
}
