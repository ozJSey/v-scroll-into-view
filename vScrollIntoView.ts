/**
 * Build entry point — re-exports the public surface from `src/`.
 *
 * The split keeps each concern in a single-purpose module (types / state /
 * resolve / execute-scroll / directive / plugin / composable) without changing
 * the bundle: tsup follows this entry and emits the same minified files.
 * See ARCHITECTURE.md for the module map.
 */
export {
  vScrollIntoView,
  default,
  DIRECTIVE_NAME,
  ScrollIntoViewPlugin,
  useScrollIntoView,
} from './src'
export type {
  ScrollIntoViewOptions,
  ScrollIntoViewState,
  UseScrollIntoViewParams,
  UseScrollIntoViewReturn,
  VScrollIntoViewOptions,
} from './src'
