"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether a full-screen overlay currently owns the screen.
 *
 * The website builder's `OverlayChrome` covers the dashboard with `fixed
 * inset-0`, but covering something is not the same as claiming it: the sidebar,
 * the header and the mobile tab bar behind it stayed focusable, kept announcing
 * themselves to screen readers, and went on answering ⌘K. A keyboard user
 * tabbed straight out of the editor into navigation they could not see.
 *
 * The overlay cannot fix that alone, because the shell it needs to switch off
 * is its own ancestor — `inert` there would take the overlay down with it. So
 * the overlay publishes the fact, and the shell reads it and switches off the
 * parts of itself that are *not* ancestors of the overlay.
 *
 * **A counter, not a boolean.** Overlays legitimately stack — the page editor
 * can open the New Page overlay over itself — and with a boolean the inner
 * one's unmount would clear the outer one's claim, quietly waking the shell up
 * underneath a still-open editor.
 *
 * Module scope rather than a React context on purpose: the publisher and the
 * reader live in different subtrees (the overlay renders inside the layout's
 * `{children}`), so a provider would have to wrap the whole dashboard for a
 * fact that is not otherwise the dashboard's business.
 */

let openCount = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Claims the screen. Call from an effect; the returned function releases the
 * claim and belongs in that effect's cleanup.
 *
 * The release is idempotent, so a double-invoked effect in development cannot
 * drive the count negative.
 */
export function claimOverlay(): () => void {
  openCount += 1;
  emit();

  let released = false;
  return () => {
    if (released) return;
    released = true;
    openCount -= 1;
    emit();
  };
}

/**
 * The current answer, read imperatively.
 *
 * For event handlers, which need the value at the moment the key was pressed
 * rather than the one captured when the listener was bound.
 */
export function isOverlayOpen() {
  return openCount > 0;
}

/** The current answer, as state. */
export function useOverlayOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => openCount > 0,
    // Nothing is open during SSR, and saying otherwise would render a shell
    // that arrives inert and hydrates its way back out of it.
    () => false,
  );
}

/** Test-only reset. The counter is module state and outlives a test's render. */
export function resetOverlayClaimsForTest() {
  openCount = 0;
  emit();
}
