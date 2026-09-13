/**
 * The scroll executor — shared by the directive's rAF callback and the
 * composable's `scroll()` so the two paths cannot drift (the historical
 * `nearest + offset + container` bug existed because they were duplicated).
 */
import { resolveContainer } from './resolve'
import type { ResolvedOptions } from './types'

/**
 * True when the element has no associated layout box — `display: none`,
 * `display: contents`, or detached from the document.
 *
 * Native `scrollIntoView` returns early in exactly this case ("if the element
 * does not have any associated box, return"), and the `container` path has to
 * make the same call for itself: a boxless element reports a 0×0 rect at
 * (0, 0), which turns `relTop` into a large negative and scrolls the pane to
 * the very top. Measured in Chrome: `scrollTop` 300 → 0 on a `v-show="false"`
 * target, while the container-less path correctly stayed put.
 *
 * `getClientRects()` IS the spec's "has an associated box" test — it is empty
 * for a `display:none`, `display:contents` or detached element and non-empty
 * for a `visibility:hidden` one, which native `scrollIntoView` does scroll to.
 * But jsdom implements no layout and returns an empty list for every element,
 * `<html>` included. Probing the document element is what tells "this element
 * is not rendered" apart from "this environment does not do layout" — where
 * the only honest answer is to decline to guess and scroll anyway.
 */
function hasNoBox(el: HTMLElement): boolean {
  if (el.getClientRects().length > 0) return false
  return el.ownerDocument.documentElement.getClientRects().length > 0
}

/**
 * Where to scroll one axis of the container so `[rel, rel + size]` lands in
 * `[scroll, scroll + client]`, or `null` when this axis needs no scroll.
 *
 * `offsetStart` is the library's `offset` for the axis: the leading
 * `offsetStart` pixels of the scrolling box are treated as obscured by a
 * sticky header or fixed toolbar.
 */
function scrollFor(
  align: ScrollLogicalPosition,
  rel: number,
  size: number,
  scroll: number,
  client: number,
  offsetStart: number = 0,
): number | null {
  const far = rel + size
  if (align === 'start') return rel - offsetStart
  if (align === 'end') return far - client - offsetStart
  if (align === 'center') return rel + size / 2 - client / 2 - offsetStart

  // `nearest`. The gap is a nicety; the target being visible at all is not.
  // Honour the offset only while the target still fits in what it leaves
  // behind, otherwise the gap pushes the target's own far edge back out of
  // view — measured as 40px of a 200px target clipped inside a 200px pane.
  const lead = size <= client - offsetStart ? offsetStart : 0
  const visibleStart = scroll + lead
  const visibleEnd = scroll + client
  const startOutside = rel < visibleStart
  const endOutside = far > visibleEnd

  if (!startOutside && !endOutside) return null // already in view
  if (startOutside && endOutside) return null // already covers the whole box
  // Native `nearest` aligns the far edge only when the target is small enough
  // for that to reveal its near edge too. Anything taller than the box gets
  // its NEAR edge aligned — a 400px target in a 200px pane shows its top, not
  // its bottom.
  if (endOutside && size < client - lead) return far - client
  return rel - lead
}

/**
 * Execute one scroll synchronously against the host element.
 *
 * Container path: math against the chosen ancestor, then `container.scrollTo`.
 * Native path: ephemeral `scrollMargin{Top,Left}` write-then-restore wrapped
 * around `el.scrollIntoView`.
 */
export function executeScroll(el: HTMLElement, opts: ResolvedOptions): void {
  // No box means no position to scroll to. Both paths agree on this, so a
  // hidden target is a no-op whether or not a `container` is set.
  if (hasNoBox(el)) return

  if (opts.container !== undefined) {
    const container = resolveContainer(el, opts.container)
    if (!container || !container.isConnected) return

    const targetRect = el.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()

    const relTop = targetRect.top - containerRect.top + container.scrollTop
    const relLeft = targetRect.left - containerRect.left + container.scrollLeft

    // The offset is folded into `scrollFor` rather than subtracted afterwards.
    // The post-hoc version had to GUESS which branch `nearest` had taken by
    // comparing the result back against `rel`, and `far - client` equals `rel`
    // exactly when the target is the size of the pane — so the guess was wrong
    // on that one input, and the offset was applied to a far-edge alignment.
    const newTop = scrollFor(
      opts.block,
      relTop,
      targetRect.height,
      container.scrollTop,
      container.clientHeight,
      opts.offset?.top ?? 0,
    )
    const newLeft = scrollFor(
      opts.inline,
      relLeft,
      targetRect.width,
      container.scrollLeft,
      container.clientWidth,
      opts.offset?.left ?? 0,
    )

    if (newTop === null && newLeft === null) return

    container.scrollTo({
      top: newTop ?? container.scrollTop,
      left: newLeft ?? container.scrollLeft,
      behavior: opts.behavior,
    })
    return
  }

  const off = opts.offset
  const st = off?.top !== undefined
  const sl = off?.left !== undefined
  const s = el.style
  const pt = st ? s.scrollMarginTop : ''
  const pl = sl ? s.scrollMarginLeft : ''
  if (st) s.scrollMarginTop = `${off!.top}px`
  if (sl) s.scrollMarginLeft = `${off!.left}px`
  try {
    el.scrollIntoView({ behavior: opts.behavior, block: opts.block, inline: opts.inline })
  } finally {
    if (st) s.scrollMarginTop = pt
    if (sl) s.scrollMarginLeft = pl
  }
}
