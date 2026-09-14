/**
 * One-shot console warnings — each distinct message fires once per session.
 *
 * The container path deliberately refuses to fall back to native
 * `scrollIntoView`, so a misconfigured `container` produces silence. Silence is
 * the hardest bug to search for: these are the sentences a developer can paste
 * into a search box.
 */
const warned = new Set<string>()

export function warnOnce(message: string): void {
  if (warned.has(message)) return
  warned.add(message)
  if (typeof console !== 'undefined') console.warn(`[v-scroll-into-view] ${message}`)
}

/**
 * Internal (not part of the public surface): drops the latch so a test can
 * prove a warning fires, rather than proving that no earlier test spent it.
 */
export function resetWarnings(): void {
  warned.clear()
}
