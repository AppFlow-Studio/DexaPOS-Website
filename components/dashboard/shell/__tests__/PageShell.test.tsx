import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import React from "react";
import { PageShell } from "../PageShell";

describe("PageShell — element", () => {
  it("renders a <main> by default, for merchant dashboard routes", () => {
    const html = renderToString(<PageShell>content</PageShell>);

    expect(html).toContain("<main");
  });

  it("renders a <div> when asked, for HQ routes that own their layout", () => {
    // /manage/* pages already sit inside the layout's <main>
    // (app/manage/layout.tsx). A second one would nest landmarks and confuse
    // assistive navigation. This mirrors `DataPageSkeleton`'s `shell="plain"`,
    // which exists for exactly this reason.
    const html = renderToString(<PageShell as="div">content</PageShell>);

    expect(html).not.toContain("<main");
    expect(html).toContain("<div");
  });

  it("keeps the same layout classes whichever element it renders", () => {
    // The element changes; the vertical rhythm must not. If these drift, HQ
    // pages stop matching merchant spacing and the rollout's premise breaks.
    const asMain = renderToString(<PageShell>content</PageShell>);
    const asDiv = renderToString(<PageShell as="div">content</PageShell>);

    const classesOf = (html: string) =>
      html.match(/class="([^"]*)"/)?.[1] ?? "";

    expect(classesOf(asMain)).toBe(classesOf(asDiv));
    expect(classesOf(asDiv)).toContain("space-y-6");
    expect(classesOf(asDiv)).toContain("min-w-0");
  });

  it("applies the narrow width constraint to either element", () => {
    const html = renderToString(
      <PageShell as="div" width="narrow">
        content
      </PageShell>,
    );

    expect(html).toContain("max-w-5xl");
  });
});
