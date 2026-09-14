/**
 * Element geometry → the numbers `align.ts` works in.
 *
 * This is the module the container path used to get wrong, so it is the one
 * with the invariants spelled out:
 *
 *  - **Origin.** `scrollTop === 0` puts the container's PADDING edge at the top
 *    of the scrollport, but `getBoundingClientRect()` reports the BORDER box.
 *    The gap between them is `clientTop` / `clientLeft` (which also carry the
 *    vertical scrollbar's width when it sits on the left, as it does in RTL),
 *    so every conversion subtracts them. Before 1.3.0 they appeared nowhere in
 *    the package and every container scroll was off by the border width.
 *  - **Space.** Rects are viewport pixels; `scrollTop` and `clientHeight` are
 *    layout pixels. A `transform: scale()` or `zoom` anywhere above the
 *    container makes those two different units, so rect deltas are divided by
 *    the container's own scale before they are added to a scroll offset.
 *  - **Direction.** `start` / `end` are logical. Chrome resolves them against
 *    the TARGET's computed `direction` (measured: an RTL target inside an LTR
 *    pane aligns its right edge), so that is what is read here.
 */

/** Physical insets, in layout pixels. */
export interface Insets {
  top: number
  right: number
  bottom: number
  left: number
}

/** One axis, in the container's scroll coordinate space, before `offset`. */
export interface AxisMeasurement {
  /** The target's border-box leading edge, in scroll coordinates. */
  rel: number
  /** The target's size along this axis, in layout pixels. */
  size: number
  /** The scroll offset the alignment should be computed against. */
  scroll: number
  /** The scrollport's size along this axis (the padding box). */
  client: number
  /** CSS `scroll-margin` on the target, this axis. */
  marginStart: number
  marginEnd: number
  /** CSS `scroll-padding` on the container, this axis. */
  padStart: number
  padEnd: number
}

export interface ContainerGeometry {
  /** The vertical axis — `block` in a horizontal writing mode. */
  vertical: AxisMeasurement
  /** The horizontal axis — `inline` in a horizontal writing mode. */
  horizontal: AxisMeasurement
  /** The target's computed direction is right-to-left. */
  rtl: boolean
  /** The target is in a vertical writing mode, where block and inline swap axes. */
  verticalWritingMode: boolean
}

/**
 * A length from computed style, in layout pixels. `scroll-padding` computes to
 * a length, a percentage or `auto`; `scroll-margin` always to a length; jsdom
 * (no layout) returns the empty string for both.
 */
function lengthOf(value: string, percentBasis: number): number {
  if (!value || value === 'auto') return 0
  const n = Number.parseFloat(value)
  if (!Number.isFinite(n)) return 0
  return value.endsWith('%') ? (n / 100) * percentBasis : n
}

function scrollMarginOf(style: CSSStyleDeclaration): Insets {
  return {
    top: lengthOf(style.scrollMarginTop, 0),
    right: lengthOf(style.scrollMarginRight, 0),
    bottom: lengthOf(style.scrollMarginBottom, 0),
    left: lengthOf(style.scrollMarginLeft, 0),
  }
}

function scrollPaddingOf(style: CSSStyleDeclaration, clientWidth: number, clientHeight: number): Insets {
  return {
    top: lengthOf(style.scrollPaddingTop, clientHeight),
    right: lengthOf(style.scrollPaddingRight, clientWidth),
    bottom: lengthOf(style.scrollPaddingBottom, clientHeight),
    left: lengthOf(style.scrollPaddingLeft, clientWidth),
  }
}

/**
 * How many viewport pixels one layout pixel of this element occupies, from a
 * `transform: scale()` or `zoom` above it. `offsetHeight` is the untransformed
 * border-box height, so the ratio is the accumulated scale — and it is 1 in
 * jsdom, where `offsetHeight` is 0 and the guard takes over.
 */
function scaleOf(rectSize: number, offsetSize: number): number {
  if (offsetSize <= 0 || rectSize <= 0) return 1
  return rectSize / offsetSize
}

/**
 * Measure a target against a container.
 *
 * `assumedScroll` is where the container will be when the alignment lands,
 * which is not always where it is now: a smooth scroll this library started is
 * still travelling, and deciding `nearest` against a coordinate that is still
 * moving is how a held arrow key walks the active row off the screen.
 * `rel` is unaffected — it is the target's position in the scroll CONTENT,
 * which no scrolling changes.
 *
 * `shift` is what inner scrollers between target and container are about to
 * move the target by, in the container's layout pixels.
 */
export function measureContainer(
  el: HTMLElement,
  container: HTMLElement,
  assumedScroll: { top: number; left: number },
  shift: { top: number; left: number } = { top: 0, left: 0 },
): ContainerGeometry {
  const targetRect = el.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()
  const scaleY = scaleOf(containerRect.height, container.offsetHeight)
  const scaleX = scaleOf(containerRect.width, container.offsetWidth)

  const targetStyle = getComputedStyle(el)
  const containerStyle = getComputedStyle(container)
  const margin = scrollMarginOf(targetStyle)
  const padding = scrollPaddingOf(containerStyle, container.clientWidth, container.clientHeight)
  const writingMode = targetStyle.writingMode

  return {
    vertical: {
      rel: (targetRect.top - containerRect.top) / scaleY - container.clientTop + container.scrollTop - shift.top,
      size: targetRect.height / scaleY,
      scroll: assumedScroll.top,
      client: container.clientHeight,
      marginStart: margin.top,
      marginEnd: margin.bottom,
      padStart: padding.top,
      padEnd: padding.bottom,
    },
    horizontal: {
      rel: (targetRect.left - containerRect.left) / scaleX - container.clientLeft + container.scrollLeft - shift.left,
      size: targetRect.width / scaleX,
      scroll: assumedScroll.left,
      client: container.clientWidth,
      marginStart: margin.left,
      marginEnd: margin.right,
      padStart: padding.left,
      padEnd: padding.right,
    },
    rtl: targetStyle.direction === 'rtl',
    verticalWritingMode: writingMode.startsWith('vertical') || writingMode.startsWith('sideways'),
  }
}

/**
 * The physical alignment a logical one means on the horizontal axis.
 * `center` and `nearest` are already physical; only `start` / `end` flip.
 */
export function physicalInline(align: ScrollLogicalPosition, rtl: boolean): ScrollLogicalPosition {
  if (!rtl) return align
  if (align === 'start') return 'end'
  if (align === 'end') return 'start'
  return align
}
