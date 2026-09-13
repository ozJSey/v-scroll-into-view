/**
 * SSR safety smoke suite.
 *
 * Runs in vitest's `environment: 'node'` (no jsdom, no `window`, no
 * `document`) to prove the library:
 *   - imports cleanly with no top-level DOM access,
 *   - the composable runs inside an `effectScope` without throwing when
 *     the target resolves to `null` server-side,
 *   - the plugin's `install` registers the directive without touching
 *     the DOM,
 *   - the directive object exposes the lifecycle hooks (Vue 3's SSR
 *     renderer never invokes them server-side, but consumers may import
 *     the symbol from a universal module).
 *
 * No jsdom: any accidental top-level `window.foo` or `document.bar` would
 * throw at import time and fail every test in this project.
 */

import { describe, it, expect } from 'vitest'
import { effectScope } from 'vue'
import {
  vScrollIntoView,
  ScrollIntoViewPlugin,
  DIRECTIVE_NAME,
  useScrollIntoView,
  default as defaultExport,
} from './vScrollIntoView'
import type { ScrollIntoViewOptions, VScrollIntoViewOptions, ScrollIntoViewState } from './vScrollIntoView'

describe('SSR safety — node environment', () => {
  it('imports cleanly with no DOM globals', () => {
    expect(typeof (globalThis as any).window).toBe('undefined')
    expect(typeof (globalThis as any).document).toBe('undefined')
    expect(vScrollIntoView).toBeDefined()
    expect(useScrollIntoView).toBeDefined()
    expect(ScrollIntoViewPlugin).toBeDefined()
    expect(DIRECTIVE_NAME).toBe('scroll-into-view')
    expect(defaultExport).toBe(vScrollIntoView)
  })

  it('exposes directive lifecycle hooks without invoking them', () => {
    expect(typeof (vScrollIntoView as any).mounted).toBe('function')
    expect(typeof (vScrollIntoView as any).updated).toBe('function')
    expect(typeof (vScrollIntoView as any).unmounted).toBe('function')
    expect((vScrollIntoView as any).getSSRProps).toBeUndefined()
  })

  it('useScrollIntoView does not throw with target: null', () => {
    const scope = effectScope()
    let api: ReturnType<typeof useScrollIntoView> | undefined
    expect(() => {
      scope.run(() => {
        api = useScrollIntoView({ target: null })
      })
    }).not.toThrow()

    expect(api).toBeDefined()
    expect(api!.state.value).toBe('idle')

    expect(() => api!.scroll()).not.toThrow()
    expect(api!.state.value).toBe('idle')

    expect(() => api!.cancel()).not.toThrow()
    expect(() => api!.update({ behavior: 'instant' })).not.toThrow()

    scope.stop()
  })

  it('useScrollIntoView with a getter resolving to null does not throw', () => {
    const scope = effectScope()
    let api: ReturnType<typeof useScrollIntoView> | undefined
    expect(() => {
      scope.run(() => {
        api = useScrollIntoView({ target: () => null })
      })
    }).not.toThrow()
    expect(api!.state.value).toBe('idle')
    api!.scroll()
    expect(api!.state.value).toBe('idle')
    scope.stop()
  })

  it('useScrollIntoView with a throwing getter does not crash', () => {
    const scope = effectScope()
    let api: ReturnType<typeof useScrollIntoView> | undefined
    scope.run(() => {
      api = useScrollIntoView({
        target: () => {
          throw new Error('boom')
        },
      })
    })
    expect(() => api!.scroll()).not.toThrow()
    expect(api!.state.value).toBe('idle')
    scope.stop()
  })

  it('useScrollIntoView disposes cleanly on scope stop', () => {
    const scope = effectScope()
    let api: ReturnType<typeof useScrollIntoView> | undefined
    scope.run(() => {
      api = useScrollIntoView({
        target: null,
        options: { behavior: 'instant', offset: { top: 64 } },
      })
    })
    expect(() => scope.stop()).not.toThrow()
    expect(api!.state.value).toBe('idle')
  })

  it('ScrollIntoViewPlugin.install registers the directive without DOM access', () => {
    let registeredName: string | undefined
    let registeredDirective: unknown
    const stubApp = {
      directive(name: string, dir: unknown) {
        registeredName = name
        registeredDirective = dir
        return this
      },
    }

    expect(() => (ScrollIntoViewPlugin as any).install(stubApp as any)).not.toThrow()
    expect(registeredName).toBe(DIRECTIVE_NAME)
    expect(registeredDirective).toBe(vScrollIntoView)
  })

  it('ScrollIntoViewPlugin.install is idempotent across stub apps', () => {
    const calls: Array<{ name: string; dir: unknown }> = []
    const stubApp = {
      directive(name: string, dir: unknown) {
        calls.push({ name, dir })
        return this
      },
    }
    ;(ScrollIntoViewPlugin as any).install(stubApp as any)
    ;(ScrollIntoViewPlugin as any).install(stubApp as any)
    expect(calls).toHaveLength(2)
    expect(calls[0].name).toBe(DIRECTIVE_NAME)
    expect(calls[1].name).toBe(DIRECTIVE_NAME)
    expect(calls[0].dir).toBe(vScrollIntoView)
    expect(calls[1].dir).toBe(vScrollIntoView)
  })

  it('public type-shape exports are functions/objects (no top-level evaluation crash)', () => {
    expect(typeof useScrollIntoView).toBe('function')
    expect(typeof ScrollIntoViewPlugin).toBe('object')
    expect(typeof (ScrollIntoViewPlugin as any).install).toBe('function')
    expect(typeof vScrollIntoView).toBe('object')
  })

  it('back-compat type alias ScrollIntoViewOptions equals VScrollIntoViewOptions', () => {
    // Compile-time only: this test verifies the deprecated alias accepts
    // the same shape. Runtime asserts a tautology so the test passes.
    const a: ScrollIntoViewOptions = { behavior: 'smooth' }
    const b: VScrollIntoViewOptions = a
    const s: ScrollIntoViewState = 'idle'
    expect(b.behavior).toBe('smooth')
    expect(s).toBe('idle')
  })
})
