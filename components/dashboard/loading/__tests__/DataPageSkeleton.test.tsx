import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import React from "react";
import {
  DataPageSkeleton,
  type DataPageSkeletonVariant,
} from "../DataPageSkeleton";

const VARIANTS: DataPageSkeletonVariant[] = [
  "analytics",
  "orders",
  "catalog",
  "table",
  "detail",
  "payments",
  "financials",
  "thread",
  "profile",
  "stations",
  "pos-settings",
  "media-gallery",
];

describe("DataPageSkeleton — accessibility contract", () => {
  it.each(VARIANTS)(
    "%s exposes a polite, busy status region to assistive tech",
    (variant) => {
      const html = renderToString(
        <DataPageSkeleton variant={variant} label="Loading the thing" />,
      );

      expect(html).toContain('role="status"');
      expect(html).toContain('aria-live="polite"');
      expect(html).toContain('aria-busy="true"');
    },
  );

  it.each(VARIANTS)("%s announces its own meaningful label", (variant) => {
    const html = renderToString(
      <DataPageSkeleton variant={variant} label="Loading merchant details" />,
    );

    // The label must reach screen readers, not just sit in a title attribute.
    expect(html).toContain("Loading merchant details");
    expect(html).toContain("sr-only");
  });

  it("does not reuse one generic label across variants", () => {
    const analytics = renderToString(
      <DataPageSkeleton variant="analytics" label="Loading orders" />,
    );
    const table = renderToString(
      <DataPageSkeleton variant="table" label="Loading the user directory" />,
    );

    expect(analytics).toContain("Loading orders");
    expect(table).toContain("Loading the user directory");
    expect(analytics).not.toContain("Loading the user directory");
  });
});

describe("DataPageSkeleton — reduced motion", () => {
  it.each(VARIANTS)("%s stops pulsing under reduced motion", (variant) => {
    const html = renderToString(
      <DataPageSkeleton variant={variant} label="Loading" />,
    );

    // Every animated block opts out of its own animation, so a
    // reduced-motion user still gets the layout without the pulse.
    const animated = html.match(/animate-pulse/g)?.length ?? 0;
    const optedOut = html.match(/motion-reduce:animate-none/g)?.length ?? 0;

    expect(animated).toBeGreaterThan(0);
    expect(optedOut).toBeGreaterThanOrEqual(animated);
  });
});

describe("DataPageSkeleton — variant geometry", () => {
  it("tags the rendered markup with the variant it drew", () => {
    for (const variant of VARIANTS) {
      const html = renderToString(
        <DataPageSkeleton variant={variant} label="Loading" />,
      );
      expect(html).toContain(`data-page-loader="${variant}"`);
    }
  });

  it("draws a different shape per variant", () => {
    const rendered = VARIANTS.map((variant) =>
      renderToString(<DataPageSkeleton variant={variant} label="Loading" />),
    );

    // A variant that collapsed into another would defeat the whole point of
    // a page-shaped skeleton.
    expect(new Set(rendered).size).toBe(VARIANTS.length);
  });

  it("report draws the stat count each route declares, not a default", () => {
    // Report pages differ: some open with four KPI tiles, online-ordering
    // has six, and comparison has none because its controls come first.
    // A shared default would promise tiles a page never renders.
    const four = renderToString(
      <DataPageSkeleton variant="report" label="Loading" report={{ stats: 4 }} />,
    );
    const six = renderToString(
      <DataPageSkeleton variant="report" label="Loading" report={{ stats: 6 }} />,
    );
    const none = renderToString(
      <DataPageSkeleton variant="report" label="Loading" report={{ stats: 0 }} />,
    );

    const tiles = (html: string) =>
      (html.match(/h-3 w-20 rounded-full/g) ?? []).length;

    expect(tiles(four)).toBe(4);
    expect(tiles(six)).toBe(6);
    expect(tiles(none)).toBe(0);
  });

  it("report draws only the body its route declares", () => {
    const table = renderToString(
      <DataPageSkeleton
        variant="report"
        label="Loading"
        report={{ body: "table" }}
      />,
    );
    const panels = renderToString(
      <DataPageSkeleton
        variant="report"
        label="Loading"
        report={{ body: "panels", panels: 2 }}
      />,
    );

    // A table body must not emit the two-column summary panel grid, and a
    // panels body must emit exactly the count asked for.
    expect(table).not.toContain("md:grid-cols-2");
    expect(panels).toContain("md:grid-cols-2");
    expect((panels.match(/h-5 w-36 max-w-full/g) ?? []).length).toBe(2);
  });

  it("report omits the tab strip when a route has no tabs", () => {
    const withTabs = renderToString(
      <DataPageSkeleton variant="report" label="Loading" report={{ tabs: 4 }} />,
    );
    const without = renderToString(
      <DataPageSkeleton variant="report" label="Loading" report={{ tabs: 0 }} />,
    );

    expect((withTabs.match(/h-9 w-28 shrink-0/g) ?? []).length).toBe(4);
    expect(without).not.toContain("h-9 w-28 shrink-0");
  });

  it("orders draws exactly the page's two containers", () => {
    // /dashboard/orders is an Overview panel (range pills + 5 KPI tiles with
    // sparklines) and an All Orders panel (heading, filter chips, table rows).
    // Regression guard: it was first wired to `analytics`, whose chart panel,
    // tab strip and four summary panels promised a layout that never arrived.
    const html = renderToString(
      <DataPageSkeleton variant="orders" label="Loading orders" />,
    );

    const containers = html.match(/rounded-3xl border bg-card/g)?.length ?? 0;
    expect(containers).toBe(2);

    // The analytics variant's four two-column summary panels must not appear.
    expect(html).not.toContain("md:grid-cols-2");
    // The KPI row is 5-across, not the analytics 4-across.
    expect(html).toContain("xl:grid-cols-5");
  });

  it("orders builds filter chips from literal Tailwind widths", () => {
    // Tailwind scans source text, so an interpolated `w-${n}` compiles to no
    // rule and the chip renders unstyled at zero width.
    const html = renderToString(
      <DataPageSkeleton variant="orders" label="Loading orders" />,
    );
    // Distinct literal widths, so the chip row reads as varied filter pills
    // rather than one repeated block.
    const widths = new Set(
      [...html.matchAll(/\bw-(\d+) rounded-full/g)].map((m) => m[1]),
    );
    expect(widths.size).toBeGreaterThan(2);
    expect(html).toContain("w-40");
  });

  it("detail opens with a breadcrumb instead of a duplicate page header", () => {
    // HQ detail routes render their own breadcrumb + identity header, so the
    // generic title block would be a second header stacked on the first.
    const detail = renderToString(
      <DataPageSkeleton variant="detail" label="Loading" />,
    );
    const table = renderToString(
      <DataPageSkeleton variant="table" label="Loading" />,
    );

    expect(detail).not.toContain("h-9 w-52");
    expect(table).toContain("h-9 w-52");
  });
});

describe("DataPageSkeleton — shell", () => {
  it("wraps merchant routes in the page shell's <main>", () => {
    const html = renderToString(
      <DataPageSkeleton variant="analytics" label="Loading" />,
    );
    expect(html).toContain("<main");
  });

  it("omits <main> for HQ routes that own their layout", () => {
    // /manage/* pages already sit inside a layout <main>; a second one would
    // nest landmarks and confuse assistive navigation.
    const html = renderToString(
      <DataPageSkeleton variant="table" shell="plain" label="Loading" />,
    );
    expect(html).not.toContain("<main");
    expect(html).toContain('role="status"');
  });
});
