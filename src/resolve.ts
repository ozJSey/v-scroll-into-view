/**
 * Normalization — binding values (boolean / options bag / hostile junk) to
 * `ResolvedOptions`, and the four `container` forms to a live element.
 * Everything here degrades to a silent no-op instead of throwing.
 */
import type { ContainerRef, ResolvedOptions, VScrollIntoViewOptions } from './types'

/**
 * The default scroll behaviour, which is `'smooth'` — unless the user has
 * asked their operating system for less motion, in which case animating a
 * scroll they never opted into is the library overriding an accessibility
 * preference. Only the DEFAULT bends: an explicit `behavior` is the consumer
 * making the call and is passed through untouched.
 *
 * Read fresh rather than cached, so a preference changed mid-session takes
 * effect on the next scroll. `matchMedia` is absent under SSR and in jsdom;
 * there is no preference to honour there.
 */
function defaultBehavior(): ScrollBehavior {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'smooth'
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'
}

export function resolveBinding(value: boolean | VScrollIntoViewOptions | undefined): ResolvedOptions {
  const isBool = typeof value === 'boolean'
  // Hardened against `null`, numbers, strings, etc. that may slip through
  // template bindings. Anything that isn't a boolean, plain object, or
  // `undefined` falls back to "disabled" defaults — never throws.
  const isObj = value !== null && typeof value === 'object'
  const obj: VScrollIntoViewOptions = isObj ? (value as VScrollIntoViewOptions) : {}
  // `undefined` is the bare-directive sentinel (`v-scroll-into-view` with no
  // value), which Vue passes as `binding.value === undefined`. Treat that as
  // `condition: true` so the bare form scrolls on mount.
  const condition = isBool
    ? (value as boolean)
    : isObj
      ? (obj.condition ?? true)
      : value === undefined
        ? true
        : false
  return {
    condition,
    behavior: obj.behavior ?? defaultBehavior(),
    block: obj.block ?? 'nearest',
    inline: obj.inline ?? 'nearest',
    always: obj.always ?? false,
    container: obj.container,
    offset: obj.offset,
  }
}

export function resolveContainer(el: HTMLElement, ref: ContainerRef | undefined): HTMLElement | null {
  if (ref === undefined || ref === null) return null
  if (typeof ref === 'string') {
    if (ref.startsWith(':scope')) {
      const remaining = ref.slice(':scope'.length).trim()
      if (!remaining) return null
      try {
        return el.closest<HTMLElement>(remaining)
      } catch {
        // Malformed selector → silent no-op. Matches the documented contract
        // ("Resolution to `null` ... is a silent no-op").
        return null
      }
    }
    if (typeof document === 'undefined') return null
    if (!ref) return null
    try {
      return document.querySelector<HTMLElement>(ref)
    } catch {
      // Empty string or malformed CSS selector throws DOMException; swallow it.
      return null
    }
  }
  if (typeof ref === 'function') {
    try {
      return ref() ?? null
    } catch {
      // Getter exceptions are user-error; degrade to silent no-op rather
      // than propagate (would crash the render cycle).
      return null
    }
  }
  return ref
}
