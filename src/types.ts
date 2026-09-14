/**
 * Public types + the internal resolved-options shape.
 *
 * Leaf module: imports nothing.
 */

/** Every form the `container` option accepts. Resolved at scroll time. */
export type ContainerRef = HTMLElement | string | (() => HTMLElement | null)

/**
 * Options accepted by the `v-scroll-into-view` directive.
 *
 * Renamed from `ScrollIntoViewOptions` in v1.1.0 to avoid the namespace
 * collision with the browser's native `ScrollIntoViewOptions` type from
 * `lib.dom.d.ts`. The old name remains exported as a type alias and is
 * planned for removal in v2.
 */
export type VScrollIntoViewOptions = {
  /** When true (or transitions to true), scrolls element into view. Default `true`. */
  condition?: boolean
  /**
   * Scroll behavior. Default `'smooth'` — or `'instant'` when the user has
   * asked their OS for reduced motion (`prefers-reduced-motion: reduce`),
   * read at scroll time.
   *
   * Only the default bends. An explicit value here is the consumer opting in
   * and is passed through untouched.
   */
  behavior?: ScrollBehavior
  /**
   * Vertical alignment. Default `'nearest'`, which follows the native rules:
   * already in view is a no-op, a target that covers the whole scrollport is a
   * no-op too, and anything else moves the SHORTEST distance that brings an
   * edge in. For a target bigger than the scrollport that means the edge you
   * are travelling towards — scrolling down to reach it aligns its top,
   * scrolling up to reach it aligns its bottom.
   */
  block?: ScrollLogicalPosition
  /** Horizontal alignment. Default `'nearest'`. */
  inline?: ScrollLogicalPosition
  /** If true, re-scrolls on every truthy update (not just false-to-true edges). Default `false`. */
  always?: boolean
  /**
   * Scrollable ancestor to scroll instead of the nearest scrollable ancestor
   * native `scrollIntoView` would pick. Accepts:
   *   - an `HTMLElement` reference,
   *   - a CSS selector (`document.querySelector`),
   *   - `:scope <sel>` to resolve via `el.closest(<sel>)`,
   *   - or a `() => HTMLElement | null` getter (called every scroll).
   *
   * Must be an ancestor of the element it is given to, and should be the
   * OUTERMOST scroller you want moved: every scroller between it and the target
   * is scrolled too, as native `scrollIntoView` does, because an inner pane
   * left where it was can keep the target invisible.
   *
   * Resolution to `null`, to a detached element, or to something that is not an
   * ancestor scrolls nothing and warns once — the directive does NOT fall back
   * to native `scrollIntoView`, so `container` always wins when set. A plain
   * CSS selector matches the first element in the whole document; inside a
   * `v-for` of panes use the `:scope <sel>` form.
   */
  container?: ContainerRef
  /**
   * Gap to leave between target and scroll edge — for sticky headers,
   * fixed toolbars, etc.
   *
   * It is a per-side OVERRIDE of the target's CSS `scroll-margin` on that side,
   * on both paths: without `container` it is written as an ephemeral inline
   * `scroll-margin-top` / `-left` across the native call and restored after;
   * with `container` the same number is substituted for the computed
   * `scroll-margin` the container path now reads. So `{ top: 0 }` means "no gap
   * on this side" and removes a stylesheet's `scroll-margin-top` — the same
   * answer either way.
   *
   * Only the axes you explicitly provide are touched — `{ top: 64 }` leaves
   * `scroll-margin-left` (inline or cascaded) alone, and neither side of it
   * touches `scroll-margin-bottom` / `-right`, which are read from CSS.
   *
   * Being a leading-edge gap, it lands where CSS puts a `scroll-margin-top`:
   * fully on `'start'`, half on `'center'` (both edges of the box move the
   * centre), and not at all on `'end'`, whose alignment is made from the
   * trailing edge.
   *
   * On `block`/`inline` `'nearest'` the gap is honoured only while the target
   * still fits in what it leaves behind; a target too big for that is aligned
   * without the gap rather than clipped by it. This is the one place the two
   * paths deliberately differ: the browser clips instead.
   */
  offset?: { top?: number; left?: number }
}

/**
 * @deprecated Use {@link VScrollIntoViewOptions}. Re-exported as an alias to
 * preserve the import surface from v1.0.x consumers. The browser's native
 * `ScrollIntoViewOptions` lives in `lib.dom.d.ts`; this alias may shadow it
 * depending on import order, which is the reason for the rename.
 */
export type ScrollIntoViewOptions = VScrollIntoViewOptions

/** Reflected in `data-scroll-into-view-state` on the host element. */
export type ScrollIntoViewState = 'idle' | 'pending'

/** What a binding value normalizes to before any scrolling happens. */
export interface ResolvedOptions {
  condition: boolean
  /**
   * `undefined` means "the consumer did not name one" — the reduced-motion
   * default is resolved by `behaviorFor` in the frame the scroll happens, so it
   * is not read once per bound element per re-render.
   */
  behavior: ScrollBehavior | undefined
  block: ScrollLogicalPosition
  inline: ScrollLogicalPosition
  always: boolean
  container: ContainerRef | undefined
  offset: { top?: number; left?: number } | undefined
}
