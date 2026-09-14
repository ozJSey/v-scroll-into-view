/**
 * Where the library's own `offset` option meets the CSS the browser reads.
 *
 * `offset` is a per-side OVERRIDE of the target's CSS `scroll-margin` on that
 * axis — the same thing the container-less path does by writing an inline
 * `scroll-margin-top` across the native call. Passing `{ top: 0 }` therefore
 * means "no gap on this side", CSS or not, on both paths.
 *
 * Everything else here is the browser's own model: the target's *scroll box*
 * is its border box grown by `scroll-margin`, and the *optimal viewing region*
 * is the scrollport inset by the container's `scroll-padding`. Both were
 * measured against Chrome across a geometry matrix before being written down.
 */
import type { Axis } from './align'
import type { AxisMeasurement } from './geometry'

/**
 * Build one axis for `alignAxis`.
 *
 * The single deliberate deviation from native lives in the `nearest` branch:
 * a gap that no longer leaves room for the target itself is dropped rather
 * than honoured. Native clips instead (measured: a 200px target under
 * `scroll-margin-top: 40px` in a 198px scrollport lands 42px past the fold),
 * and so does this library's container-less path, which delegates to the
 * browser. On `nearest` the point is that the target is visible at all; a
 * decoration that hides it has failed at its own job.
 */
export function scrollBoxFor(
  align: ScrollLogicalPosition,
  m: AxisMeasurement,
  offsetStart: number | undefined,
): Axis {
  const portStart = m.scroll + m.padStart
  const portEnd = m.scroll + m.client - m.padEnd

  const requested = offsetStart ?? m.marginStart
  const dropGap =
    offsetStart !== undefined && align === 'nearest' && m.size + offsetStart > portEnd - portStart
  const leadingGap = dropGap ? 0 : requested

  return {
    boxStart: m.rel - leadingGap,
    boxEnd: m.rel + m.size + m.marginEnd,
    portStart,
    portEnd,
    scroll: m.scroll,
  }
}
