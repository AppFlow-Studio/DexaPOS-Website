// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { measureSectionRects, SECTION_BOUNDARY_SELECTOR } from "../canvas-dom";

describe("canvas section geometry", () => {
  it("measures section boundaries, never editable descendants with the same id", () => {
    const host = document.createElement("div");
    host.innerHTML = `
      <div data-sb-boundary data-sb-section-id="section-1" data-sb-kind="content">
        <h2 data-sb-section-id="section-1" data-sb-field="props.title">About us</h2>
        <a data-sb-section-id="section-1" data-sb-field="props.button.label">Learn more</a>
      </div>
    `;

    const boundary = host.querySelector<HTMLElement>(SECTION_BOUNDARY_SELECTOR)!;
    const field = host.querySelector<HTMLElement>("[data-sb-field='props.button.label']")!;
    host.getBoundingClientRect = () => new DOMRect(100, 50, 1120, 900);
    boundary.getBoundingClientRect = () => new DOMRect(120, 250, 1080, 320);
    // This was the rectangle that used to overwrite the real boundary.
    field.getBoundingClientRect = () => new DOMRect(350, 510, 140, 40);

    const rects = measureSectionRects(host);

    expect(Object.keys(rects)).toEqual(["section-1"]);
    expect(rects["section-1"]).toMatchObject({ x: 20, y: 200, width: 1080, height: 320 });
  });

  it("returns exactly one box for each section root", () => {
    const host = document.createElement("div");
    host.innerHTML = `
      <div data-sb-boundary data-sb-section-id="one"><span data-sb-section-id="one" /></div>
      <div data-sb-boundary data-sb-section-id="two"><span data-sb-section-id="two" /></div>
    `;
    host.getBoundingClientRect = () => new DOMRect();
    for (const [index, boundary] of [...host.querySelectorAll<HTMLElement>(SECTION_BOUNDARY_SELECTOR)].entries()) {
      boundary.getBoundingClientRect = () => new DOMRect(0, index * 100, 1120, 100);
    }

    expect(Object.keys(measureSectionRects(host))).toEqual(["one", "two"]);
  });
});
