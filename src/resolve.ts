/**
 * Normalization — binding values (boolean / options bag / hostile junk) to
 * `ResolvedOptions`, and the four `container` forms to a live element.
 *
 * Nothing here throws: a malformed selector or a getter that blows up resolves
 * to `null` rather than taking down the render cycle. What happens NEXT is the
 * executor's call, and since 1.3.0 it is a one-shot console warning rather than
 * silence — a `container` that resolves to nothing scrolls nothing, and a
 * developer needs a sentence to search for.
 */
import type { ContainerRef, ResolvedOptions, VScrollIntoViewOptions } from './types'

/**
 * The behaviour to scroll with, which is the consumer's `behavior` when they
 * named one and `'smooth'` when they did not — unless the user has asked their
 * operating system for less motion, in which case animating a scroll they never
 * opted into is the library overriding an accessibility preference. Only the
 * DEFAULT bends: an explicit `behavior` is the consumer making the call and is
 * passed through untouched.
 *
 * Called from the executor, in the frame the scroll actually happens, which is
 * what "read at scroll time" has always claimed. It used to be read in
 * `resolveBinding` instead — on every `mounted`/`updated` of every bound
 * element, i.e. once per row per keystroke in a long list, for a value only the
 * one row that scrolls ever consults.
 *
 * `matchMedia` is absent under SSR and in jsdom; there is no preference to
 * honour there.
 */
export function behaviorFor(behavior: ScrollBehavior | undefined): ScrollBehavior {
  if (behavior !== undefined) return behavior
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'smooth'
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'
}

export function resolveBinding(value: boolean | VScrollIntoViewOptions | undefined): ResolvedOptions {
  const isBool = typeof value === 'boolean'
  // Hardened against `null`, numbers, strings, etc. that may slip through
  // template bindings. `null`, a number and a string all fall back to
  // "disabled" defaults — never throws. Anything `typeof === 'object'` takes
  // the options branch, arrays and class instances included, and an object with
  // no `condition` key resolves to `true`.
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
    // Left `undefined` when the consumer did not name one: the reduced-motion
    // default is resolved by `behaviorFor` at scroll time, not here.
    behavior: obj.behavior,
    block: obj.block ?? 'nearest',
    inline: obj.inline ?? 'nearest',
    always: obj.always ?? false,
    container: obj.container,
    // `in`, not a truthiness test: the whole point is to tell `{}` apart from
    // `{ container: undefined }`, which resolve to the same value and to very
    // different intents.
    containerKeyPresent: isObj && 'container' in obj,
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
        // Malformed selector → `null`. The executor warns about it once; the
        // render cycle is not the place to surface a bad feature flag.
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
