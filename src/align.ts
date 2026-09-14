/**
 * The alignment rule, as pure arithmetic on one axis. No DOM, no options bag,
 * no library concepts — just "given this box, this viewing region and this
 * scroll offset, where should the scroll offset go?".
 *
 * It is CSSOM-View's *scroll a target into view* step, transcribed. Keeping it
 * DOM-free is what makes it checkable: the numbers can be chosen in a unit
 * test, and the same function is measured against the browser's own
 * `scrollIntoView` across a geometry matrix in the playground
 * (`15-parity-matrix.vue`). The historical container bugs all lived in the
 * *conversion* into these numbers, not in the rule — so the conversion lives
 * somewhere else, in `geometry.ts`, and can be wrong on its own.
 *
 * Leaf module: imports nothing.
 */

/**
 * One axis of the problem, all four numbers in the container's scroll
 * coordinate space (the space `scrollTop` / `scrollLeft` live in).
 */
export interface Axis {
  /** Leading edge of the target's scroll box — its border box grown by scroll-margin / `offset`. */
  boxStart: number
  /** Trailing edge of the same box. */
  boxEnd: number
  /** Leading edge of the optimal viewing region — the scrollport inset by scroll-padding. */
  portStart: number
  /** Trailing edge of the same region. */
  portEnd: number
  /** The axis's current scroll offset. */
  scroll: number
}

/**
 * Where this axis's scroll offset should go, or `null` when it should not move.
 *
 * The result is unclamped: `Element.scrollTo` clamps to the scrollable range
 * itself, and clamping here would hide the difference between "already at the
 * edge" and "asked for something impossible".
 */
export function alignAxis(align: ScrollLogicalPosition, axis: Axis): number | null {
  const { boxStart, boxEnd, portStart, portEnd, scroll } = axis
  // Where the region's own edges sit relative to the scroll offset. Aligning
  // the box's leading edge to the region means `scroll = boxStart - leading`.
  const leading = portStart - scroll
  const trailing = portEnd - scroll

  if (align === 'start') return boxStart - leading
  if (align === 'end') return boxEnd - trailing
  if (align === 'center') return (boxStart + boxEnd) / 2 - (leading + trailing) / 2

  const startOutside = boxStart < portStart
  const endOutside = boxEnd > portEnd

  // Already inside the region: nothing to do.
  if (!startOutside && !endOutside) return null
  // The box already covers the whole region. Every scroll from here hides
  // something that is on screen right now, so the browser stays put too.
  if (startOutside && endOutside) return null

  // A box too big for the region reveals the edge OPPOSITE the one that is out
  // of view: bringing the near edge in would push the far edge further out.
  const fits = boxEnd - boxStart <= portEnd - portStart
  const alignToStart = fits ? startOutside : endOutside
  return alignToStart ? boxStart - leading : boxEnd - trailing
}
