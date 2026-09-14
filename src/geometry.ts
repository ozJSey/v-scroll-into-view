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
 *  - **Precision.** `clientWidth`, `clientHeight`, `offsetWidth` and
 *    `offsetHeight` are the only numbers here the browser rounds to whole
 *    pixels; rects are not. Mixing the two costs a pixel on any pane whose box
 *    is not an integer — which is every pane sized by a `1fr` column or a
 *    percentage. So the scale ratio ignores sub-pixel differences (`scaleOf`)
 *    and the scrollport is derived from the rect (`scrollportSize`), both new
 *    in 1.3.1 and both found by the direction sweep.
 *  - **Direction, twice over.** Two different facts wear the same word, and
 *    1.3.0 shipped one flag for both. `start` / `end` are logical, and Chrome
 *    resolves them against the TARGET's computed `direction` (measured: an RTL
 *    target inside an LTR pane aligns its right edge). The SIGN of `scrollLeft`
 *    is a property of the CONTAINER: an RTL scroller runs `0 … -maxLeft` and an
 *    LTR one runs `0 … +maxLeft`, no matter what direction the target inside it
 *    is written in. A `dir="rtl"` card in an LTR rail made 1.3.0 clamp a
 *    positive destination into a negative range, which is `scrollLeft 0` every
 *    time. So both are measured, separately.
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
  /**
   * The TARGET's computed direction is right-to-left — the flip that decides
   * which physical edge `inline: 'start'` names.
   */
  targetRtl: boolean
  /**
   * The CONTAINER's computed direction is right-to-left — the sign of its
   * `scrollLeft` range. Never read this for alignment, and never read
   * `targetRtl` for the range.
   */
  containerRtl: boolean
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

/**
 * The scrollport's size along one axis, in layout pixels, WITHOUT the rounding
 * that `clientWidth` / `clientHeight` carry.
 *
 * Those two are the obvious source and they are integers: a pane whose padding
 * box is 461.40625px wide reports 461. Everything else in this module is
 * fractional, so that 0.4px lands in `portEnd` — and on `center`, where it is
 * halved, it is enough to push a destination of 429.5 to the other side of a
 * rounding boundary from the browser's 429.3. Measured against native on a
 * `1fr` grid column: 4 of 36 rows, all of them `center`, all of them 1px.
 *
 * The border box IS available fractionally, from the rect. Subtract the borders
 * (computed style, exact) and the scrollbar (the only thing left between the
 * border box and the scrollport, and a whole number of pixels in every engine)
 * and what remains is the scrollport, to the pixel.
 *
 * `offsetSize` is rounded too, but it is used only to size the scrollbar, so
 * rounding the borders in that subtraction keeps both sides in the same units.
 */
function scrollportSize(
  rectSize: number,
  scale: number,
  clientSize: number,
  offsetSize: number,
  borderStart: string,
  borderEnd: string,
): number {
  // No layout (jsdom): nothing to refine, and `clientWidth` is the whole truth
  // there because the fixture said so.
  if (offsetSize <= 0 || rectSize <= 0) return clientSize
  const start = Number.parseFloat(borderStart) || 0
  const end = Number.parseFloat(borderEnd) || 0
  const scrollbar = Math.max(0, offsetSize - clientSize - Math.round(start) - Math.round(end))
  const exact = rectSize / scale - start - end - scrollbar
  // A refinement that moves the answer by more than a pixel is not a
  // refinement, it is a disagreement — some assumption above does not hold, so
  // keep the number the browser handed over directly.
  return Math.abs(exact - clientSize) < 1 ? exact : clientSize
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
 * jsdom, where `offsetHeight` is 0 and the first guard takes over.
 *
 * The second guard is the one with a story. `offsetWidth`/`offsetHeight` are
 * ROUNDED to whole pixels while `getBoundingClientRect()` is not, so a pane
 * that is 463.40625px wide — anything sized by a `1fr` grid column, a
 * percentage, or a flex remainder, which is to say most panes — reports a ratio
 * of 463.40625 / 463 = 1.00088 with no transform anywhere on the page. That
 * looked harmless and is not: the ratio divides `rel`, so the error is
 * PROPORTIONAL to how far into the content the target sits. Measured on a
 * 960px rail, a target 600px in landed 1px short of native, every time, on the
 * trailing-edge alignments.
 *
 * Sub-pixel rounding cannot be told from a scale of 1.0009, so do not try:
 * a transform that changes the border box by less than one layout pixel is not
 * a transform worth dividing out, and treating it as one costs more than
 * ignoring it. A real `scale(0.5)` on a 400px box is 200px away from this
 * threshold.
 */
function scaleOf(rectSize: number, offsetSize: number): number {
  if (offsetSize <= 0 || rectSize <= 0) return 1
  if (Math.abs(rectSize - offsetSize) < 1) return 1
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
      client: scrollportSize(
        containerRect.height,
        scaleY,
        container.clientHeight,
        container.offsetHeight,
        containerStyle.borderTopWidth,
        containerStyle.borderBottomWidth,
      ),
      marginStart: margin.top,
      marginEnd: margin.bottom,
      padStart: padding.top,
      padEnd: padding.bottom,
    },
    horizontal: {
      rel: (targetRect.left - containerRect.left) / scaleX - container.clientLeft + container.scrollLeft - shift.left,
      size: targetRect.width / scaleX,
      scroll: assumedScroll.left,
      client: scrollportSize(
        containerRect.width,
        scaleX,
        container.clientWidth,
        container.offsetWidth,
        containerStyle.borderLeftWidth,
        containerStyle.borderRightWidth,
      ),
      marginStart: margin.left,
      marginEnd: margin.right,
      padStart: padding.left,
      padEnd: padding.right,
    },
    targetRtl: targetStyle.direction === 'rtl',
    containerRtl: containerStyle.direction === 'rtl',
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
