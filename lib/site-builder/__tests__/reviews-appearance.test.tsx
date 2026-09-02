import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ReviewsSection from "@/components/site-builder/sections/ReviewsSection";
import { emptyResolvedMap } from "../bindings/resolved";
import { createRenderContext } from "../render-context";
import type { ReviewLayout, ReviewsProps } from "../sections/schemas/reviews";

const ctx = createRenderContext({
  mode: "public",
  site: {
    siteId: "site_1",
    locationId: "loc_1",
    slug: "tonys",
    name: "Tony's Pizza",
    logoUrl: null,
    heroImageUrl: null,
    phone: null,
    basePath: "/sites/tonys",
    orderUrl: "/sites/tonys",
    menuUrl: "/sites/tonys",
    nav: [],
    pricingDisclosureText: null,
  },
});

function render(layout: ReviewLayout, background: "default" | "muted" | "brand" | "dark") {
  const props: ReviewsProps = {
    title: "What our guests are saying",
    layout,
    items: [
      { quote: "The food was excellent.", author: "Sam R.", rating: 4 },
      { quote: "We will be back.", author: "Alex P.", rating: 5 },
    ],
  };
  const section = {
    id: "sec_reviews",
    kind: "reviews" as const,
    props,
    style: { background },
  };

  return renderToStaticMarkup(
    <ReviewsSection section={section} resolved={emptyResolvedMap()} ctx={ctx} />,
  );
}

describe("reviews appearance", () => {
  it("applies the selected section background token", () => {
    expect(render("grid", "muted")).toContain(
      "background:var(--site-surface-muted);color:var(--site-text)",
    );
    expect(render("grid", "dark")).toContain(
      "background:var(--site-surface-dark);color:var(--site-text-on-dark)",
    );
  });

  it.each([
    ["grid", "grid gap-5 sm:grid-cols-2 lg:grid-cols-3"],
    ["list", "grid max-w-3xl gap-5"],
    [
      "carousel",
      "grid snap-x snap-mandatory grid-flow-col auto-cols-[minmax(280px,85%)]",
    ],
  ] as const)("renders the %s card layout", (layout, className) => {
    expect(render(layout, "default")).toContain(className);
  });

  it("uses the shared two-tone stars and the intentional review type scale", () => {
    const html = render("grid", "default");
    expect(html.match(/data-review-star=/g)).toHaveLength(10);
    expect(html).toContain('data-review-star="active"');
    expect(html).toContain('data-review-star="inactive"');
    expect(html).toContain('fill="#E7B641"');
    expect(html).toContain('stroke="#C68B18"');
    expect(html).toContain('fill="#F3F4F6"');
    expect(html).toContain('stroke="#C5CBD4"');
    expect(html).not.toContain("tabler-icon-star-filled");
    expect(html).not.toContain("lucide-star");
    expect(html).toContain("size-5");
    expect(html).toContain("flex-1 text-base leading-relaxed");
    expect(html).toContain("mt-4 text-sm font-medium not-italic");
  });

  it("keeps cards borderless with one fixed, readable card surface", () => {
    for (const layout of ["grid", "list", "carousel"] as const) {
      const html = render(layout, "muted");
      expect(html).toContain("background:var(--site-card);color:var(--site-text)");
      expect(html).not.toContain("rounded-[var(--site-radius)] border p-5");
    }
  });
});
