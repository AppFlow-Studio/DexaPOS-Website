"use client";

/**
 * Speaks an outcome to assistive technology.
 *
 * Structural edits in this builder are almost entirely visual feedback: a row
 * slides, a canvas reflows, an overlay moves. A screen-reader user pressing
 * space-arrow-space on a drag handle gets dnd-kit's generic "moved to position
 * 3" and nothing about *what* moved past *what* — so reorder, add, duplicate
 * and hide each announce themselves in the merchant's own vocabulary.
 *
 * One shared region, created on first use and reused after. Multiple live
 * regions on a page compete, and a region mounted at announce-time is often not
 * observed by the time its text arrives.
 */

const REGION_ID = "sb-live-region";

function region(): HTMLElement | null {
  if (typeof document === "undefined") return null;

  const existing = document.getElementById(REGION_ID);
  if (existing) return existing;

  const node = document.createElement("div");
  node.id = REGION_ID;
  node.setAttribute("role", "status");
  node.setAttribute("aria-live", "polite");
  node.setAttribute("aria-atomic", "true");
  // Visually hidden without `display:none`, which would stop it being announced.
  node.style.cssText =
    "position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0";
  document.body.appendChild(node);
  return node;
}

export function announce(message: string): void {
  const node = region();
  if (!node) return;

  // Clearing first guarantees the same message twice in a row is re-announced —
  // "Moved down" pressed repeatedly is otherwise silent after the first press.
  node.textContent = "";
  window.setTimeout(() => {
    node.textContent = message;
  }, 50);
}
