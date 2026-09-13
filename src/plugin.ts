/**
 * Plugin install path — `app.use(ScrollIntoViewPlugin)` registers the
 * directive under the kebab-case name `scroll-into-view`.
 *
 * Mirrors `TeleportToPlugin`. SSR-safe: `install` never touches the DOM.
 */
import type { App, Plugin } from 'vue'
import { vScrollIntoView } from './directive'

/** Public constant for the conventional Vue directive name. */
export const DIRECTIVE_NAME = 'scroll-into-view' as const

export const ScrollIntoViewPlugin: Plugin = {
  install(app: App) {
    app.directive(DIRECTIVE_NAME, vScrollIntoView)
  },
}
