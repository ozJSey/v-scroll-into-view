/**
 * Where a smooth scroll this library started is still heading.
 *
 * `block: 'nearest'` and `behavior: 'smooth'` are both defaults, and together
 * they had a trap: `nearest` asks "is the target visible?" against
 * `container.scrollTop`, which during a smooth scroll is a coordinate that has
 * not arrived yet. Judged against it the target often reads as visible, so the
 * new request was answered with "nothing to do" — and the OLD animation carried
 * on to a destination computed for a different target. Held-arrow-key
 * navigation walked the active row off the screen, differently every time.
 *
 * The fix is to decide against where the container WILL be. A destination is
 * remembered from the moment it is requested until the browser says scrolling
 * finished (`scrollend`, which also fires when the user takes over and cancels
 * the animation). Where `scrollend` is not implemented nothing is remembered
 * and the old live-position behaviour stands — degrading is better than
 * inventing a timeout nobody can justify.
 */

export interface ScrollPosition {
  top: number
  left: number
}

const destinations = new WeakMap<HTMLElement, ScrollPosition>()
const watched = new WeakSet<HTMLElement>()

function supportsScrollEnd(): boolean {
  return typeof window !== 'undefined' && 'onscrollend' in window
}

/**
 * Note that `el` has been asked to travel to `dest`, so the next decision about
 * it is made against the destination rather than the coordinate it is passing
 * through. `dest` must already be clamped to the scrollable range: an
 * unreachable destination would never be arrived at, and never forgotten.
 */
export function rememberDestination(el: HTMLElement, dest: ScrollPosition): void {
  if (!supportsScrollEnd()) return
  destinations.set(el, dest)
  if (watched.has(el)) return
  watched.add(el)
  // One passive listener per element the library ever scrolls, for as long as
  // that element lives. It holds no reference the element does not already
  // hold, so it cannot keep anything alive.
  el.addEventListener('scrollend', () => destinations.delete(el), { passive: true })
}

/** Where `el` will be once it stops — its live position when nothing is in flight. */
export function assumedPosition(el: HTMLElement): ScrollPosition {
  const live = { top: el.scrollTop, left: el.scrollLeft }
  const dest = destinations.get(el)
  if (!dest) return live
  // Arrived, but no `scrollend` came (a scroll that had nowhere to go does not
  // always fire one). Treat it as finished rather than trusting a stale number.
  if (Math.abs(dest.top - live.top) < 1 && Math.abs(dest.left - live.left) < 1) {
    destinations.delete(el)
    return live
  }
  return dest
}

/**
 * Internal (not part of the public surface): forget everything, so a test can
 * prove the in-flight path rather than inherit another test's leftovers.
 */
export function resetDestinations(el: HTMLElement): void {
  destinations.delete(el)
}
