/**
 * Host state — the per-element WeakMap (edge detection + in-flight rAF) and
 * the `data-scroll-into-view-state` CSS hook it is reflected into.
 */
import type { ScrollIntoViewState } from './types'

/** CSS hook attribute name. */
export const STATE_ATTR = 'data-scroll-into-view-state'

export interface ElementState {
  previousCondition: boolean
  pendingRaf: number | undefined
}

export const stateMap = new WeakMap<HTMLElement, ElementState>()

export function setState(el: HTMLElement, state: ScrollIntoViewState): void {
  el.setAttribute(STATE_ATTR, state)
}
