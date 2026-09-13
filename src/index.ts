/**
 * Public surface. Internal modules (state, resolve, execute-scroll) stay
 * un-exported.
 */
export { vScrollIntoView, default } from './directive'
export { DIRECTIVE_NAME, ScrollIntoViewPlugin } from './plugin'
export { useScrollIntoView } from './use-scroll-into-view'
export type { UseScrollIntoViewParams, UseScrollIntoViewReturn } from './use-scroll-into-view'
export type {
  ScrollIntoViewOptions,
  ScrollIntoViewState,
  VScrollIntoViewOptions,
} from './types'
