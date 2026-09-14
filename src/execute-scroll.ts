/**
 * The scroll executor — shared by the directive's rAF callback and the
 * composable's `scroll()` so the two paths cannot drift (the historical
 * `nearest + offset + container` bug existed because they were duplicated).
 *
 * It composes, and owns no arithmetic of its own:
 *   `geometry.ts`  element rects → numbers in the container's scroll space
 *   `scroll-box.ts`  those numbers + `offset` → a box and a viewing region
 *   `align.ts`     box + region → where the scroll offset goes
 *   `scrollers.ts` the scrollers between the target and the pinned container
 *   `pending-scroll.ts`  where an in-flight smooth scroll is heading
 */
import { alignAxis } from './align'
import { measureContainer, physicalInline } from './geometry'
import { assumedPosition, rememberDestination, type ScrollPosition } from './pending-scroll'
import { behaviorFor, resolveContainer } from './resolve'
import { scrollBoxFor } from './scroll-box'
import { isScrollable, scrollersBetween } from './scrollers'
import type { ResolvedOptions } from './types'
import { warnOnce } from './warn'

/**
 * True when the element has no associated layout box — `display: none`,
 * `display: contents`, or detached from the document.
 *
 * Native `scrollIntoView` returns early in exactly this case ("if the element
 * does not have any associated box, return"), and the `container` path has to
 * make the same call for itself: a boxless element reports a 0×0 rect at
 * (0, 0), which turns `rel` into a large negative and scrolls the pane to the
 * very top. Measured in Chrome: `scrollTop` 300 → 0 on a `v-show="false"`
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * Scroll one container so the target lands where `block` / `inline` ask, and
 * report how far it moved from where it is RIGHT NOW — which is what the next
 * scroller out has to subtract, because the target's rect was measured before
 * any of this happened.
 */
function scrollOne(
  el: HTMLElement,
  container: HTMLElement,
  opts: ResolvedOptions,
  behavior: ScrollBehavior,
  shift: ScrollPosition,
): ScrollPosition {
  const assumed = assumedPosition(container)
  const geo = measureContainer(el, container, assumed, shift)

  if (geo.verticalWritingMode) {
    warnOnce(
      'a `container` in a vertical writing mode is not supported — `block` and `inline` swap axes ' +
        'there, and the container path scrolls the horizontal one. Drop `container` on this element ' +
        'so the browser resolves the axes itself.',
    )
  }

  const top = alignAxis(opts.block, scrollBoxFor(opts.block, geo.vertical, opts.offset?.top))
  const inlineAlign = physicalInline(opts.inline, geo.rtl)
  const left = alignAxis(inlineAlign, scrollBoxFor(inlineAlign, geo.horizontal, opts.offset?.left))

  if (top === null && left === null) return { top: 0, left: 0 }

  // `scrollTo` clamps to the scrollable range; clamping here too keeps the
  // remembered destination reachable and the reported delta honest.
  const maxTop = Math.max(0, container.scrollHeight - container.clientHeight)
  const maxLeft = Math.max(0, container.scrollWidth - container.clientWidth)
  const target: ScrollPosition = {
    top: clamp(top ?? container.scrollTop, 0, maxTop),
    left: geo.rtl
      ? clamp(left ?? container.scrollLeft, -maxLeft, 0)
      : clamp(left ?? container.scrollLeft, 0, maxLeft),
  }

  rememberDestination(container, target)
  container.scrollTo({ top: target.top, left: target.left, behavior })
  return { top: target.top - container.scrollTop, left: target.left - container.scrollLeft }
}

/**
 * The pinned container and every scroller between it and the target,
 * innermost first.
 *
 * `container` means "this is the outermost thing I want moved". It never meant
 * "ignore the panes inside it" — an inner scroller left where it was can keep
 * the target invisible while the outer pane reports success. Native
 * `scrollIntoView` walks the whole chain with the same alignment on each step,
 * and that is what is reproduced here.
 */
function scrollChain(el: HTMLElement, container: HTMLElement, opts: ResolvedOptions): void {
  const behavior = behaviorFor(opts.behavior)
  const shift: ScrollPosition = { top: 0, left: 0 }
  for (const scroller of [...scrollersBetween(el, container), container]) {
    const moved = scrollOne(el, scroller, opts, behavior, shift)
    shift.top += moved.top
    shift.left += moved.left
  }
}

/**
 * Execute one scroll synchronously against the host element.
 *
 * Returns whether the request was SERVICED. Deciding that a `nearest` target is
 * already in view counts — that is the correct answer, and the edge that
 * triggered it is genuinely spent. Bailing out because the target has no box or
 * the container did not resolve does not: the scheduler that owns the edge has
 * to know it may still have work to do, or a panel mounted behind a `v-if`
 * never scrolls for the whole life of the component.
 */
export function executeScroll(el: HTMLElement, opts: ResolvedOptions): boolean {
  // No box means no position to scroll to. Both paths agree on this, so a
  // hidden target is a no-op whether or not a `container` is set.
  if (hasNoBox(el)) return false

  if (opts.container !== undefined) {
    const container = resolveContainer(el, opts.container)
    if (!container || !container.isConnected) {
      warnOnce(
        '`container` resolved to null or to a detached element, so nothing scrolled. Setting ' +
          '`container` opts out of native `scrollIntoView` entirely — there is no fallback.',
      )
      return false
    }
    if (container === el || !container.contains(el)) {
      warnOnce(
        '`container` is not an ancestor of the element it was given to, so scrolling it cannot ' +
          'bring that element into view. A plain CSS selector matches the FIRST match in the whole ' +
          "document — inside a `v-for` of panes use `:scope <selector>`, which walks up from the " +
          'element instead.',
      )
      return false
    }
    if (!isScrollable(container)) {
      warnOnce(
        '`container` has no scrollable overflow, so `scrollTo` has nowhere to go. Check that the ' +
          'element carrying `overflow: auto` is the one the selector matches — it is often an ' +
          'inner wrapper.',
      )
    }
    scrollChain(el, container, opts)
    return true
  }

  // Native path. `offset` is handed to the browser in the vocabulary it already
  // has for a gap — an inline `scroll-margin`, written across the call and put
  // back after, on the axes the consumer named and no others. That is also why
  // `{ top: 0 }` removes a stylesheet's `scroll-margin-top`: `offset` overrides
  // the CSS per side, and the container path does the same thing.
  const offset = opts.offset
  const style = el.style
  const previousTop = offset?.top !== undefined ? style.scrollMarginTop : undefined
  const previousLeft = offset?.left !== undefined ? style.scrollMarginLeft : undefined
  if (offset?.top !== undefined) style.scrollMarginTop = `${offset.top}px`
  if (offset?.left !== undefined) style.scrollMarginLeft = `${offset.left}px`
  try {
    el.scrollIntoView({ behavior: behaviorFor(opts.behavior), block: opts.block, inline: opts.inline })
  } finally {
    if (previousTop !== undefined) style.scrollMarginTop = previousTop
    if (previousLeft !== undefined) style.scrollMarginLeft = previousLeft
  }
  return true
}
