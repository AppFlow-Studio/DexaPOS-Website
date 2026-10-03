/** @vitest-environment happy-dom */

import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import SectionEditor from "../SectionEditor";
import type { Section } from "@/lib/cms/cms-sections";

// React only flushes act() work when it knows it is under a test.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const COMPARE: Section = {
  id: "s1",
  type: "compare",
  heading: "How we compare",
  compare_columns: ["Capability", "DEXA", "Toast"],
  compare_rows: [["Dual pricing", "Built in", "Add-on"]],
} as Section;

let container: HTMLDivElement;
let root: Root;
let latest: Section[] = [];

/** Holds the sections the way the page editor does, so every change re-renders with fresh props. */
function Harness({ initial }: { initial: Section[] }) {
  const [sections, setSections] = useState(initial);
  return (
    <SectionEditor
      sections={sections}
      onChange={(next) => {
        latest = next;
        setSections(next);
      }}
    />
  );
}

function button(name: string) {
  const match = [...container.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === name || b.getAttribute("aria-label") === name
  );
  if (!match) throw new Error(`No button "${name}"`);
  return match;
}

function click(el: HTMLElement) {
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}


function openSection() {
  const toggle = container.querySelector<HTMLButtonElement>("button[aria-expanded]");
  click(toggle!);
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<Harness initial={[COMPARE]} />));
  openSection();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("comparison table", () => {
  it("adds a column to the column list and a cell to every row", () => {
    click(button("Add column"));
    expect(latest[0].compare_columns).toEqual(["Capability", "DEXA", "Toast", ""]);
    expect(latest[0].compare_rows).toEqual([["Dual pricing", "Built in", "Add-on", ""]]);
  });

  it("removes a column from the column list and from every row", () => {
    click(button("Remove column 3"));
    expect(latest[0].compare_columns).toEqual(["Capability", "DEXA"]);
    expect(latest[0].compare_rows).toEqual([["Dual pricing", "Built in"]]);
  });

  it("trims rows that hold more cells than there are columns", () => {
    act(() => root.unmount());
    root = createRoot(container);
    const broken = { ...COMPARE, compare_rows: [["Dual pricing", "Built in", "Add-on", "", "", ""]] } as Section;
    act(() => root.render(<Harness initial={[broken]} />));
    openSection();
    click(button("Add row"));
    expect(latest[0].compare_rows).toEqual([
      ["Dual pricing", "Built in", "Add-on"],
      ["", "", ""],
    ]);
  });
});

describe("expanded section body", () => {
  function renderOpen(section: Section) {
    act(() => root.unmount());
    root = createRoot(container);
    act(() => root.render(<Harness initial={[section]} />));
    openSection();
  }

  function groupHeadings() {
    return [...container.querySelectorAll("h4")].map((h) => h.textContent);
  }

  it("groups a hero's fields into Content, Buttons and Appearance", () => {
    renderOpen({ id: "h1", type: "hero", buttons: [] } as Section);
    // A hero also carries a card list, headed "Cards".
    expect(groupHeadings()).toEqual(["Content", "Buttons", "Appearance", "Cards", "Add a section"]);
  });

  it("titles nothing when every field is content", () => {
    renderOpen({ id: "v1", type: "video" } as Section);
    expect(groupHeadings()).toEqual(["Add a section"]);
  });

  it("has no raw JSON editor", () => {
    expect(container.textContent).not.toContain("Advanced JSON");
    expect(container.querySelector('textarea[aria-label="Section JSON"]')).toBeNull();
  });

  it("keeps move and delete as buttons on the row, not in a menu", () => {
    for (const name of ["Move section up", "Move section down", "Delete section"]) {
      expect(button(name)).toBeTruthy();
    }
  });
});
