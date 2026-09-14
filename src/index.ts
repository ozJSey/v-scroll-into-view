/**
 * Public surface. Internal modules (state, resolve, execute-scroll, geometry,
 * align, scroll-box, scrollers, pending-scroll, warn) stay un-exported.
 */
export { vScrollIntoView, default } from './directive'
export { DIRECTIVE_NAME, ScrollIntoViewPlugin } from './plugin'
export { useScrollIntoView } from './use-scroll-into-view'
export type {
  UseScrollIntoViewOptions,
  UseScrollIntoViewParams,
  UseScrollIntoViewReturn,
} from './use-scroll-into-view'
export type {
  ContainerRef,
  ScrollIntoViewOptions,
  ScrollIntoViewState,
  VScrollIntoViewOptions,
} from './types'
