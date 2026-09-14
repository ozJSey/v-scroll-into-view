/**
 * One-shot console warnings — once per element, per message.
 *
 * The container path deliberately refuses to fall back to native
 * `scrollIntoView`, so a misconfigured `container` produces silence. Silence is
 * the hardest bug to search for: these are the sentences a developer can paste
 * into a search box.
 *
 * **Why the latch is per element.** Until 1.3.1 it was one global `Set` of
 * message strings, so the FIRST element to reach a message spent it for the
 * whole session and every other element with the same misconfiguration was
 * silent. That made the diagnostic strictly weaker than no diagnostic, because
 * it looked like one: a single false alarm at page load — a chat pane that was
 * not full yet — disarmed `container: 'body'` and a detached container for the
 * rest of the session. Keyed by element, every misconfigured element says so
 * once and repeats stay quiet.
 *
 * A `v-for` of a thousand broken rows therefore warns a thousand times, which
 * is the honest count and is also what a console collapses: the strings are
 * identical, so Chrome and Firefox both group them behind a repeat badge.
 */
let warned = new WeakMap<object, Set<string>>()

/**
 * @param scope the element the misconfiguration belongs to — the host the
 *   directive is bound to, not the container, so two rows pointing at the same
 *   broken pane both get told.
 */
export function warnOnce(scope: object, message: string): void {
  let seen = warned.get(scope)
  if (!seen) {
    seen = new Set<string>()
    warned.set(scope, seen)
  }
  if (seen.has(message)) return
  seen.add(message)
  if (typeof console !== 'undefined') console.warn(`[v-scroll-into-view] ${message}`)
}

/**
 * Internal (not part of the public surface): drops the latch so a test can
 * prove a warning fires, rather than proving that no earlier test spent it.
 */
export function resetWarnings(): void {
  warned = new WeakMap<object, Set<string>>()
}
