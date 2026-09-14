/**
 * The scroll containers between a target and the one you pinned.
 *
 * Native `scrollIntoView` scrolls EVERY scrollable ancestor. Pinning a
 * `container` means "stop at this one" — it does not mean "ignore the ones
 * inside it", and before 1.3.0 it did: an inner pane scrolled away left the
 * target invisible while the outer pane reported success. Chrome scrolls
 * `overflow: hidden` boxes too (they are scrollable programmatically, just not
 * by the user), which is why `hidden` is in the list.
 */

const SCROLLABLE_OVERFLOW = new Set(['auto', 'scroll', 'hidden', 'overlay'])

function overflows(el: HTMLElement): boolean {
  return el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth
}

/** True when this element has a scrollport that can actually be moved. */
export function isScrollable(el: HTMLElement): boolean {
  const style = getComputedStyle(el)
  if (!SCROLLABLE_OVERFLOW.has(style.overflowY) && !SCROLLABLE_OVERFLOW.has(style.overflowX)) {
    return false
  }
  return overflows(el)
}

/**
 * Scrollable elements strictly between `el` and `container`, innermost first —
 * the order they have to be scrolled in, because moving an inner one moves the
 * target inside every scroller outside it.
 */
export function scrollersBetween(el: HTMLElement, container: HTMLElement): HTMLElement[] {
  const found: HTMLElement[] = []
  for (let node = el.parentElement; node !== null && node !== container; node = node.parentElement) {
    if (isScrollable(node)) found.push(node)
  }
  return found
}
