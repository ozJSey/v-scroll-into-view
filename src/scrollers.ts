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

/**
 * True when this element's `overflow` makes it a scroll container at all —
 * whether or not it has anything to scroll RIGHT NOW.
 *
 * The distinction is the whole of the warning in `execute-scroll.ts`. A chat
 * pane with `overflow-y: auto` and two messages in it is configured correctly
 * and merely not full yet; warning about it fires on every fresh session of a
 * working app, and that false alarm is what used to spend the global warning
 * latch. A wrapper with `overflow: visible` cannot scroll whatever you put in
 * it, and THAT is the mistake worth a sentence.
 *
 * The document element is exempt: it scrolls the viewport regardless of what
 * its computed `overflow` says, which is why `container: 'html'` works.
 */
export function canScroll(el: HTMLElement): boolean {
  if (el === el.ownerDocument.documentElement) return true
  const style = getComputedStyle(el)
  return SCROLLABLE_OVERFLOW.has(style.overflowY) || SCROLLABLE_OVERFLOW.has(style.overflowX)
}

/** True when this element has a scrollport that can actually be moved. */
export function isScrollable(el: HTMLElement): boolean {
  return canScroll(el) && overflows(el)
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
