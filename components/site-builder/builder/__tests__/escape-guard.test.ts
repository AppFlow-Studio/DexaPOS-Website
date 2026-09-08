// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { escapeClosesDrawer } from "../escape-guard";

/**
 * One Escape, one thing closed.
 *
 * The guard that decides this used to query the DOM for an open Radix layer
 * from a `window` listener — which runs after Radix has already unmounted the
 * layer from its own `document` listener, so the query always missed and the
 * drawer closed along with the picker the merchant was actually dismissing.
 */
function escape(init: Partial<{ defaultPrevented: boolean; target: Element }> = {}) {
  const event = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
  if (init.defaultPrevented) event.preventDefault();
  if (init.target) Object.defineProperty(event, "target", { value: init.target });
  return event;
}

describe("escapeClosesDrawer", () => {
  it("closes the drawer for a plain Escape", () => {
    expect(escapeClosesDrawer(escape())).toBe(true);
  });

  it("leaves the drawer alone when something already handled the key", () => {
    // Exactly what Radix does when it closes an open popover or dialog.
    expect(escapeClosesDrawer(escape({ defaultPrevented: true }))).toBe(false);
  });

  it("ignores any other key", () => {
    const enter = new KeyboardEvent("keydown", { key: "Enter", cancelable: true });
    expect(escapeClosesDrawer(enter)).toBe(false);
  });

  it("leaves a field mid-edit to answer its own Escape", () => {
    const input = document.createElement("input");
    expect(escapeClosesDrawer(escape({ target: input }))).toBe(false);

    const div = document.createElement("div");
    div.setAttribute("contenteditable", "true");
    expect(escapeClosesDrawer(escape({ target: div }))).toBe(false);
  });
});
