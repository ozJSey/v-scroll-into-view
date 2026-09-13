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
   * already in view is a no-op, an out-of-view near edge is aligned by that
   * edge, and a target BIGGER than the scrolling box is aligned by its near
   * edge too — you get its top, not its bottom.
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
   * Resolution to `null` or to a detached element is a silent no-op — the
   * directive does NOT fall back to native `scrollIntoView`, so `container`
   * always wins when set.
   */
  container?: ContainerRef
  /**
   * Gap to leave between target and scroll edge — for sticky headers,
   * fixed toolbars, etc.
   *
   * With `container`: subtracted from the computed `scrollTop` / `scrollLeft`.
   * Without `container`: written as ephemeral inline `scrollMarginTop` /
   * `scrollMarginLeft` on the host across the native call, then restored.
   *
   * Only the axes you explicitly provide are touched — `{ top: 64 }` leaves
   * `scrollMarginLeft` (inline or cascaded) untouched.
   *
   * On `block`/`inline` `'nearest'` the gap is honoured only while the target
   * still fits in what it leaves behind; a target too big for that is aligned
   * without the gap rather than clipped by it.
   *
   * NOTE: with `container`, CSS `scroll-margin-*` is NOT read — the math runs
   * on `getBoundingClientRect()`, which does not include scroll margins. Mirror
   * the CSS value here when you pin a container.
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
  behavior: ScrollBehavior
  block: ScrollLogicalPosition
  inline: ScrollLogicalPosition
  always: boolean
  container: ContainerRef | undefined
  offset: { top?: number; left?: number } | undefined
}
