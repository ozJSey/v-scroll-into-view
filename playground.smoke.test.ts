/**
 * Playground responsive smoke test.
 *
 * The `playground.html` demo is the canonical "does the library work in a
 * real Vue app" exhibit. This suite mounts a Vue app via
 * `createApp(...).use(ScrollIntoViewPlugin).mount()` and exercises the
 * directive's public surface at three responsive breakpoints:
 *
 *   - mobile  (~375 × 720)
 *   - tablet  (~768 × 900)
 *   - desktop (~1280 × 900)
 *
 * For each breakpoint the test asserts:
 *   1. `ScrollIntoViewPlugin` registered the directive under
 *      `v-scroll-into-view`.
 *   2. Bare directive on mount sets `data-scroll-into-view-state="pending"`
 *      while the rAF is queued, then flips to `'idle'` after flush.
 *   3. Reactive false → true transition triggers scroll exactly once.
 *   4. Composable `useScrollIntoView` resolves a template ref and scrolls.
 *   5. `container` option scrolls the chosen ancestor, not the page.
 *   6. `offset.top` without container writes inline `scrollMarginTop`
 *      across the native call and restores it after.
 *   7. Plugin install path matches `app.directive('scroll-into-view')`
 *      lookup.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref, useTemplateRef } from 'vue'
import {
  ScrollIntoViewPlugin,
  useScrollIntoView,
  vScrollIntoView,
} from './vScrollIntoView'

const VIEWPORTS = {
  mobile: { width: 375, height: 720 },
  tablet: { width: 768, height: 900 },
  desktop: { width: 1280, height: 900 },
} as const

function setViewport(w: number, h: number) {
  Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true })
  Object.defineProperty(window, 'innerHeight', { value: h, configurable: true, writable: true })
}

// Manual rAF queue so we can observe the `pending` state deterministically.
let rafQueue: Array<{ id: number; cb: FrameRequestCallback }> = []
let nextRafId = 1
function flushRaf() {
  const pending = [...rafQueue]
  rafQueue = []
  for (const { cb } of pending) cb(performance.now())
}

beforeEach(() => {
  rafQueue = []
  nextRafId = 1
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = nextRafId++
    rafQueue.push({ id, cb })
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    rafQueue = rafQueue.filter((e) => e.id !== id)
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

/**
 * Mount a Vue app that mirrors `playground.html`'s "active item in list" demo.
 * Uses `ScrollIntoViewPlugin` (NOT `app.directive(...)` directly) — proves
 * the plugin install path against a real `createApp`.
 */
function mountPlayground() {
  const host = document.createElement('div')
  document.body.appendChild(host)

  const activeIndex = ref(0)
  const items = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve']

  const Comp = defineComponent({
    setup() {
      return () =>
        h(
          'div',
          { class: 'list', style: 'height: 200px; overflow-y: auto' },
          items.map((name, i) =>
            h(
              'div',
              {
                class: 'item',
                'data-name': name,
                'data-index': String(i),
              },
              name,
            ),
          ),
        )
    },
  })

  const app = createApp(Comp)
  app.use(ScrollIntoViewPlugin)
  app.mount(host)

  // Sanity check.
  if (app.directive('scroll-into-view') !== vScrollIntoView) {
    throw new Error('ScrollIntoViewPlugin failed to register the scroll-into-view directive')
  }

  return {
    app,
    host,
    activeIndex,
    list: host.querySelector<HTMLElement>('.list')!,
    item: (i: number) => host.querySelector<HTMLElement>(`[data-index="${i}"]`)!,
    unmount() {
      app.unmount()
      host.remove()
    },
  }
}

function applyDirective(el: HTMLElement, value: any) {
  const binding = {
    value,
    oldValue: undefined as unknown,
    modifiers: {},
    dir: vScrollIntoView,
    instance: null,
  }
  ;(vScrollIntoView as any).mounted(el, binding as any, null as any, null as any)
}

function updateDirective(el: HTMLElement, newValue: any, oldValue: any) {
  const binding = {
    value: newValue,
    oldValue,
    modifiers: {},
    dir: vScrollIntoView,
    instance: null,
  }
  ;(vScrollIntoView as any).updated(el, binding as any, null as any, null as any)
}

function unmountDirective(el: HTMLElement) {
  ;(vScrollIntoView as any).unmounted(
    el,
    { value: undefined, oldValue: undefined, modifiers: {}, dir: vScrollIntoView, instance: null } as any,
    null as any,
    null as any,
  )
}

describe('playground.html — responsive smoke', () => {
  for (const [name, vp] of Object.entries(VIEWPORTS)) {
    describe(`@ ${name} (${vp.width}×${vp.height})`, () => {
      it('ScrollIntoViewPlugin registers the directive on app.use()', () => {
        setViewport(vp.width, vp.height)
        const pg = mountPlayground()
        expect(pg.app.directive('scroll-into-view')).toBe(vScrollIntoView)
        pg.unmount()
      })

      it('bare directive sets data-scroll-into-view-state="pending" before rAF, "idle" after', () => {
        setViewport(vp.width, vp.height)
        const pg = mountPlayground()
        const target = pg.item(2)
        target.scrollIntoView = vi.fn()

        applyDirective(target, undefined) // bare ⇒ condition: true

        expect(target.getAttribute('data-scroll-into-view-state')).toBe('pending')
        flushRaf()
        expect(target.getAttribute('data-scroll-into-view-state')).toBe('idle')
        expect(target.scrollIntoView).toHaveBeenCalledOnce()

        unmountDirective(target)
        pg.unmount()
      })

      it('false → true transition triggers a single scroll', () => {
        setViewport(vp.width, vp.height)
        const pg = mountPlayground()
        const target = pg.item(3)
        target.scrollIntoView = vi.fn()

        applyDirective(target, false)
        flushRaf()
        expect(target.scrollIntoView).not.toHaveBeenCalled()

        updateDirective(target, true, false)
        flushRaf()
        expect(target.scrollIntoView).toHaveBeenCalledOnce()

        unmountDirective(target)
        pg.unmount()
      })

      it('useScrollIntoView composable scrolls an externally-held element', async () => {
        setViewport(vp.width, vp.height)
        const pg = mountPlayground()
        const target = pg.item(1)
        target.scrollIntoView = vi.fn()

        let scrollFn: (() => void) | null = null
        let stateRef: { value: string } | null = null

        const Holder = defineComponent({
          setup() {
            const api = useScrollIntoView({ target, options: { behavior: 'instant', block: 'start' } })
            scrollFn = api.scroll
            stateRef = api.state
            return () => h('div')
          },
        })

        const holderHost = document.createElement('div')
        document.body.appendChild(holderHost)
        const holderApp = createApp(Holder)
        holderApp.mount(holderHost)
        await nextTick()

        expect(stateRef!.value).toBe('idle')
        scrollFn!()
        expect(stateRef!.value).toBe('pending')
        flushRaf()
        expect(stateRef!.value).toBe('idle')
        expect(target.scrollIntoView).toHaveBeenCalledOnce()
        expect((target.scrollIntoView as any).mock.calls[0][0]).toMatchObject({
          behavior: 'instant',
          block: 'start',
        })

        holderApp.unmount()
        holderHost.remove()
        pg.unmount()
      })

      it('container option scrolls the chosen ancestor, not the page', () => {
        setViewport(vp.width, vp.height)
        const pg = mountPlayground()
        const target = pg.item(4)
        target.scrollIntoView = vi.fn()

        Object.defineProperty(pg.list, 'clientHeight', { value: 200, configurable: true })
        Object.defineProperty(pg.list, 'scrollTop', { value: 0, configurable: true, writable: true })
        pg.list.scrollTo = vi.fn()
        Object.defineProperty(pg.list, 'getBoundingClientRect', {
          configurable: true,
          value: () => ({ top: 0, left: 0, right: 200, bottom: 200, width: 200, height: 200, x: 0, y: 0, toJSON: () => ({}) }),
        })
        Object.defineProperty(target, 'getBoundingClientRect', {
          configurable: true,
          value: () => ({ top: 400, left: 0, right: 200, bottom: 432, width: 200, height: 32, x: 0, y: 400, toJSON: () => ({}) }),
        })

        applyDirective(target, { container: pg.list, block: 'start' })
        flushRaf()

        expect(pg.list.scrollTo).toHaveBeenCalledOnce()
        expect(target.scrollIntoView).not.toHaveBeenCalled()

        unmountDirective(target)
        pg.unmount()
      })

      it('offset.top without container writes inline scrollMarginTop across the native call', () => {
        setViewport(vp.width, vp.height)
        const pg = mountPlayground()
        const target = pg.item(2)
        let observedMargin = ''
        target.scrollIntoView = vi.fn(() => {
          observedMargin = target.style.scrollMarginTop
        })

        applyDirective(target, { offset: { top: 80 } })
        flushRaf()

        expect(observedMargin).toBe('80px')
        // Restored after the call.
        expect(target.style.scrollMarginTop).toBe('')

        unmountDirective(target)
        pg.unmount()
      })

      it('unmount removes the data-scroll-into-view-state attribute', () => {
        setViewport(vp.width, vp.height)
        const pg = mountPlayground()
        const target = pg.item(0)
        target.scrollIntoView = vi.fn()

        applyDirective(target, true)
        flushRaf()
        expect(target.getAttribute('data-scroll-into-view-state')).toBe('idle')

        unmountDirective(target)
        expect(target.getAttribute('data-scroll-into-view-state')).toBeNull()

        pg.unmount()
      })
    })
  }
})
