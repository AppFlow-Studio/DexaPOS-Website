import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import React from "react";
import {
  DataPageSkeleton,
  type DataPageSkeletonVariant,
} from "../DataPageSkeleton";

const VARIANTS: DataPageSkeletonVariant[] = [
  "analytics",
  "catalog",
  "table",
  "detail",
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
