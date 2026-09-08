// @vitest-environment happy-dom

import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { FieldControl } from "@/lib/site-builder/schema-introspect";
import { LinkControl } from "../LinkControl";

/**
 * §U2 — changing where a button goes must not throw away what was typed.
 *
 * Only `url`, `phone` and `page` carry a value and each means something
 * different, so the value genuinely cannot be *carried* across a switch. The
 * old control concluded it should be discarded, which meant glancing at
 * "Call us" and changing your mind cost you the address already typed. Each
 * kind's last value is remembered instead.
 */

const CONTROL = {
  name: "cta",
  label: "Button",
  kind: "link",
  optional: false,
} as unknown as FieldControl;

const PAGES = [
  { title: "About", path: "/about", isHome: false, isPublished: true },
  { title: "Menu", path: "/menu", isHome: false, isPublished: true },
];

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/** Stands in for the section drawer: holds the value the control edits. */
function Harness({ initial }: { initial: unknown }) {
  const [value, setValue] = useState(initial);
  return <LinkControl control={CONTROL} value={value} pages={PAGES} onChange={setValue} />;
}

function render(initial: unknown) {
  act(() => root.render(<Harness initial={initial} />));
}

function selectByLabel(label: string): HTMLSelectElement {
  const el = container.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`);
  if (!el) throw new Error(`no select labelled "${label}"`);
  return el;
}

function choose(label: string, value: string) {
  const select = selectByLabel(label);
  act(() => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function textInput(label: string): HTMLInputElement {
  const el = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (!el) throw new Error(`no input labelled "${label}"`);
  return el;
}

/**
 * React tracks the last value it wrote to an input and skips `onChange` when a
 * dispatched event carries an unchanged one. Assigning through the prototype's
 * setter is what makes the tracker notice, so this is real typing rather than
 * an event React quietly ignores.
 */
function type(label: string, text: string) {
  const input = textInput(label);
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setValue.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("changing a link's destination", () => {
  it("gives back the URL after a detour through another kind", () => {
    render({ label: "Order", target: { kind: "url", value: "https://tonys.example" } });
    expect(textInput("Link URL").value).toBe("https://tonys.example");

    choose("Button destination", "phone");
    expect(container.querySelector('input[aria-label="Link URL"]')).toBeNull();

    choose("Button destination", "url");
    expect(textInput("Link URL").value).toBe("https://tonys.example");
  });

  it("remembers each kind separately rather than sharing one value", () => {
    render({ label: "Call", target: { kind: "url", value: "https://tonys.example" } });

    choose("Button destination", "phone");
    type("Phone number", "+1 555 0100");

    choose("Button destination", "url");
    expect(textInput("Link URL").value).toBe("https://tonys.example");

    choose("Button destination", "phone");
    expect(textInput("Phone number").value).toBe("+1 555 0100");
  });

  /**
   * A kind with nothing remembered still needs somewhere sensible to land —
   * `page` seeds the first published page rather than an empty target, which
   * would be a publish blocker the merchant never asked for.
   */
  it("seeds a first-time page destination instead of leaving it unset", () => {
    render({ label: "Learn more", target: { kind: "order" } });

    choose("Button destination", "page");
    expect(selectByLabel("Page destination").value).toBe("/about");
  });

  it("keeps the button text across a destination change", () => {
    render({ label: "Order Now", target: { kind: "url", value: "https://tonys.example" } });

    choose("Button destination", "menu");
    expect(textInput("Button text").value).toBe("Order Now");
  });
});
