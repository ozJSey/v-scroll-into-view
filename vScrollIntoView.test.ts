import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createApp, ref, nextTick, effectScope, type Directive, type App } from 'vue'
import { vScrollIntoView, useScrollIntoView, type VScrollIntoViewOptions } from './vScrollIntoView'
// Internal, deliberately not part of the public surface: latch resets, so a
// check can prove a warning fires rather than prove an earlier test spent it,
// and prove the in-flight-destination path rather than inherit a leftover.
import { resetWarnings } from './src/warn'
import { resetDestinations } from './src/pending-scroll'

// ---------------------------------------------------------------------------
// RAF helpers — manual flush so we can verify scheduling behavior
// ---------------------------------------------------------------------------
let rafCallbacks: Array<{ id: number; cb: FrameRequestCallback }> = []
let nextRafId = 1

function mockRaf(cb: FrameRequestCallback): number {
  const id = nextRafId++
  rafCallbacks.push({ id, cb })
  return id
}

function mockCancelRaf(id: number): void {
  rafCallbacks = rafCallbacks.filter((entry) => entry.id !== id)
}

function flushRaf(): void {
  const pending = [...rafCallbacks]
  rafCallbacks = []
  pending.forEach((entry) => entry.cb(performance.now()))
}

// ---------------------------------------------------------------------------
// Helpers to mount a directive-driven component
// ---------------------------------------------------------------------------
interface MountResult {
  app: App
  container: HTMLDivElement
  el: HTMLDivElement
}

function mountWithValue(value: unknown): MountResult {
  const container = document.createElement('div')
  document.body.appendChild(container)

  const inner = document.createElement('div')
  inner.id = 'target'
  container.appendChild(inner)

  inner.scrollIntoView = vi.fn()

  const app = createApp({ template: '<div></div>' })
  app.directive('scroll-into-view', vScrollIntoView)

  // Manually invoke mounted hook
  const binding = { value, oldValue: undefined, modifiers: {}, dir: {} } as any
  ;(vScrollIntoView as any).mounted(inner, binding)

  return { app, container, el: inner }
}

function triggerUpdate(el: HTMLElement, newValue: unknown, oldValue: unknown): void {
  const binding = {
    value: newValue,
    oldValue,
    modifiers: {},
    dir: {},
  } as any
  ;(vScrollIntoView as any).updated(el, binding)
}

function triggerUnmount(el: HTMLElement): void {
  ;(vScrollIntoView as any).unmounted(el)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('vScrollIntoView', () => {
  beforeEach(() => {
    rafCallbacks = []
    nextRafId = 1
    vi.stubGlobal('requestAnimationFrame', mockRaf)
    vi.stubGlobal('cancelAnimationFrame', mockCancelRaf)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  // --- Mount behavior -------------------------------------------------------

  it('calls scrollIntoView on mount when value is true', () => {
    const { el } = mountWithValue(true)
    flushRaf()
    expect(el.scrollIntoView).toHaveBeenCalledOnce()
    expect(el.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'nearest',
    })
  })

  it('calls scrollIntoView on mount when value is undefined (bare directive)', () => {
    const { el } = mountWithValue(undefined)
    flushRaf()
    expect(el.scrollIntoView).toHaveBeenCalledOnce()
  })

  it('does NOT call scrollIntoView when value is false', () => {
    const { el } = mountWithValue(false)
    flushRaf()
    expect(el.scrollIntoView).not.toHaveBeenCalled()
  })

  it('does NOT call scrollIntoView when condition is false in options object', () => {
    const { el } = mountWithValue({ condition: false })
    flushRaf()
    expect(el.scrollIntoView).not.toHaveBeenCalled()
  })

  // --- Options passthrough ---------------------------------------------------

  it('passes behavior/block/inline options to scrollIntoView', () => {
    const { el } = mountWithValue({
      condition: true,
      behavior: 'instant',
      block: 'start',
      inline: 'center',
    })
    flushRaf()
    expect(el.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'instant',
      block: 'start',
      inline: 'center',
    })
  })

  // --- Edge detection --------------------------------------------------------

  it('calls scrollIntoView on false-to-true transition', () => {
    const { el } = mountWithValue(false)
    flushRaf()
    expect(el.scrollIntoView).not.toHaveBeenCalled()

    triggerUpdate(el, true, false)
    flushRaf()
    expect(el.scrollIntoView).toHaveBeenCalledOnce()
  })

  it('does NOT re-scroll when condition stays true', () => {
    const { el } = mountWithValue(true)
    flushRaf()
    expect(el.scrollIntoView).toHaveBeenCalledOnce()

    triggerUpdate(el, true, true)
    flushRaf()
    expect(el.scrollIntoView).toHaveBeenCalledOnce() // still just the initial call
  })

  it('re-scrolls after true-to-false-to-true cycle', () => {
    const { el } = mountWithValue(true)
    flushRaf()
    expect(el.scrollIntoView).toHaveBeenCalledOnce()

    // true -> false
    triggerUpdate(el, false, true)
    flushRaf()
    expect(el.scrollIntoView).toHaveBeenCalledOnce() // no new call

    // false -> true
    triggerUpdate(el, true, false)
    flushRaf()
    expect(el.scrollIntoView).toHaveBeenCalledTimes(2)
  })

  // --- always mode -----------------------------------------------------------

  it('always: true re-scrolls on every truthy update', () => {
    const { el } = mountWithValue({ condition: true, always: true })
    flushRaf()
    expect(el.scrollIntoView).toHaveBeenCalledOnce()

    triggerUpdate(el, { condition: true, always: true }, { condition: true, always: true })
    flushRaf()
    expect(el.scrollIntoView).toHaveBeenCalledTimes(2)

    triggerUpdate(el, { condition: true, always: true }, { condition: true, always: true })
    flushRaf()
    expect(el.scrollIntoView).toHaveBeenCalledTimes(3)
  })

  // --- Object form transitions -----------------------------------------------

  it('handles object form condition transitions', () => {
    const { el } = mountWithValue({ condition: false, behavior: 'instant' })
    flushRaf()
    expect(el.scrollIntoView).not.toHaveBeenCalled()

    triggerUpdate(
      el,
      { condition: true, behavior: 'instant' },
      { condition: false, behavior: 'instant' },
    )
    flushRaf()
    expect(el.scrollIntoView).toHaveBeenCalledOnce()
    expect(el.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'instant',
      block: 'nearest',
      inline: 'nearest',
    })
  })

  // --- rAF scheduling --------------------------------------------------------

  it('uses requestAnimationFrame (scrollIntoView called after RAF flush)', () => {
    const { el } = mountWithValue(true)
    // Before flush — should not have been called yet
    expect(el.scrollIntoView).not.toHaveBeenCalled()
    flushRaf()
    expect(el.scrollIntoView).toHaveBeenCalledOnce()
  })

  it('cancels pending RAF on unmount', () => {
    const { el } = mountWithValue(true)
    // RAF is queued but not flushed
    expect(el.scrollIntoView).not.toHaveBeenCalled()

    triggerUnmount(el)
    flushRaf()
    // Should NOT have been called because we cancelled
    expect(el.scrollIntoView).not.toHaveBeenCalled()
  })

  it('does not throw when unmounting element without state', () => {
    const el = document.createElement('div')
    expect(() => triggerUnmount(el)).not.toThrow()
  })

  // --- v-for scenario --------------------------------------------------------

  it('v-for scenario: only the matching element scrolls', () => {
    const elements: HTMLElement[] = []
    const mocks: ReturnType<typeof vi.fn>[] = []

    for (let i = 0; i < 5; i++) {
      const el = document.createElement('div')
      el.scrollIntoView = vi.fn()
      mocks.push(el.scrollIntoView as unknown as ReturnType<typeof vi.fn>)
      elements.push(el)

      const isActive = i === 2
      const binding = { value: isActive, oldValue: undefined, modifiers: {}, dir: {} } as any
      ;(vScrollIntoView as any).mounted(el, binding)
    }

    flushRaf()

    for (let i = 0; i < 5; i++) {
      if (i === 2) {
        expect(mocks[i]).toHaveBeenCalledOnce()
      } else {
        expect(mocks[i]).not.toHaveBeenCalled()
      }
    }
  })

  // --- Default condition in object form --------------------------------------

  it('defaults condition to true when omitted in object form', () => {
    const { el } = mountWithValue({ behavior: 'instant' })
    flushRaf()
    expect(el.scrollIntoView).toHaveBeenCalledOnce()
    expect(el.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'instant',
      block: 'nearest',
      inline: 'nearest',
    })
  })
})

// ---------------------------------------------------------------------------
// Container option — scroll a chosen ancestor instead of the nearest scrollable
// ---------------------------------------------------------------------------
/**
 * A container whose numbers are CONSISTENT with each other, the way a real
 * element's are.
 *
 * The old fixture took `rect`, `clientHeight` and `scrollTop` as three free
 * numbers, which let it describe geometries no element can have — and made the
 * border-width defect of SIV-4 S1 undetectable, because the one relationship
 * that was wrong (`getBoundingClientRect()` reports the BORDER box while
 * `scrollTop`/`clientHeight` are measured from the PADDING box) was never
 * expressed. Here the border is the input and everything else is derived:
 *
 *   rect.height = clientHeight + 2 × border      (border box wraps the scrollport)
 *   clientTop   = border                          (the gap between the two origins)
 *   offsetHeight = rect.height                    (so the scale ratio is 1)
 *
 * `scrollHeight` matters too: jsdom reports 0 for it, and the executor clamps
 * its destination to the scrollable range, so a fixture without one clamps
 * every scroll to 0.
 */
function makeContainer(opts: {
  scrollTop?: number
  scrollLeft?: number
  clientHeight?: number
  clientWidth?: number
  /** Border width on every side. `clientTop`/`clientLeft` follow it. */
  border?: number
  scrollHeight?: number
  scrollWidth?: number
  rect?: { top?: number; left?: number }
} = {}): HTMLDivElement {
  const c = document.createElement('div')
  document.body.appendChild(c)
  const border = opts.border ?? 0
  const clientHeight = opts.clientHeight ?? 200
  const clientWidth = opts.clientWidth ?? 200
  const define = (prop: string, value: number) =>
    Object.defineProperty(c, prop, { value, writable: true, configurable: true })

  // Longhands, not the `overflow` shorthand: jsdom does not expand the
  // shorthand into computed longhands, and `isScrollable` reads the longhands.
  c.style.overflowY = 'auto'
  c.style.overflowX = 'auto'
  c.scrollTo = vi.fn()
  define('scrollTop', opts.scrollTop ?? 0)
  define('scrollLeft', opts.scrollLeft ?? 0)
  define('clientHeight', clientHeight)
  define('clientWidth', clientWidth)
  define('clientTop', border)
  define('clientLeft', border)
  define('scrollHeight', opts.scrollHeight ?? Math.max(clientHeight, 10_000))
  define('scrollWidth', opts.scrollWidth ?? Math.max(clientWidth, 10_000))

  const r = {
    top: opts.rect?.top ?? 0,
    left: opts.rect?.left ?? 0,
    width: clientWidth + border * 2,
    height: clientHeight + border * 2,
  }
  define('offsetHeight', r.height)
  define('offsetWidth', r.width)
  c.getBoundingClientRect = vi.fn(() => ({
    top: r.top,
    left: r.left,
    right: r.left + r.width,
    bottom: r.top + r.height,
    width: r.width,
    height: r.height,
    x: r.left,
    y: r.top,
    toJSON: () => ({}),
  })) as any
  return c
}

function setElementRect(el: HTMLElement, rect: { top: number; left: number; width: number; height: number }): void {
  el.getBoundingClientRect = vi.fn(() => ({
    top: rect.top,
    left: rect.left,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    width: rect.width,
    height: rect.height,
    x: rect.left,
    y: rect.top,
    toJSON: () => ({}),
  })) as any
}

function mountWithValueAndContainerSetup(value: unknown, target: HTMLElement): void {
  const binding = { value, oldValue: undefined, modifiers: {}, dir: {} } as any
  ;(vScrollIntoView as any).mounted(target, binding)
}

describe('vScrollIntoView — container option', () => {
  beforeEach(() => {
    rafCallbacks = []
    nextRafId = 1
    vi.stubGlobal('requestAnimationFrame', mockRaf)
    vi.stubGlobal('cancelAnimationFrame', mockCancelRaf)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('container as HTMLElement: scrolls container, not native scrollIntoView', () => {
    const container = makeContainer({ clientHeight: 200 })
    const target = document.createElement('div')
    container.appendChild(target)
    target.scrollIntoView = vi.fn()
    setElementRect(target, { top: 300, left: 0, width: 50, height: 50 })

    mountWithValueAndContainerSetup({ container, block: 'start' }, target)
    flushRaf()

    expect(container.scrollTo).toHaveBeenCalledOnce()
    expect(target.scrollIntoView).not.toHaveBeenCalled()
  })

  it('container as CSS selector string: resolves via document.querySelector at scroll time', () => {
    const container = makeContainer()
    container.id = 'scroll-host'
    const target = document.createElement('div')
    container.appendChild(target)
    target.scrollIntoView = vi.fn()
    setElementRect(target, { top: 100, left: 0, width: 50, height: 50 })

    mountWithValueAndContainerSetup({ container: '#scroll-host', block: 'start' }, target)
    flushRaf()

    expect(container.scrollTo).toHaveBeenCalledOnce()
  })

  it('container as :scope selector: resolves via el.closest', () => {
    const container = makeContainer()
    container.classList.add('chat-pane')
    const target = document.createElement('div')
    container.appendChild(target)
    target.scrollIntoView = vi.fn()
    setElementRect(target, { top: 100, left: 0, width: 50, height: 50 })

    mountWithValueAndContainerSetup({ container: ':scope .chat-pane', block: 'start' }, target)
    flushRaf()

    expect(container.scrollTo).toHaveBeenCalledOnce()
  })

  it('container as () => HTMLElement getter: invoked each scroll', () => {
    const container = makeContainer()
    const target = document.createElement('div')
    container.appendChild(target)
    target.scrollIntoView = vi.fn()
    setElementRect(target, { top: 100, left: 0, width: 50, height: 50 })

    const getter = vi.fn(() => container)

    mountWithValueAndContainerSetup({ container: getter, block: 'start' }, target)
    flushRaf()
    expect(getter).toHaveBeenCalledTimes(1)

    triggerUpdate(target, { container: getter, block: 'start', condition: false }, { container: getter, block: 'start' })
    triggerUpdate(target, { container: getter, block: 'start', condition: true }, { container: getter, block: 'start', condition: false })
    flushRaf()
    expect(getter).toHaveBeenCalledTimes(2)
  })

  it('container resolving to null: no-op, no throw, no native fallback', () => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    target.scrollIntoView = vi.fn()
    setElementRect(target, { top: 100, left: 0, width: 50, height: 50 })

    expect(() =>
      mountWithValueAndContainerSetup({ container: () => null, block: 'start' }, target),
    ).not.toThrow()
    expect(() => flushRaf()).not.toThrow()

    expect(target.scrollIntoView).not.toHaveBeenCalled()
  })

  it('container detached from DOM at rAF flush: skips scroll silently', () => {
    const container = makeContainer()
    const target = document.createElement('div')
    container.appendChild(target)
    target.scrollIntoView = vi.fn()
    setElementRect(target, { top: 100, left: 0, width: 50, height: 50 })

    mountWithValueAndContainerSetup({ container, block: 'start' }, target)
    container.remove()
    expect(() => flushRaf()).not.toThrow()
    expect(container.scrollTo).not.toHaveBeenCalled()
  })

  it('container swapped mid-life: second scroll uses new container', () => {
    const containerA = makeContainer()
    const containerB = makeContainer()
    const target = document.createElement('div')
    containerA.appendChild(target)
    target.scrollIntoView = vi.fn()
    setElementRect(target, { top: 100, left: 0, width: 50, height: 50 })

    mountWithValueAndContainerSetup({ container: containerA, condition: true, block: 'start' }, target)
    flushRaf()
    expect(containerA.scrollTo).toHaveBeenCalledOnce()
    expect(containerB.scrollTo).not.toHaveBeenCalled()

    triggerUpdate(target, { container: containerB, condition: false, block: 'start' }, { container: containerA, condition: true, block: 'start' })
    containerB.appendChild(target)
    triggerUpdate(target, { container: containerB, condition: true, block: 'start' }, { container: containerB, condition: false, block: 'start' })
    flushRaf()
    expect(containerB.scrollTo).toHaveBeenCalledOnce()
    expect(containerA.scrollTo).toHaveBeenCalledOnce()
  })

  it('container with block: start aligns target relative top to container top', () => {
    const container = makeContainer({ scrollTop: 50, clientHeight: 200 })
    const target = document.createElement('div')
    container.appendChild(target)
    setElementRect(target, { top: 250, left: 0, width: 50, height: 50 })

    mountWithValueAndContainerSetup({ container, block: 'start' }, target)
    flushRaf()

    expect(container.scrollTo).toHaveBeenCalledWith({
      top: 300,
      left: 0,
      behavior: 'smooth',
    })
  })

  it('container with block: end aligns bottom of target to bottom of container', () => {
    const container = makeContainer({ scrollTop: 0, clientHeight: 200 })
    const target = document.createElement('div')
    container.appendChild(target)
    setElementRect(target, { top: 400, left: 0, width: 50, height: 50 })

    mountWithValueAndContainerSetup({ container, block: 'end' }, target)
    flushRaf()

    expect(container.scrollTo).toHaveBeenCalledWith({
      top: 250,
      left: 0,
      behavior: 'smooth',
    })
  })

  it('container with block: center centers target in container viewport', () => {
    const container = makeContainer({ scrollTop: 0, clientHeight: 200 })
    const target = document.createElement('div')
    container.appendChild(target)
    setElementRect(target, { top: 300, left: 0, width: 50, height: 50 })

    mountWithValueAndContainerSetup({ container, block: 'center' }, target)
    flushRaf()

    expect(container.scrollTo).toHaveBeenCalledWith({
      top: 225,
      left: 0,
      behavior: 'smooth',
    })
  })

  it('container with block: nearest no-op when target already visible', () => {
    const container = makeContainer({ scrollTop: 0, clientHeight: 200 })
    const target = document.createElement('div')
    container.appendChild(target)
    setElementRect(target, { top: 50, left: 0, width: 50, height: 50 })

    mountWithValueAndContainerSetup({ container, block: 'nearest' }, target)
    flushRaf()

    expect(container.scrollTo).not.toHaveBeenCalled()
  })

  it('container with block: nearest scrolls down when target below viewport', () => {
    const container = makeContainer({ scrollTop: 0, clientHeight: 200 })
    const target = document.createElement('div')
    container.appendChild(target)
    setElementRect(target, { top: 300, left: 0, width: 50, height: 50 })

    mountWithValueAndContainerSetup({ container, block: 'nearest' }, target)
    flushRaf()

    expect(container.scrollTo).toHaveBeenCalledWith({
      top: 150,
      left: 0,
      behavior: 'smooth',
    })
  })

  it('container with behavior: smooth passes through to container.scrollTo', () => {
    const container = makeContainer({ scrollTop: 0 })
    const target = document.createElement('div')
    container.appendChild(target)
    setElementRect(target, { top: 100, left: 0, width: 50, height: 50 })

    mountWithValueAndContainerSetup({ container, block: 'start', behavior: 'smooth' }, target)
    flushRaf()

    expect(container.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth' }))
  })

  it('container with behavior: instant passes through to container.scrollTo', () => {
    const container = makeContainer({ scrollTop: 0 })
    const target = document.createElement('div')
    container.appendChild(target)
    setElementRect(target, { top: 100, left: 0, width: 50, height: 50 })

    mountWithValueAndContainerSetup({ container, block: 'start', behavior: 'instant' }, target)
    flushRaf()

    expect(container.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'instant' }))
  })
})

// ---------------------------------------------------------------------------
// Offset option — sticky-header gap
// ---------------------------------------------------------------------------
describe('vScrollIntoView — offset option', () => {
  beforeEach(() => {
    rafCallbacks = []
    nextRafId = 1
    vi.stubGlobal('requestAnimationFrame', mockRaf)
    vi.stubGlobal('cancelAnimationFrame', mockCancelRaf)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('offset { top: 80 } with container: subtracts from target scrollTop', () => {
    const container = makeContainer({ scrollTop: 0, clientHeight: 200 })
    const target = document.createElement('div')
    container.appendChild(target)
    setElementRect(target, { top: 300, left: 0, width: 50, height: 50 })

    mountWithValueAndContainerSetup({ container, block: 'start', offset: { top: 80 } }, target)
    flushRaf()

    expect(container.scrollTo).toHaveBeenCalledWith({
      top: 220,
      left: 0,
      behavior: 'smooth',
    })
  })

  it('offset { left: 16 } with container: subtracts from target scrollLeft', () => {
    const container = makeContainer({ scrollLeft: 0, clientWidth: 200 })
    const target = document.createElement('div')
    container.appendChild(target)
    setElementRect(target, { top: 0, left: 300, width: 50, height: 50 })

    mountWithValueAndContainerSetup({ container, block: 'start', inline: 'start', offset: { left: 16 } }, target)
    flushRaf()

    expect(container.scrollTo).toHaveBeenCalledWith({
      top: 0,
      left: 284,
      behavior: 'smooth',
    })
  })

  it('offset without container: writes scrollMarginTop on host inline style during call', () => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    let marginAtCall: string | null = null
    target.scrollIntoView = vi.fn(() => {
      marginAtCall = target.style.scrollMarginTop
    }) as any

    mountWithValueAndContainerSetup({ offset: { top: 64 } }, target)
    flushRaf()

    expect(target.scrollIntoView).toHaveBeenCalledOnce()
    expect(marginAtCall).toBe('64px')
  })

  it('offset without container: writes scrollMarginLeft on host inline style during call', () => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    let marginAtCall: string | null = null
    target.scrollIntoView = vi.fn(() => {
      marginAtCall = target.style.scrollMarginLeft
    }) as any

    mountWithValueAndContainerSetup({ offset: { left: 24 } }, target)
    flushRaf()

    expect(marginAtCall).toBe('24px')
  })

  it('offset without container: restores prior inline scrollMargin values after call', () => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    target.style.scrollMarginTop = '12px'
    target.scrollIntoView = vi.fn()

    mountWithValueAndContainerSetup({ offset: { top: 64 } }, target)
    flushRaf()

    expect(target.style.scrollMarginTop).toBe('12px')
  })

  it('offset only top: leaves scrollMarginLeft unchanged', () => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    target.style.scrollMarginLeft = '7px'
    let leftAtCall: string | null = null
    target.scrollIntoView = vi.fn(() => {
      leftAtCall = target.style.scrollMarginLeft
    }) as any

    mountWithValueAndContainerSetup({ offset: { top: 64 } }, target)
    flushRaf()

    expect(leftAtCall).toBe('7px')
  })

  it('offset zero treated as legitimate value (subtracts 0, no-op math)', () => {
    const container = makeContainer({ scrollTop: 0, clientHeight: 200 })
    const target = document.createElement('div')
    container.appendChild(target)
    setElementRect(target, { top: 100, left: 0, width: 50, height: 50 })

    mountWithValueAndContainerSetup({ container, block: 'start', offset: { top: 0 } }, target)
    flushRaf()

    expect(container.scrollTo).toHaveBeenCalledWith({
      top: 100,
      left: 0,
      behavior: 'smooth',
    })
  })

  it('offset with smooth behavior: native call still receives behavior smooth', () => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    target.scrollIntoView = vi.fn()

    mountWithValueAndContainerSetup({ offset: { top: 64 }, behavior: 'smooth' }, target)
    flushRaf()

    expect(target.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'nearest',
    })
  })

  it('offset with instant behavior: native call still receives behavior instant', () => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    target.scrollIntoView = vi.fn()

    mountWithValueAndContainerSetup({ offset: { top: 64 }, behavior: 'instant' }, target)
    flushRaf()

    expect(target.scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({
      behavior: 'instant',
    }))
  })
})

// ---------------------------------------------------------------------------
// Back-compat anchor — no container, no offset = identical to v1 surface
// ---------------------------------------------------------------------------
describe('vScrollIntoView — back-compat anchor', () => {
  beforeEach(() => {
    rafCallbacks = []
    nextRafId = 1
    vi.stubGlobal('requestAnimationFrame', mockRaf)
    vi.stubGlobal('cancelAnimationFrame', mockCancelRaf)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('no container, no offset: calls native scrollIntoView with identical shape to v1', () => {
    const { el } = mountWithValue({ condition: true, behavior: 'smooth', block: 'center', inline: 'end' })
    flushRaf()
    expect(el.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'center',
      inline: 'end',
    })
  })
})

// ---------------------------------------------------------------------------
// Hardening — less-trivial edge cases beyond the acceptance set
// ---------------------------------------------------------------------------
describe('vScrollIntoView — hardening', () => {
  beforeEach(() => {
    rafCallbacks = []
    nextRafId = 1
    vi.stubGlobal('requestAnimationFrame', mockRaf)
    vi.stubGlobal('cancelAnimationFrame', mockCancelRaf)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('container + offset.top with block: end: the gap is on the LEADING edge, so end is untouched (SIV-4 S3)', () => {
    // `offset.top` is a leading-edge gap — the same thing the container-less
    // path writes as an inline `scroll-margin-top`, which CSS applies fully to
    // `start`, half to `center` and NOT AT ALL to `end`. Until 1.3.0 the
    // container path subtracted it from every alignment, so a chat pane with a
    // global `offset: { top: 64 }` pinned with `block: 'end'` rested 64px above
    // the bottom and the native path did not.
    const container = makeContainer({ scrollTop: 0, clientHeight: 200 })
    const target = document.createElement('div')
    container.appendChild(target)
    setElementRect(target, { top: 400, left: 0, width: 50, height: 50 })

    mountWithValueAndContainerSetup({ container, block: 'end', offset: { top: 32 } }, target)
    flushRaf()

    // block: end -> 450 - 200 = 250, offset or no offset.
    expect(container.scrollTo).toHaveBeenCalledWith({
      top: 250,
      left: 0,
      behavior: 'smooth',
    })
  })

  it('container + offset.top with block: center: the gap counts HALF, as scroll-margin does (SIV-4 S3)', () => {
    const container = makeContainer({ scrollTop: 0, clientHeight: 200 })
    const target = document.createElement('div')
    container.appendChild(target)
    setElementRect(target, { top: 400, left: 0, width: 50, height: 50 })

    mountWithValueAndContainerSetup({ container, block: 'center', offset: { top: 60 } }, target)
    flushRaf()

    // The scroll box is [400 - 60, 450]; its centre is 395, the scrollport's is
    // 100, so scrollTop 295 — 30 above the un-offset 325, i.e. half the gap.
    expect(container.scrollTo).toHaveBeenCalledWith({
      top: 295,
      left: 0,
      behavior: 'smooth',
    })
  })

  it('container + negative offset: adds gap (subtracts negative)', () => {
    const container = makeContainer({ scrollTop: 0, clientHeight: 200 })
    const target = document.createElement('div')
    container.appendChild(target)
    setElementRect(target, { top: 300, left: 0, width: 50, height: 50 })

    mountWithValueAndContainerSetup({ container, block: 'start', offset: { top: -20 } }, target)
    flushRaf()

    // block: start -> 300; subtract -20 -> 320
    expect(container.scrollTo).toHaveBeenCalledWith({
      top: 320,
      left: 0,
      behavior: 'smooth',
    })
  })

  it('container inline: center centers target in container viewport horizontally', () => {
    const container = makeContainer({ scrollLeft: 0, clientWidth: 200 })
    const target = document.createElement('div')
    container.appendChild(target)
    setElementRect(target, { top: 0, left: 300, width: 50, height: 50 })

    mountWithValueAndContainerSetup({ container, block: 'start', inline: 'center' }, target)
    flushRaf()

    // inline: center -> relLeft (300) + width/2 (25) - clientWidth/2 (100) = 225
    expect(container.scrollTo).toHaveBeenCalledWith({
      top: 0,
      left: 225,
      behavior: 'smooth',
    })
  })

  it('container inline: nearest scrolls right when target is past viewport right edge', () => {
    const container = makeContainer({ scrollLeft: 0, clientWidth: 200 })
    const target = document.createElement('div')
    container.appendChild(target)
    setElementRect(target, { top: 0, left: 300, width: 50, height: 50 })

    mountWithValueAndContainerSetup({ container, block: 'start', inline: 'nearest' }, target)
    flushRaf()

    // inline: nearest, target relRight = 350, visibleRight = 200 -> scrollLeft = 350 - 200 = 150
    expect(container.scrollTo).toHaveBeenCalledWith({
      top: 0,
      left: 150,
      behavior: 'smooth',
    })
  })

  it('container inline: nearest scrolls left when target is past viewport left edge', () => {
    const container = makeContainer({ scrollLeft: 200, clientWidth: 200 })
    const target = document.createElement('div')
    container.appendChild(target)
    // Target at viewport-relative left -50 -> relLeft = -50 - 0 + 200 = 150 (left of scrollLeft 200)
    setElementRect(target, { top: 0, left: -50, width: 50, height: 50 })

    mountWithValueAndContainerSetup({ container, block: 'start', inline: 'nearest' }, target)
    flushRaf()

    // relLeft = 150 < scrollLeft 200 -> scrollLeft = relLeft = 150
    expect(container.scrollTo).toHaveBeenCalledWith({
      top: 0,
      left: 150,
      behavior: 'smooth',
    })
  })

  it('container as selector with no match: silent no-op, no native fallback', () => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    target.scrollIntoView = vi.fn()
    setElementRect(target, { top: 100, left: 0, width: 50, height: 50 })

    mountWithValueAndContainerSetup({ container: '#nope-does-not-exist', block: 'start' }, target)
    expect(() => flushRaf()).not.toThrow()
    expect(target.scrollIntoView).not.toHaveBeenCalled()
  })

  it(':scope alone (no descendant selector): silent no-op', () => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    target.scrollIntoView = vi.fn()
    setElementRect(target, { top: 100, left: 0, width: 50, height: 50 })

    mountWithValueAndContainerSetup({ container: ':scope', block: 'start' }, target)
    expect(() => flushRaf()).not.toThrow()
    expect(target.scrollIntoView).not.toHaveBeenCalled()
  })

  it('offset path: scrollMargin is restored even when scrollIntoView throws', () => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    target.style.scrollMarginTop = '9px'
    target.style.scrollMarginLeft = '3px'
    target.scrollIntoView = vi.fn(() => {
      throw new Error('boom')
    }) as any

    mountWithValueAndContainerSetup({ offset: { top: 64, left: 16 } }, target)
    expect(() => flushRaf()).toThrow('boom')

    expect(target.style.scrollMarginTop).toBe('9px')
    expect(target.style.scrollMarginLeft).toBe('3px')
  })

  it('mid-life option swap from container -> no container uses native path', () => {
    const container = makeContainer()
    const target = document.createElement('div')
    container.appendChild(target)
    target.scrollIntoView = vi.fn()
    setElementRect(target, { top: 100, left: 0, width: 50, height: 50 })

    mountWithValueAndContainerSetup({ container, condition: true, block: 'start' }, target)
    flushRaf()
    expect(container.scrollTo).toHaveBeenCalledOnce()
    expect(target.scrollIntoView).not.toHaveBeenCalled()

    // Drop container, condition: false -> true edge
    triggerUpdate(target, { condition: false, block: 'start' }, { container, condition: true, block: 'start' })
    triggerUpdate(target, { condition: true, block: 'start' }, { condition: false, block: 'start' })
    flushRaf()
    expect(target.scrollIntoView).toHaveBeenCalledOnce()
    expect(container.scrollTo).toHaveBeenCalledOnce() // unchanged
  })

  it('two updates between flushes: only one scrollTo fires (rAF coalescing)', () => {
    const container = makeContainer({ scrollTop: 0, clientHeight: 200 })
    const target = document.createElement('div')
    container.appendChild(target)
    setElementRect(target, { top: 300, left: 0, width: 50, height: 50 })

    // Mount with always: true to allow re-scrolls without false->true cycle
    mountWithValueAndContainerSetup({ container, block: 'start', always: true, condition: true }, target)
    // The mount queued a rAF; trigger another update before flush
    triggerUpdate(
      target,
      { container, block: 'start', always: true, condition: true },
      { container, block: 'start', always: true, condition: true },
    )

    flushRaf()
    expect(container.scrollTo).toHaveBeenCalledOnce()
  })

  it('offset with only left: leaves scrollMarginTop untouched even if previously set', () => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    target.style.scrollMarginTop = '11px'
    let topAtCall: string | null = null
    target.scrollIntoView = vi.fn(() => {
      topAtCall = target.style.scrollMarginTop
    }) as any

    mountWithValueAndContainerSetup({ offset: { left: 24 } }, target)
    flushRaf()

    expect(topAtCall).toBe('11px')
    expect(target.style.scrollMarginTop).toBe('11px')
  })
})

// ---------------------------------------------------------------------------
// useScrollIntoView composable
// ---------------------------------------------------------------------------
describe('useScrollIntoView — composable', () => {
  beforeEach(() => {
    rafCallbacks = []
    nextRafId = 1
    vi.stubGlobal('requestAnimationFrame', mockRaf)
    vi.stubGlobal('cancelAnimationFrame', mockCancelRaf)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('scroll() calls native scrollIntoView with composable options after rAF', () => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    target.scrollIntoView = vi.fn()

    const api = useScrollIntoView({ target, options: { behavior: 'instant', block: 'start' } })
    api.scroll()
    expect(target.scrollIntoView).not.toHaveBeenCalled()
    flushRaf()
    expect(target.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'instant',
      block: 'start',
      inline: 'nearest',
    })
  })

  it('scroll() with target getter resolves on each call', () => {
    const targetA = document.createElement('div')
    const targetB = document.createElement('div')
    document.body.appendChild(targetA)
    document.body.appendChild(targetB)
    targetA.scrollIntoView = vi.fn()
    targetB.scrollIntoView = vi.fn()

    let current: HTMLElement = targetA
    const api = useScrollIntoView({ target: () => current })
    api.scroll()
    flushRaf()
    expect(targetA.scrollIntoView).toHaveBeenCalledOnce()
    expect(targetB.scrollIntoView).not.toHaveBeenCalled()

    current = targetB
    api.scroll()
    flushRaf()
    expect(targetB.scrollIntoView).toHaveBeenCalledOnce()
  })

  it('scroll() honors container option from composable', () => {
    const container = makeContainer({ clientHeight: 200 })
    const target = document.createElement('div')
    container.appendChild(target)
    target.scrollIntoView = vi.fn()
    setElementRect(target, { top: 300, left: 0, width: 50, height: 50 })

    const api = useScrollIntoView({ target, options: { container, block: 'start' } })
    api.scroll()
    flushRaf()
    expect(container.scrollTo).toHaveBeenCalledOnce()
    expect(target.scrollIntoView).not.toHaveBeenCalled()
  })

  it('state ref is "pending" between scroll() and rAF flush, then "idle"', () => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    target.scrollIntoView = vi.fn()

    const api = useScrollIntoView({ target })
    expect(api.state.value).toBe('idle')
    api.scroll()
    expect(api.state.value).toBe('pending')
    flushRaf()
    expect(api.state.value).toBe('idle')
  })

  it('cancel() actually cancels the pending rAF (scrollIntoView never fires)', () => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    target.scrollIntoView = vi.fn()

    const api = useScrollIntoView({ target })
    api.scroll()
    api.cancel()
    flushRaf()
    expect(target.scrollIntoView).not.toHaveBeenCalled()
    expect(api.state.value).toBe('idle')
  })

  it('cancel() before scroll() is a no-throw, no-op', () => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    const api = useScrollIntoView({ target })
    expect(() => api.cancel()).not.toThrow()
    expect(api.state.value).toBe('idle')
  })

  it('scroll() then scroll() coalesces — only one rAF callback fires the scroll', () => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    target.scrollIntoView = vi.fn()

    const api = useScrollIntoView({ target })
    api.scroll()
    api.scroll()
    flushRaf()
    expect(target.scrollIntoView).toHaveBeenCalledOnce()
  })

  it('update() MERGES options into prior options (preserves prior keys)', () => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    target.scrollIntoView = vi.fn()

    const api = useScrollIntoView({
      target,
      options: { behavior: 'smooth', block: 'start', offset: { top: 64 } },
    })
    api.update({ behavior: 'instant' })
    api.scroll()
    flushRaf()
    // offset.top should still apply because update() should MERGE
    expect(target.style.scrollMarginTop).toBe('') // restored
    expect(target.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'instant',
      block: 'start',
      inline: 'nearest',
    })
  })

  it('update() with offset.top change MERGES — preserves prior container', () => {
    const container = makeContainer({ scrollTop: 0, clientHeight: 200 })
    const target = document.createElement('div')
    container.appendChild(target)
    setElementRect(target, { top: 300, left: 0, width: 50, height: 50 })

    const api = useScrollIntoView({
      target,
      options: { container, block: 'start', offset: { top: 80 } },
    })
    api.update({ offset: { top: 16 } })
    api.scroll()
    flushRaf()

    // Container is preserved across update() → containerScrollTo is called with new offset
    expect(container.scrollTo).toHaveBeenCalledWith({
      top: 284, // 300 - 16
      left: 0,
      behavior: 'smooth',
    })
  })

  it('SSR-safe: target null → scroll is a no-op, state stays idle', () => {
    const api = useScrollIntoView({ target: null })
    api.scroll()
    flushRaf()
    expect(api.state.value).toBe('idle')
  })

  it('target getter throwing → scroll is silently no-op', () => {
    const api = useScrollIntoView({ target: () => { throw new Error('boom') } })
    expect(() => { api.scroll(); flushRaf() }).not.toThrow()
    expect(api.state.value).toBe('idle')
  })

  it('effectScope dispose cancels pending rAF', () => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    target.scrollIntoView = vi.fn()

    const scope = effectScope()
    let api!: ReturnType<typeof useScrollIntoView>
    scope.run(() => {
      api = useScrollIntoView({ target })
    })
    api.scroll()
    scope.stop()
    flushRaf()
    expect(target.scrollIntoView).not.toHaveBeenCalled()
    expect(api.state.value).toBe('idle')
  })

  it('multiple independent composables: each manages its own state', () => {
    const targetA = document.createElement('div')
    const targetB = document.createElement('div')
    document.body.appendChild(targetA)
    document.body.appendChild(targetB)
    targetA.scrollIntoView = vi.fn()
    targetB.scrollIntoView = vi.fn()

    const apiA = useScrollIntoView({ target: targetA })
    const apiB = useScrollIntoView({ target: targetB })
    apiA.scroll()
    apiB.cancel() // independent — should not affect A
    flushRaf()
    expect(targetA.scrollIntoView).toHaveBeenCalledOnce()
    expect(targetB.scrollIntoView).not.toHaveBeenCalled()
  })

  it('TypeScript: VScrollIntoViewOptions is publicly importable + accepted', () => {
    const opts: VScrollIntoViewOptions = { behavior: 'smooth', block: 'center' }
    const target = document.createElement('div')
    target.scrollIntoView = vi.fn()
    document.body.appendChild(target)
    const api = useScrollIntoView({ target, options: opts })
    api.scroll()
    flushRaf()
    expect(target.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'center',
      inline: 'nearest',
    })
  })

  it('called outside an effect scope: no Vue warn emitted (getCurrentScope guard)', () => {
    // The composable internally guards `onScopeDispose` behind a
    // `getCurrentScope()` check so callers outside `setup()` (e.g. unit tests
    // or imperative code) do not see Vue's "no active effect scope" warning.
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const target = document.createElement('div')
    document.body.appendChild(target)

    useScrollIntoView({ target })

    const warnedAboutScope = spy.mock.calls.some((c) =>
      String(c[0] ?? '').includes('onScopeDispose'),
    )
    expect(warnedAboutScope).toBe(false)
    spy.mockRestore()
  })

  it('multiple scroll() then cancel(): state ref returns to idle deterministically', () => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    target.scrollIntoView = vi.fn()
    const api = useScrollIntoView({ target })

    api.scroll()
    expect(api.state.value).toBe('pending')
    api.scroll() // coalesced
    expect(api.state.value).toBe('pending')
    api.cancel()
    expect(api.state.value).toBe('idle')
    flushRaf()
    expect(target.scrollIntoView).not.toHaveBeenCalled()
  })

  it('update() does NOT overwrite container with undefined when omitted', () => {
    const container = makeContainer({ scrollTop: 0, clientHeight: 200 })
    const target = document.createElement('div')
    container.appendChild(target)
    setElementRect(target, { top: 100, left: 0, width: 50, height: 50 })

    const api = useScrollIntoView({
      target,
      options: { container, block: 'start' },
    })
    // Partial update with only behavior — container key absent in the partial
    // must NOT clobber the prior container reference.
    api.update({ behavior: 'instant' })
    api.scroll()
    flushRaf()
    expect(container.scrollTo).toHaveBeenCalledWith({
      top: 100,
      left: 0,
      behavior: 'instant',
    })
  })
})

// ---------------------------------------------------------------------------
// Edge cases — container + offset + `nearest`, RTL probe, behavior:'auto'
// ---------------------------------------------------------------------------
describe('vScrollIntoView — nearest + offset edge cases', () => {
  beforeEach(() => {
    rafCallbacks = []
    nextRafId = 1
    vi.stubGlobal('requestAnimationFrame', mockRaf)
    vi.stubGlobal('cancelAnimationFrame', mockCancelRaf)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('block: nearest + offset.top — target obscured by sticky region scrolls up to reveal', () => {
    // Target sits inside the raw viewport but in the "sticky-header obscured" region
    // (top 64px of viewport). With offset.top: 64, we treat that as obscured and scroll.
    const container = makeContainer({ scrollTop: 100, clientHeight: 400 })
    const target = document.createElement('div')
    container.appendChild(target)
    // Container viewport (after scrollTop=100) shows [100, 500]; target is at relTop = 140 (top: 40 in viewport)
    setElementRect(target, { top: 40, left: 0, width: 50, height: 50 }) // top: 40 - container.top(0) + scrollTop(100) = 140
    Object.defineProperty(container, 'getBoundingClientRect', {
      value: () => ({ top: 0, left: 0, right: 200, bottom: 400, width: 200, height: 400, x: 0, y: 0, toJSON: () => ({}) }),
      writable: true, configurable: true,
    })

    mountWithValueAndContainerSetup({ container, block: 'nearest', offset: { top: 64 } }, target)
    flushRaf()

    // Target relTop = 140 < scroll(100) + offset(64) = 164 → obscured → scroll to relTop - offset = 76
    expect(container.scrollTo).toHaveBeenCalledWith({
      top: 76,
      left: 0,
      behavior: 'smooth',
    })
  })

  it('block: nearest + offset.top — target fully visible below sticky region: no scroll', () => {
    const container = makeContainer({ scrollTop: 0, clientHeight: 400 })
    const target = document.createElement('div')
    container.appendChild(target)
    // Target at relTop = 200, well below the 64px sticky region
    setElementRect(target, { top: 200, left: 0, width: 50, height: 50 })
    Object.defineProperty(container, 'getBoundingClientRect', {
      value: () => ({ top: 0, left: 0, right: 200, bottom: 400, width: 200, height: 400, x: 0, y: 0, toJSON: () => ({}) }),
      writable: true, configurable: true,
    })

    mountWithValueAndContainerSetup({ container, block: 'nearest', offset: { top: 64 } }, target)
    flushRaf()

    expect(container.scrollTo).not.toHaveBeenCalled()
  })

  it('block: nearest WITHOUT offset — target in raw viewport: no scroll (unchanged behavior)', () => {
    const container = makeContainer({ scrollTop: 0, clientHeight: 400 })
    const target = document.createElement('div')
    container.appendChild(target)
    setElementRect(target, { top: 10, left: 0, width: 50, height: 50 })
    Object.defineProperty(container, 'getBoundingClientRect', {
      value: () => ({ top: 0, left: 0, right: 200, bottom: 400, width: 200, height: 400, x: 0, y: 0, toJSON: () => ({}) }),
      writable: true, configurable: true,
    })

    mountWithValueAndContainerSetup({ container, block: 'nearest' }, target)
    flushRaf()
    expect(container.scrollTo).not.toHaveBeenCalled()
  })

  it('inline: nearest + offset.left — target obscured by sticky-left scrolls left', () => {
    const container = makeContainer({ scrollLeft: 100, clientWidth: 400 })
    const target = document.createElement('div')
    container.appendChild(target)
    setElementRect(target, { top: 0, left: 40, width: 50, height: 50 }) // relLeft = 40 + 100 = 140
    Object.defineProperty(container, 'getBoundingClientRect', {
      value: () => ({ top: 0, left: 0, right: 400, bottom: 200, width: 400, height: 200, x: 0, y: 0, toJSON: () => ({}) }),
      writable: true, configurable: true,
    })

    mountWithValueAndContainerSetup({ container, block: 'start', inline: 'nearest', offset: { left: 50 } }, target)
    flushRaf()

    // relLeft 140 < scrollLeft(100) + offset.left(50) = 150 → obscured → scroll to 140 - 50 = 90.
    // block: 'start' on relTop=0 returns 0; container.scrollTop default=0; no offset.top → top: 0.
    expect(container.scrollTo).toHaveBeenCalledWith({
      top: 0,
      left: 90,
      behavior: 'smooth',
    })
  })

  it('behavior: "auto" passed through to native call', () => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    target.scrollIntoView = vi.fn()

    mountWithValueAndContainerSetup({ behavior: 'auto' }, target)
    flushRaf()

    expect(target.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'auto',
      block: 'nearest',
      inline: 'nearest',
    })
  })

  it('null binding value: silent no-op (treated as disabled)', () => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    target.scrollIntoView = vi.fn()
    expect(() => {
      mountWithValueAndContainerSetup(null as any, target)
      flushRaf()
    }).not.toThrow()
    expect(target.scrollIntoView).not.toHaveBeenCalled()
  })

  it('numeric binding value (0): silent no-op (truthy check yields false)', () => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    target.scrollIntoView = vi.fn()
    expect(() => {
      mountWithValueAndContainerSetup(0 as any, target)
      flushRaf()
    }).not.toThrow()
    expect(target.scrollIntoView).not.toHaveBeenCalled()
  })

  it('string binding value: silent no-op', () => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    target.scrollIntoView = vi.fn()
    expect(() => {
      mountWithValueAndContainerSetup('' as any, target)
      flushRaf()
    }).not.toThrow()
    expect(target.scrollIntoView).not.toHaveBeenCalled()
  })

  it('nested scroll containers: only the selected container scrolls', () => {
    const outer = makeContainer({ scrollTop: 0, clientHeight: 400 })
    const inner = makeContainer({ scrollTop: 0, clientHeight: 200 })
    outer.appendChild(inner)
    const target = document.createElement('div')
    inner.appendChild(target)
    target.scrollIntoView = vi.fn()
    setElementRect(target, { top: 300, left: 0, width: 50, height: 50 })

    mountWithValueAndContainerSetup({ container: inner, block: 'start' }, target)
    flushRaf()

    expect(inner.scrollTo).toHaveBeenCalledOnce()
    expect(outer.scrollTo).not.toHaveBeenCalled()
    expect(target.scrollIntoView).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Audit fixes (Run 13): directive/composable drift, malformed selectors,
// teardown races, plugin idempotence
// ---------------------------------------------------------------------------
describe('vScrollIntoView — composable parity with directive (nearest+offset+container)', () => {
  beforeEach(() => {
    rafCallbacks = []
    nextRafId = 1
    vi.stubGlobal('requestAnimationFrame', mockRaf)
    vi.stubGlobal('cancelAnimationFrame', mockCancelRaf)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('composable: block: nearest + offset.top + container — target obscured by sticky region scrolls (parity with directive)', () => {
    // This exact same scenario produces a scrollTo in the DIRECTIVE (line 1218 above).
    // Composable should match. Before fix it skipped the scroll because scrollFor
    // received no offsetStart, so visibleStart was 100 instead of 164, target was
    // considered "visible" at relTop=140, and no scrollTo was issued.
    const container = makeContainer({ scrollTop: 100, clientHeight: 400 })
    const target = document.createElement('div')
    container.appendChild(target)
    setElementRect(target, { top: 40, left: 0, width: 50, height: 50 })
    Object.defineProperty(container, 'getBoundingClientRect', {
      value: () => ({ top: 0, left: 0, right: 200, bottom: 400, width: 200, height: 400, x: 0, y: 0, toJSON: () => ({}) }),
      writable: true, configurable: true,
    })

    const api = useScrollIntoView({
      target,
      options: { container, block: 'nearest', offset: { top: 64 } },
    })
    api.scroll()
    flushRaf()

    expect(container.scrollTo).toHaveBeenCalledWith({
      top: 76,
      left: 0,
      behavior: 'smooth',
    })
  })

  it('composable: block: nearest + offset.top + container — target NOT obscured: no scroll (parity)', () => {
    const container = makeContainer({ scrollTop: 0, clientHeight: 400 })
    const target = document.createElement('div')
    container.appendChild(target)
    setElementRect(target, { top: 200, left: 0, width: 50, height: 50 })
    Object.defineProperty(container, 'getBoundingClientRect', {
      value: () => ({ top: 0, left: 0, right: 200, bottom: 400, width: 200, height: 400, x: 0, y: 0, toJSON: () => ({}) }),
      writable: true, configurable: true,
    })

    const api = useScrollIntoView({
      target,
      options: { container, block: 'nearest', offset: { top: 64 } },
    })
    api.scroll()
    flushRaf()

    expect(container.scrollTo).not.toHaveBeenCalled()
  })

  it('composable: inline: nearest + offset.left + container — target obscured horizontally scrolls (parity)', () => {
    const container = makeContainer({ scrollLeft: 100, clientWidth: 400 })
    const target = document.createElement('div')
    container.appendChild(target)
    setElementRect(target, { top: 0, left: 40, width: 50, height: 50 })
    Object.defineProperty(container, 'getBoundingClientRect', {
      value: () => ({ top: 0, left: 0, right: 400, bottom: 200, width: 400, height: 200, x: 0, y: 0, toJSON: () => ({}) }),
      writable: true, configurable: true,
    })

    const api = useScrollIntoView({
      target,
      options: { container, block: 'start', inline: 'nearest', offset: { left: 50 } },
    })
    api.scroll()
    flushRaf()

    expect(container.scrollTo).toHaveBeenCalledWith({
      top: 0,
      left: 90,
      behavior: 'smooth',
    })
  })

  it('composable: block: start + offset.top + container — final scrollTop matches directive (post-hoc subtraction)', () => {
    const container = makeContainer({ scrollTop: 0, clientHeight: 200 })
    const target = document.createElement('div')
    container.appendChild(target)
    setElementRect(target, { top: 300, left: 0, width: 50, height: 50 })

    const api = useScrollIntoView({
      target,
      options: { container, block: 'start', offset: { top: 80 } },
    })
    api.scroll()
    flushRaf()

    // Directive does: relTop(300) - offset.top(80) = 220 for `start`
    expect(container.scrollTo).toHaveBeenCalledWith({
      top: 220,
      left: 0,
      behavior: 'smooth',
    })
  })
})

describe('vScrollIntoView — malformed selectors (resolveContainer hardening)', () => {
  beforeEach(() => {
    rafCallbacks = []
    nextRafId = 1
    vi.stubGlobal('requestAnimationFrame', mockRaf)
    vi.stubGlobal('cancelAnimationFrame', mockCancelRaf)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('container: "" (empty string) — silent no-op, no DOMException leak', () => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    target.scrollIntoView = vi.fn()
    setElementRect(target, { top: 100, left: 0, width: 50, height: 50 })

    expect(() => {
      mountWithValueAndContainerSetup({ container: '', block: 'start' }, target)
      flushRaf()
    }).not.toThrow()
    expect(target.scrollIntoView).not.toHaveBeenCalled()
  })

  it('container: ">>>" (malformed selector) — silent no-op, no DOMException leak', () => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    target.scrollIntoView = vi.fn()
    setElementRect(target, { top: 100, left: 0, width: 50, height: 50 })

    expect(() => {
      mountWithValueAndContainerSetup({ container: '>>>', block: 'start' }, target)
      flushRaf()
    }).not.toThrow()
    expect(target.scrollIntoView).not.toHaveBeenCalled()
  })

  it('container: ":scope >>>" (malformed scope selector) — silent no-op', () => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    target.scrollIntoView = vi.fn()
    setElementRect(target, { top: 100, left: 0, width: 50, height: 50 })

    expect(() => {
      mountWithValueAndContainerSetup({ container: ':scope >>>', block: 'start' }, target)
      flushRaf()
    }).not.toThrow()
    expect(target.scrollIntoView).not.toHaveBeenCalled()
  })

  it('composable: container "" (empty string) — silent no-op', () => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    target.scrollIntoView = vi.fn()
    setElementRect(target, { top: 100, left: 0, width: 50, height: 50 })

    const api = useScrollIntoView({ target, options: { container: '', block: 'start' } })
    expect(() => { api.scroll(); flushRaf() }).not.toThrow()
    expect(target.scrollIntoView).not.toHaveBeenCalled()
  })

  it('composable: container ":scope @@" malformed — silent no-op', () => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    target.scrollIntoView = vi.fn()
    setElementRect(target, { top: 100, left: 0, width: 50, height: 50 })

    const api = useScrollIntoView({ target, options: { container: ':scope @@', block: 'start' } })
    expect(() => { api.scroll(); flushRaf() }).not.toThrow()
    expect(target.scrollIntoView).not.toHaveBeenCalled()
  })
})

describe('vScrollIntoView — teardown races + plugin idempotence', () => {
  beforeEach(() => {
    rafCallbacks = []
    nextRafId = 1
    vi.stubGlobal('requestAnimationFrame', mockRaf)
    vi.stubGlobal('cancelAnimationFrame', mockCancelRaf)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('unmount cancels the queued frame, so the scroll never runs', () => {
    // This test used to claim more than it did. Its comment said "the rAF cb
    // still gets invoked manually (paranoia: browsers may race the cancel)" —
    // nothing invoked it: `triggerUnmount` calls the mocked
    // `cancelAnimationFrame`, which removes the callback from the queue, so the
    // `flushRaf()` below iterates nothing and both assertions passed vacuously.
    // It was cited as coverage for a `!stateMap.has(el)` guard in `directive.ts`
    // that it never reached, and that guard is now gone: `cancelAnimationFrame`
    // is specified to remove the callback (the HTML spec sets a cancelled flag
    // that the frame-callback loop checks), so the state it defended against is
    // not reachable, and defending against unreachable states is what
    // CONVENTIONS bans. What is left is the claim the test can actually make.
    const target = document.createElement('div')
    document.body.appendChild(target)
    target.scrollIntoView = vi.fn()

    mountWithValueAndContainerSetup({ condition: true }, target)
    expect(rafCallbacks).toHaveLength(1)

    triggerUnmount(target)
    expect(rafCallbacks).toHaveLength(0)

    expect(() => flushRaf()).not.toThrow()
    expect(target.scrollIntoView).not.toHaveBeenCalled()
  })

  it('rapid condition flipping false→true→false→true within one frame: only one scroll fires (rAF coalescing)', () => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    target.scrollIntoView = vi.fn()

    mountWithValueAndContainerSetup({ condition: false }, target)
    triggerUpdate(target, { condition: true }, { condition: false })
    triggerUpdate(target, { condition: false }, { condition: true })
    triggerUpdate(target, { condition: true }, { condition: false })
    flushRaf()
    expect(target.scrollIntoView).toHaveBeenCalledOnce()
  })

  it('plugin: double-install on same app does not register the directive twice', async () => {
    const { ScrollIntoViewPlugin } = await import('./vScrollIntoView')
    // Vue emits a console.warn on the second install — expected; assert it's
    // the right warning and don't pollute the test runner output.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const app = createApp({ template: '<div />' })
    app.use(ScrollIntoViewPlugin)
    app.use(ScrollIntoViewPlugin)
    // Vue's app.use() guards against duplicate installs internally via _installedPlugins.
    // The directive should still be registered under DIRECTIVE_NAME.
    const ctx = (app as any)._context as { directives: Record<string, unknown> }
    expect(ctx.directives['scroll-into-view']).toBe(vScrollIntoView)
    expect(warn.mock.calls.some((c) => String(c[0] ?? '').includes('Plugin has already been applied'))).toBe(true)
    warn.mockRestore()
  })

  it('plugin: two apps install independently (Vue creates isolated _context per app)', async () => {
    const { ScrollIntoViewPlugin } = await import('./vScrollIntoView')
    const app1 = createApp({ template: '<div />' })
    const app2 = createApp({ template: '<div />' })
    app1.use(ScrollIntoViewPlugin)
    app2.use(ScrollIntoViewPlugin)
    expect(((app1 as any)._context.directives)['scroll-into-view']).toBe(vScrollIntoView)
    expect(((app2 as any)._context.directives)['scroll-into-view']).toBe(vScrollIntoView)
  })

  it('always: true + rapid condition flips coalesce to single scrollTo per frame', () => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    target.scrollIntoView = vi.fn()

    mountWithValueAndContainerSetup({ condition: true, always: true }, target)
    flushRaf()
    expect(target.scrollIntoView).toHaveBeenCalledOnce()

    triggerUpdate(target, { condition: true, always: true }, { condition: true, always: true })
    triggerUpdate(target, { condition: true, always: true }, { condition: true, always: true })
    triggerUpdate(target, { condition: true, always: true }, { condition: true, always: true })
    flushRaf()
    // 3 updates with always:true → 3 doScroll() calls but each cancels the prior rAF
    // → only one rAF cb fires per flushRaf().
    expect(target.scrollIntoView).toHaveBeenCalledTimes(2)
  })

  it('composable: scroll() + cancel() + scroll() within same tick — only the final scroll fires', () => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    target.scrollIntoView = vi.fn()

    const api = useScrollIntoView({ target, options: { behavior: 'instant' } })
    api.scroll()
    api.cancel()
    expect(api.state.value).toBe('idle')
    api.scroll()
    expect(api.state.value).toBe('pending')
    flushRaf()
    expect(target.scrollIntoView).toHaveBeenCalledOnce()
    expect(target.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'instant',
      block: 'nearest',
      inline: 'nearest',
    })
  })

  it('composable: update() between scroll() and rAF flush — the in-flight rAF still uses ORIGINAL options (snapshot semantics)', () => {
    // The composable snapshots `lastOpts` at scroll() time (via resolveBinding).
    // An update() after scroll() but before flushRaf() does NOT alter the queued
    // call — it only affects the NEXT scroll(). This guarantees a single scroll()
    // call is deterministic.
    const target = document.createElement('div')
    document.body.appendChild(target)
    target.scrollIntoView = vi.fn()

    const api = useScrollIntoView({ target, options: { behavior: 'smooth' } })
    api.scroll()
    api.update({ behavior: 'instant' }) // does NOT affect in-flight rAF
    flushRaf()
    expect(target.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'nearest',
    })

    // Next scroll() picks up the merged option
    target.scrollIntoView = vi.fn()
    api.scroll()
    flushRaf()
    expect(target.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'instant',
      block: 'nearest',
      inline: 'nearest',
    })
  })
})

// ---------------------------------------------------------------------------
// SIV-1 — the three defects an independent browser audit found. jsdom has no
// layout, which is why 236 tests missed all of them; these pin the ARITHMETIC
// against mocked rects, and `playground/scripts/interactions/v-scroll-into-view.mjs`
// pins the same three behaviours in a real browser where the rects are real.
// ---------------------------------------------------------------------------

/**
 * Give the document element a box, so `hasNoBox()` can tell "this element is
 * not rendered" apart from "this environment has no layout engine".
 *
 * jsdom returns an empty `getClientRects()` for EVERY element including
 * `<html>`, so without this the guard correctly declines to guess and the
 * library behaves exactly as it did before — which is what the rest of the
 * suite asserts.
 */
function pretendLayoutEngine(): void {
  // `vi.spyOn` rather than a plain assignment: `restoreAllMocks()` puts the
  // document element back, so a faked layout engine cannot leak into the rest
  // of the file and silently switch the guard on for every later test.
  vi.spyOn(document.documentElement, 'getClientRects').mockReturnValue(boxes(1))
}

/** `count: 0` is what a `display:none` / `display:contents` / detached element returns. */
function boxes(count: number): DOMRectList {
  return Array.from({ length: count }, () => ({}) as DOMRect) as unknown as DOMRectList
}

function setBoxCount(el: Element, count: number): void {
  el.getClientRects = vi.fn(() => boxes(count)) as any
}

describe('vScrollIntoView — target with no layout box (SIV-1 B1)', () => {
  beforeEach(() => {
    rafCallbacks = []
    nextRafId = 1
    vi.stubGlobal('requestAnimationFrame', mockRaf)
    vi.stubGlobal('cancelAnimationFrame', mockCancelRaf)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('container: a display:none target is a silent no-op — it does NOT scroll the pane to the top', () => {
    // Measured in Chrome before the fix: scrollTop 300 -> 0. The zero rect a
    // boxless element reports made `relTop` a large negative, which scrollTo
    // clamps to the top of the pane.
    pretendLayoutEngine()
    const container = makeContainer({ scrollTop: 300, clientHeight: 200 })
    const target = document.createElement('div')
    container.appendChild(target)
    setBoxCount(target, 0)
    setElementRect(target, { top: 0, left: 0, width: 0, height: 0 })

    mountWithValueAndContainerSetup({ container, block: 'start' }, target)
    flushRaf()

    expect(container.scrollTo).not.toHaveBeenCalled()
  })

  it('container: the rendered control on the same pane still scrolls', () => {
    pretendLayoutEngine()
    const container = makeContainer({ scrollTop: 300, clientHeight: 200 })
    const target = document.createElement('div')
    container.appendChild(target)
    setBoxCount(target, 1)
    setElementRect(target, { top: 240, left: 0, width: 50, height: 50 })

    mountWithValueAndContainerSetup({ container, block: 'start' }, target)
    flushRaf()

    expect(container.scrollTo).toHaveBeenCalledWith({ top: 540, left: 0, behavior: 'smooth' })
  })

  it('container: a target detached from the document is a silent no-op', () => {
    pretendLayoutEngine()
    const container = makeContainer({ scrollTop: 300, clientHeight: 200 })
    const target = document.createElement('div') // never appended
    setElementRect(target, { top: 0, left: 0, width: 0, height: 0 })

    mountWithValueAndContainerSetup({ container, block: 'start' }, target)
    flushRaf()

    expect(container.scrollTo).not.toHaveBeenCalled()
  })

  it('native path: a display:none target does not reach scrollIntoView', () => {
    pretendLayoutEngine()
    const target = document.createElement('div')
    document.body.appendChild(target)
    target.scrollIntoView = vi.fn()
    setBoxCount(target, 0)

    mountWithValueAndContainerSetup({ block: 'start' }, target)
    flushRaf()

    expect(target.scrollIntoView).not.toHaveBeenCalled()
  })

  it('no layout engine at all (jsdom / SSR snapshot): the guard does not disable the scroll', () => {
    // `<html>` has no box here either, so "no rects" carries no information.
    // Declining to guess is what keeps this guard from silently switching the
    // whole library off in an environment that simply does not do layout.
    const container = makeContainer({ scrollTop: 300, clientHeight: 200 })
    const target = document.createElement('div')
    container.appendChild(target)
    setBoxCount(target, 0)
    setElementRect(target, { top: 240, left: 0, width: 50, height: 50 })

    mountWithValueAndContainerSetup({ container, block: 'start' }, target)
    flushRaf()

    expect(container.scrollTo).toHaveBeenCalledOnce()
  })
})

describe('vScrollIntoView — block: nearest, target taller than the container (SIV-1 B2)', () => {
  beforeEach(() => {
    rafCallbacks = []
    nextRafId = 1
    vi.stubGlobal('requestAnimationFrame', mockRaf)
    vi.stubGlobal('cancelAnimationFrame', mockCancelRaf)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('below the viewport: aligns the target TOP (what native does), not its bottom', () => {
    // Native `scrollIntoView({block:'nearest'})` aligns edge A when the target
    // is bigger than the scrolling box. The old code aligned edge B, landing
    // with the target's top 220px above the pane — its bottom on screen.
    const container = makeContainer({ scrollTop: 0, clientHeight: 200 })
    const target = document.createElement('div')
    container.appendChild(target)
    setElementRect(target, { top: 300, left: 0, width: 50, height: 400 })

    mountWithValueAndContainerSetup({ container, block: 'nearest' }, target)
    flushRaf()

    expect(container.scrollTo).toHaveBeenCalledWith({ top: 300, left: 0, behavior: 'smooth' })
  })

  it('above the viewport: aligns the target BOTTOM, because that is the nearer edge (SIV-4 S2)', () => {
    // The mirror of the case above, and the one SIV-1 got backwards. CSSOM-View
    // does not say "an oversized target always shows its top"; it says an
    // oversized target whose START edge is outside aligns the END edges — which
    // is the same minimum-distance rule, seen from the other side. Measured in
    // Chrome on playground card 12 (`from = below`): native scrollTop 430, the
    // directive's 229, a full pane apart.
    const container = makeContainer({ scrollTop: 600, clientHeight: 200 })
    const target = document.createElement('div')
    container.appendChild(target)
    setElementRect(target, { top: -400, left: 0, width: 50, height: 400 })

    mountWithValueAndContainerSetup({ container, block: 'nearest' }, target)
    flushRaf()

    // Target occupies content [200, 600]; the scrollport is [600, 800]. Moving
    // to 400 brings its bottom edge to the pane's bottom — 200px of travel,
    // against the 400px that aligning its top would have cost.
    expect(container.scrollTo).toHaveBeenCalledWith({ top: 400, left: 0, behavior: 'smooth' })
  })

  it('target already covering the whole container: no scroll at all', () => {
    // Both edges are outside the box, so every possible scroll hides content
    // that is currently visible. Native does nothing; so do we.
    const container = makeContainer({ scrollTop: 300, clientHeight: 200 })
    const target = document.createElement('div')
    container.appendChild(target)
    setElementRect(target, { top: -200, left: 0, width: 50, height: 500 })

    mountWithValueAndContainerSetup({ container, block: 'nearest' }, target)
    flushRaf()

    expect(container.scrollTo).not.toHaveBeenCalled()
  })

  it('inline: nearest, target wider than the container: aligns the target LEFT', () => {
    const container = makeContainer({ scrollLeft: 0, clientWidth: 200 })
    const target = document.createElement('div')
    container.appendChild(target)
    setElementRect(target, { top: 0, left: 300, width: 400, height: 50 })

    mountWithValueAndContainerSetup({ container, inline: 'nearest' }, target)
    flushRaf()

    expect(container.scrollTo).toHaveBeenCalledWith({ top: 0, left: 300, behavior: 'smooth' })
  })
})

describe('vScrollIntoView — nearest + an offset that cannot fit (SIV-1 B3)', () => {
  beforeEach(() => {
    rafCallbacks = []
    nextRafId = 1
    vi.stubGlobal('requestAnimationFrame', mockRaf)
    vi.stubGlobal('cancelAnimationFrame', mockCancelRaf)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('target exactly as tall as the container: drops the gap rather than clipping 40px off the target', () => {
    // Old: scrollTop 260 -> target top 40, bottom 240, 40px cut off, when top 0
    // was available. The gap is a nicety; showing the whole target is not.
    const container = makeContainer({ scrollTop: 0, clientHeight: 200 })
    const target = document.createElement('div')
    container.appendChild(target)
    setElementRect(target, { top: 300, left: 0, width: 50, height: 200 })

    mountWithValueAndContainerSetup({ container, block: 'nearest', offset: { top: 40 } }, target)
    flushRaf()

    expect(container.scrollTo).toHaveBeenCalledWith({ top: 300, left: 0, behavior: 'smooth' })
  })

  it('a target that still fits under the sticky region keeps the gap (150px control, unchanged)', () => {
    const container = makeContainer({ scrollTop: 0, clientHeight: 200 })
    const target = document.createElement('div')
    container.appendChild(target)
    setElementRect(target, { top: 300, left: 0, width: 50, height: 150 })

    mountWithValueAndContainerSetup({ container, block: 'nearest', offset: { top: 40 } }, target)
    flushRaf()

    expect(container.scrollTo).toHaveBeenCalledWith({ top: 250, left: 0, behavior: 'smooth' })
  })

  it('inline axis: a target as wide as the container drops the left gap too', () => {
    const container = makeContainer({ scrollLeft: 0, clientWidth: 200, clientHeight: 200 })
    const target = document.createElement('div')
    container.appendChild(target)
    setElementRect(target, { top: 0, left: 300, width: 200, height: 50 })

    mountWithValueAndContainerSetup({ container, inline: 'nearest', offset: { left: 40 } }, target)
    flushRaf()

    expect(container.scrollTo).toHaveBeenCalledWith({ top: 0, left: 300, behavior: 'smooth' })
  })

  it('a target taller than the whole container ignores the gap and aligns its top', () => {
    const container = makeContainer({ scrollTop: 0, clientHeight: 200 })
    const target = document.createElement('div')
    container.appendChild(target)
    setElementRect(target, { top: 300, left: 0, width: 50, height: 400 })

    mountWithValueAndContainerSetup({ container, block: 'nearest', offset: { top: 40 } }, target)
    flushRaf()

    expect(container.scrollTo).toHaveBeenCalledWith({ top: 300, left: 0, behavior: 'smooth' })
  })
})

describe('vScrollIntoView — prefers-reduced-motion (SIV-1 B6)', () => {
  beforeEach(() => {
    rafCallbacks = []
    nextRafId = 1
    vi.stubGlobal('requestAnimationFrame', mockRaf)
    vi.stubGlobal('cancelAnimationFrame', mockCancelRaf)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  /** jsdom ships no `matchMedia` at all, so the query has to be stubbed in. */
  function stubReducedMotion(reduce: boolean): void {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: reduce && query.includes('reduce'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      })),
    )
  }

  it('the DEFAULT behavior degrades to instant when the user asks for reduced motion', () => {
    stubReducedMotion(true)
    const target = document.createElement('div')
    document.body.appendChild(target)
    target.scrollIntoView = vi.fn()

    mountWithValueAndContainerSetup(true, target)
    flushRaf()

    expect(target.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'instant',
      block: 'nearest',
      inline: 'nearest',
    })
  })

  it('the default stays smooth when the user has NOT asked for reduced motion', () => {
    stubReducedMotion(false)
    const target = document.createElement('div')
    document.body.appendChild(target)
    target.scrollIntoView = vi.fn()

    mountWithValueAndContainerSetup(true, target)
    flushRaf()

    expect(target.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'nearest',
    })
  })

  it('an EXPLICIT behavior is the consumer opting in — reduced motion does not override it', () => {
    stubReducedMotion(true)
    const target = document.createElement('div')
    document.body.appendChild(target)
    target.scrollIntoView = vi.fn()

    mountWithValueAndContainerSetup({ behavior: 'smooth' }, target)
    flushRaf()

    expect(target.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'nearest',
    })
  })

  it('container path: the default degrades too', () => {
    stubReducedMotion(true)
    const container = makeContainer({ scrollTop: 0, clientHeight: 200 })
    const target = document.createElement('div')
    container.appendChild(target)
    setElementRect(target, { top: 300, left: 0, width: 50, height: 50 })

    mountWithValueAndContainerSetup({ container, block: 'start' }, target)
    flushRaf()

    expect(container.scrollTo).toHaveBeenCalledWith({ top: 300, left: 0, behavior: 'instant' })
  })

  it('composable: the default degrades too', () => {
    stubReducedMotion(true)
    const target = document.createElement('div')
    document.body.appendChild(target)
    target.scrollIntoView = vi.fn()

    const api = useScrollIntoView({ target })
    api.scroll()
    flushRaf()

    expect(target.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'instant',
      block: 'nearest',
      inline: 'nearest',
    })
  })
})

// ---------------------------------------------------------------------------
// SIV-4 — the three ways the container path diverged from native, plus the
// modules 1.3.0 split out to fix them.
//
// These are the unit-level regressions. They are NOT the proof: jsdom has no
// layout, so every number below is one the fixture was told, and a fixture can
// be told a lie (that is exactly how S1 survived 236 tests). The proof is
// `playground/scripts/interactions/v-scroll-into-view.mjs`, which measures the
// same three cases against the browser's own `scrollIntoView` in a second pane.
// What these buy is a fast red light if someone edits the arithmetic.
// ---------------------------------------------------------------------------
describe('vScrollIntoView — container geometry (SIV-4 S1: the border)', () => {
  beforeEach(() => {
    rafCallbacks = []
    nextRafId = 1
    vi.stubGlobal('requestAnimationFrame', mockRaf)
    vi.stubGlobal('cancelAnimationFrame', mockCancelRaf)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  /** Target `n` px below the container's PADDING edge, i.e. content offset `n`. */
  function targetIn(container: HTMLElement, contentTop: number, height = 50): HTMLElement {
    const target = document.createElement('div')
    container.appendChild(target)
    const rect = container.getBoundingClientRect()
    setElementRect(target, {
      top: rect.top + container.clientTop + contentTop - container.scrollTop,
      left: rect.left + container.clientLeft,
      width: 50,
      height,
    })
    return target
  }

  it('block: start lands on the content offset, border or no border', () => {
    // `getBoundingClientRect()` reports the BORDER box; `scrollTop` and
    // `clientHeight` are measured from the PADDING box. Until 1.3.0 the origin
    // came from one and the sizes from the other, so every container scroll was
    // off by exactly the border width — 1px in every playground pane, which is
    // why card 12 read `lib = nat + 1` on every row and called it parity.
    for (const border of [0, 1, 10]) {
      const container = makeContainer({ scrollTop: 0, clientHeight: 200, border })
      const target = targetIn(container, 200)

      mountWithValueAndContainerSetup({ container, block: 'start' }, target)
      flushRaf()

      expect(container.scrollTo, `border=${border}`).toHaveBeenCalledWith({
        top: 200,
        left: 0,
        behavior: 'smooth',
      })
      triggerUnmount(target)
      container.remove()
    }
  })

  it('every alignment is border-independent, not just start', () => {
    // Aligned to the content offset the alignment asks for: start 200,
    // end 200 + 50 - 200 = 50, center 200 + 25 - 100 = 125.
    const expected = { start: 200, end: 50, center: 125 } as const
    for (const block of ['start', 'end', 'center'] as const) {
      const plain = makeContainer({ scrollTop: 0, clientHeight: 200, border: 0 })
      const bordered = makeContainer({ scrollTop: 0, clientHeight: 200, border: 10 })
      const a = targetIn(plain, 200)
      const b = targetIn(bordered, 200)

      mountWithValueAndContainerSetup({ container: plain, block }, a)
      mountWithValueAndContainerSetup({ container: bordered, block }, b)
      flushRaf()

      expect(plain.scrollTo, block).toHaveBeenCalledWith({ top: expected[block], left: 0, behavior: 'smooth' })
      expect(bordered.scrollTo, block).toHaveBeenCalledWith({ top: expected[block], left: 0, behavior: 'smooth' })
      triggerUnmount(a)
      triggerUnmount(b)
      plain.remove()
      bordered.remove()
    }
  })

  it('the inline axis subtracts clientLeft, which is where an RTL scrollbar lives', () => {
    // In RTL Chrome puts the vertical scrollbar on the LEFT, and its width is
    // part of `clientLeft` along with the border. Reading the origin from the
    // border box put the horizontal alignment ~15px out on every RTL list.
    const container = makeContainer({ scrollLeft: 0, clientWidth: 200, border: 17 })
    const target = targetIn(container, 0)
    setElementRect(target, { top: 17, left: 17 + 300, width: 50, height: 50 })

    mountWithValueAndContainerSetup({ container, inline: 'start' }, target)
    flushRaf()

    expect(container.scrollTo).toHaveBeenCalledWith({ top: 0, left: 300, behavior: 'smooth' })
  })

  it('a scale() between rect space and layout space is divided out', () => {
    // Rect deltas are viewport pixels; `scrollTop` and `clientHeight` are layout
    // pixels. Inside a `transform: scale(0.5)` modal the two are different
    // units, and adding one to the other put a 600px jump 300px wrong.
    const container = makeContainer({ scrollTop: 0, clientHeight: 200 })
    Object.defineProperty(container, 'offsetHeight', { value: 200, configurable: true })
    Object.defineProperty(container, 'offsetWidth', { value: 200, configurable: true })
    // Half-scale: the same 200px border box measures 100 viewport px.
    container.getBoundingClientRect = vi.fn(() => ({
      top: 0, left: 0, right: 100, bottom: 100, width: 100, height: 100, x: 0, y: 0, toJSON: () => ({}),
    })) as any
    const target = document.createElement('div')
    container.appendChild(target)
    // 600 layout px down, seen at 300 viewport px.
    setElementRect(target, { top: 300, left: 0, width: 25, height: 25 })

    mountWithValueAndContainerSetup({ container, block: 'start' }, target)
    flushRaf()

    expect(container.scrollTo).toHaveBeenCalledWith({ top: 600, left: 0, behavior: 'smooth' })
  })
})

describe('vScrollIntoView — CSS the container path now reads (SIV-2)', () => {
  beforeEach(() => {
    rafCallbacks = []
    nextRafId = 1
    vi.stubGlobal('requestAnimationFrame', mockRaf)
    vi.stubGlobal('cancelAnimationFrame', mockCancelRaf)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  function makeTarget(container: HTMLElement, top: number, height = 50): HTMLElement {
    const target = document.createElement('div')
    container.appendChild(target)
    setElementRect(target, { top, left: 0, width: 50, height })
    return target
  }

  it("scroll-margin-top on the target opens the same gap the browser would", () => {
    const container = makeContainer({ scrollTop: 0, clientHeight: 200 })
    const target = makeTarget(container, 300)
    target.style.scrollMarginTop = '40px'

    mountWithValueAndContainerSetup({ container, block: 'start' }, target)
    flushRaf()

    expect(container.scrollTo).toHaveBeenCalledWith({ top: 260, left: 0, behavior: 'smooth' })
  })

  it('scroll-margin-bottom is what block: end reads — the trailing side, as CSS defines it', () => {
    const container = makeContainer({ scrollTop: 0, clientHeight: 200 })
    const target = makeTarget(container, 300)
    target.style.scrollMarginBottom = '40px'

    mountWithValueAndContainerSetup({ container, block: 'end' }, target)
    flushRaf()

    // Scroll box ends at 300 + 50 + 40 = 390; minus the 200 scrollport.
    expect(container.scrollTo).toHaveBeenCalledWith({ top: 190, left: 0, behavior: 'smooth' })
  })

  it('offset.top OVERRIDES scroll-margin-top rather than stacking with it', () => {
    const container = makeContainer({ scrollTop: 0, clientHeight: 200 })
    const target = makeTarget(container, 300)
    target.style.scrollMarginTop = '40px'

    mountWithValueAndContainerSetup({ container, block: 'start', offset: { top: 10 } }, target)
    flushRaf()

    expect(container.scrollTo).toHaveBeenCalledWith({ top: 290, left: 0, behavior: 'smooth' })
  })

  it('offset { top: 0 } removes a stylesheet gap on the container path, as it does natively', () => {
    const container = makeContainer({ scrollTop: 0, clientHeight: 200 })
    const target = makeTarget(container, 300)
    target.style.scrollMarginTop = '40px'

    mountWithValueAndContainerSetup({ container, block: 'start', offset: { top: 0 } }, target)
    flushRaf()

    expect(container.scrollTo).toHaveBeenCalledWith({ top: 300, left: 0, behavior: 'smooth' })
  })

  it('scroll-padding-top on the container insets the optimal viewing region', () => {
    const container = makeContainer({ scrollTop: 0, clientHeight: 200 })
    container.style.scrollPaddingTop = '30px'
    const target = makeTarget(container, 300)

    mountWithValueAndContainerSetup({ container, block: 'start' }, target)
    flushRaf()

    expect(container.scrollTo).toHaveBeenCalledWith({ top: 270, left: 0, behavior: 'smooth' })
  })

  it('scroll-padding as a percentage resolves against the scrollport, not the content', () => {
    const container = makeContainer({ scrollTop: 0, clientHeight: 200 })
    container.style.scrollPaddingTop = '10%'
    const target = makeTarget(container, 300)

    mountWithValueAndContainerSetup({ container, block: 'start' }, target)
    flushRaf()

    expect(container.scrollTo).toHaveBeenCalledWith({ top: 280, left: 0, behavior: 'smooth' })
  })
})

describe('vScrollIntoView — RTL and vertical writing modes', () => {
  beforeEach(() => {
    rafCallbacks = []
    nextRafId = 1
    vi.stubGlobal('requestAnimationFrame', mockRaf)
    vi.stubGlobal('cancelAnimationFrame', mockCancelRaf)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
    resetWarnings()
  })

  it("inline: 'start' means the RIGHT edge when the target's direction is rtl", () => {
    // `start` and `end` are LOGICAL. The test suite advertised an "RTL probe"
    // in a describe banner for three versions and never had one; the container
    // path meanwhile hard-coded LTR, so `inline: 'start'` scrolled to the wrong
    // edge entirely while the container-less path (the browser) got it right.
    const container = makeContainer({ scrollLeft: -400, clientWidth: 200, scrollWidth: 1000 })
    const target = document.createElement('div')
    container.appendChild(target)
    target.style.direction = 'rtl'
    // RTL scrollLeft runs 0..-max, so content x = rect delta + scrollLeft.
    setElementRect(target, { top: 0, left: 100, width: 50, height: 50 })

    mountWithValueAndContainerSetup({ container, inline: 'start' }, target)
    flushRaf()

    // Content box [-300, -250]; `start` is its right edge against the
    // scrollport's right edge: -250 - 200 = -450.
    expect(container.scrollTo).toHaveBeenCalledWith({ top: 0, left: -450, behavior: 'smooth' })
  })

  it('a vertical writing mode warns once instead of silently scrolling the wrong axis', () => {
    const container = makeContainer({ scrollTop: 0, clientHeight: 200 })
    const target = document.createElement('div')
    container.appendChild(target)
    target.style.writingMode = 'vertical-rl'
    setElementRect(target, { top: 300, left: 0, width: 50, height: 50 })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    mountWithValueAndContainerSetup({ container, block: 'start' }, target)
    flushRaf()

    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0][0]).toContain('vertical writing mode')
  })
})

describe('vScrollIntoView — the scrollers between target and container (SIV-4 / finding 7)', () => {
  beforeEach(() => {
    rafCallbacks = []
    nextRafId = 1
    vi.stubGlobal('requestAnimationFrame', mockRaf)
    vi.stubGlobal('cancelAnimationFrame', mockCancelRaf)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
    resetWarnings()
  })

  it('an inner scroller between the target and the pinned container is scrolled too', () => {
    // Pinning a container says "stop at this one", not "ignore the ones inside
    // it". Before 1.3.0 only the named container moved, so an inner pane
    // scrolled away kept the target invisible while the outer pane reported
    // success — "it scrolls to the row most of the time".
    const outer = makeContainer({ scrollTop: 0, clientHeight: 400 })
    const inner = makeContainer({ scrollTop: 0, clientHeight: 200 })
    outer.appendChild(inner)
    // The inner pane sits at content offset 0 of the outer one.
    inner.getBoundingClientRect = vi.fn(() => ({
      top: 0, left: 0, right: 200, bottom: 200, width: 200, height: 200, x: 0, y: 0, toJSON: () => ({}),
    })) as any
    const target = document.createElement('div')
    inner.appendChild(target)
    setElementRect(target, { top: 300, left: 0, width: 50, height: 50 })

    mountWithValueAndContainerSetup({ container: outer, block: 'start' }, target)
    flushRaf()

    // Innermost first: the inner pane brings the target to its own top…
    expect(inner.scrollTo).toHaveBeenCalledWith({ top: 300, left: 0, behavior: 'smooth' })
    // …and the outer one accounts for the 300px the target just travelled, so
    // it does not scroll to a stale position. The target is already at the
    // outer pane's top, so there is nothing left to do.
    expect(outer.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'smooth' })
  })

  it('a non-scrolling element between the two is skipped', () => {
    const outer = makeContainer({ scrollTop: 0, clientHeight: 400 })
    const plain = document.createElement('div')
    outer.appendChild(plain)
    const target = document.createElement('div')
    plain.appendChild(target)
    setElementRect(target, { top: 300, left: 0, width: 50, height: 50 })

    mountWithValueAndContainerSetup({ container: outer, block: 'start' }, target)
    flushRaf()

    expect(outer.scrollTo).toHaveBeenCalledOnce()
    expect(outer.scrollTo).toHaveBeenCalledWith({ top: 300, left: 0, behavior: 'smooth' })
  })
})

describe('vScrollIntoView — a refused scroll re-arms the edge (finding 5)', () => {
  beforeEach(() => {
    rafCallbacks = []
    nextRafId = 1
    vi.stubGlobal('requestAnimationFrame', mockRaf)
    vi.stubGlobal('cancelAnimationFrame', mockCancelRaf)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
    resetWarnings()
  })

  it('a container that has not rendered yet does not spend the false→true edge', () => {
    // Playground card 11 used to instruct the reader to press the button a
    // second time. This is why: the first press spent the edge on a scroll that
    // could not happen, and while the condition stayed true no later update was
    // ever a transition again.
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const target = document.createElement('div')
    document.body.appendChild(target)
    setElementRect(target, { top: 300, left: 0, width: 50, height: 50 })

    mountWithValueAndContainerSetup({ container: '#late-pane', block: 'start' }, target)
    flushRaf()

    // The pane arrives a tick later, and the condition has not changed.
    const container = makeContainer({ scrollTop: 0, clientHeight: 200 })
    container.id = 'late-pane'
    container.appendChild(target)

    triggerUpdate(target, { container: '#late-pane', block: 'start' }, { container: '#late-pane', block: 'start' })
    flushRaf()

    expect(container.scrollTo).toHaveBeenCalledWith({ top: 300, left: 0, behavior: 'smooth' })
  })

  it('deciding a nearest target is already visible DOES spend the edge', () => {
    // Not a refusal — the correct answer. Re-arming here would turn every
    // in-view render into a retry.
    const container = makeContainer({ scrollTop: 0, clientHeight: 200 })
    const target = document.createElement('div')
    container.appendChild(target)
    setElementRect(target, { top: 20, left: 0, width: 50, height: 50 })

    mountWithValueAndContainerSetup({ container, block: 'nearest' }, target)
    flushRaf()
    expect(container.scrollTo).not.toHaveBeenCalled()

    // Now move it out of view without changing the condition. No edge left.
    setElementRect(target, { top: 900, left: 0, width: 50, height: 50 })
    triggerUpdate(target, { container, block: 'nearest' }, { container, block: 'nearest' })
    flushRaf()
    expect(container.scrollTo).not.toHaveBeenCalled()
  })
})

describe('vScrollIntoView — a misconfigured container says so (finding 6)', () => {
  beforeEach(() => {
    rafCallbacks = []
    nextRafId = 1
    vi.stubGlobal('requestAnimationFrame', mockRaf)
    vi.stubGlobal('cancelAnimationFrame', mockCancelRaf)
    resetWarnings()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
    resetWarnings()
  })

  it('a container that is not an ancestor scrolls nothing and warns', () => {
    // `document.querySelector('.pane')` returns the FIRST `.pane` in the
    // document, so in a `v-for` of panes every row resolved to pane #1 and the
    // arithmetic ran against an element the target does not live in — yanking
    // the wrong pane to a nonsense offset, silently.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const paneA = makeContainer({ scrollTop: 0, clientHeight: 200 })
    paneA.className = 'pane'
    const paneB = makeContainer({ scrollTop: 0, clientHeight: 200 })
    paneB.className = 'pane'
    const target = document.createElement('div')
    paneB.appendChild(target)
    setElementRect(target, { top: 300, left: 0, width: 50, height: 50 })

    mountWithValueAndContainerSetup({ container: '.pane', block: 'start' }, target)
    flushRaf()

    expect(paneA.scrollTo).not.toHaveBeenCalled()
    expect(paneB.scrollTo).not.toHaveBeenCalled()
    expect(warn.mock.calls[0][0]).toContain(':scope')
  })

  it(':scope walks up from the element, so each row finds its own pane', () => {
    const paneA = makeContainer({ scrollTop: 0, clientHeight: 200 })
    paneA.className = 'pane'
    const paneB = makeContainer({ scrollTop: 0, clientHeight: 200 })
    paneB.className = 'pane'
    const target = document.createElement('div')
    paneB.appendChild(target)
    setElementRect(target, { top: 300, left: 0, width: 50, height: 50 })

    mountWithValueAndContainerSetup({ container: ':scope .pane', block: 'start' }, target)
    flushRaf()

    expect(paneA.scrollTo).not.toHaveBeenCalled()
    expect(paneB.scrollTo).toHaveBeenCalledWith({ top: 300, left: 0, behavior: 'smooth' })
  })

  it('a container with nothing to scroll warns, once, rather than doing nothing quietly', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const container = makeContainer({ scrollTop: 0, clientHeight: 200, scrollHeight: 200, scrollWidth: 200 })
    const target = document.createElement('div')
    container.appendChild(target)
    setElementRect(target, { top: 300, left: 0, width: 50, height: 50 })

    mountWithValueAndContainerSetup({ container, block: 'start' }, target)
    flushRaf()

    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0][0]).toContain('no scrollable overflow')

    // A second element with the same misconfiguration does not warn again.
    const other = document.createElement('div')
    container.appendChild(other)
    setElementRect(other, { top: 300, left: 0, width: 50, height: 50 })
    mountWithValueAndContainerSetup({ container, block: 'start' }, other)
    flushRaf()
    expect(warn).toHaveBeenCalledOnce()
  })
})

describe('vScrollIntoView — nearest decides against where a smooth scroll is going (finding 10)', () => {
  beforeEach(() => {
    rafCallbacks = []
    nextRafId = 1
    vi.stubGlobal('requestAnimationFrame', mockRaf)
    vi.stubGlobal('cancelAnimationFrame', mockCancelRaf)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('a target visible only at the CURRENT position still scrolls, because the pane is leaving', () => {
    // Hold the arrow key: a smooth scroll is mid-flight, so `scrollTop` is a
    // coordinate that has not arrived. Judged against it the next row often
    // reads as visible, the request is answered with "nothing to do", and the
    // OLD animation carries on to a destination computed for a different row.
    const container = makeContainer({ scrollTop: 0, clientHeight: 200 })
    resetDestinations(container)
    const first = document.createElement('div')
    container.appendChild(first)
    setElementRect(first, { top: 800, left: 0, width: 50, height: 50 })

    // Request one: travel to content 800.
    mountWithValueAndContainerSetup({ container, block: 'start' }, first)
    flushRaf()
    expect(container.scrollTo).toHaveBeenCalledWith({ top: 800, left: 0, behavior: 'smooth' })

    // Request two, while that scroll is still at scrollTop 0: a row at content
    // 100 is visible NOW and will be 700px above the fold when the pane lands.
    const second = document.createElement('div')
    container.appendChild(second)
    setElementRect(second, { top: 100, left: 0, width: 50, height: 50 })
    mountWithValueAndContainerSetup({ container, block: 'nearest' }, second)
    flushRaf()

    expect(container.scrollTo).toHaveBeenLastCalledWith({ top: 100, left: 0, behavior: 'smooth' })
  })

  it('once the pane has arrived, the live position is used again', () => {
    const container = makeContainer({ scrollTop: 0, clientHeight: 200 })
    resetDestinations(container)
    const first = document.createElement('div')
    container.appendChild(first)
    setElementRect(first, { top: 800, left: 0, width: 50, height: 50 })

    mountWithValueAndContainerSetup({ container, block: 'start' }, first)
    flushRaf()

    // The scroll finishes.
    ;(container as any).scrollTop = 800
    container.dispatchEvent(new Event('scrollend'))

    const second = document.createElement('div')
    container.appendChild(second)
    setElementRect(second, { top: -700, left: 0, width: 50, height: 50 })
    mountWithValueAndContainerSetup({ container, block: 'nearest' }, second)
    flushRaf()

    // Content 100, scrollport [800, 1000]: out of view above, so it scrolls.
    expect(container.scrollTo).toHaveBeenLastCalledWith({ top: 100, left: 0, behavior: 'smooth' })
  })
})

describe("vScrollIntoView — the README's own trigger recipe (finding 9)", () => {
  beforeEach(() => {
    rafCallbacks = []
    nextRafId = 1
    vi.stubGlobal('requestAnimationFrame', mockRaf)
    vi.stubGlobal('cancelAnimationFrame', mockCancelRaf)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('a condition that goes true and back to false inside one frame still scrolls', () => {
    // README's anchor-navigation recipe is `activeId = id` followed by
    // `requestAnimationFrame(() => activeId = null)`, and five playground demos
    // copy the same ritual. It works because `updated()` returns on a false
    // condition WITHOUT touching the queued frame — an omission, not a
    // decision, until this test made it one. The obvious-looking hardening
    // ("cancel the pending scroll when the condition goes false") breaks every
    // documented trigger pattern in the package, silently, with green tests.
    const { el } = mountWithValue(false)
    triggerUpdate(el, true, false)
    triggerUpdate(el, false, true)
    flushRaf()

    expect(el.scrollIntoView).toHaveBeenCalledOnce()
  })

  it('and the falling edge re-arms, so the next click on the same link scrolls again', () => {
    const { el } = mountWithValue(false)
    triggerUpdate(el, true, false)
    triggerUpdate(el, false, true)
    flushRaf()
    triggerUpdate(el, true, false)
    flushRaf()

    expect(el.scrollIntoView).toHaveBeenCalledTimes(2)
  })
})
