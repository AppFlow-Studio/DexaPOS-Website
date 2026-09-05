import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import FeaturesSection from "@/components/site-builder/sections/FeaturesSection";
import { emptyResolvedMap } from "../bindings/resolved";
import { createRenderContext } from "../render-context";
import { describeSchema } from "../schema-introspect";
import { SECTION_REGISTRY } from "../sections/registry";
import type { FeaturesProps } from "../sections/schemas/features";
import type { SectionStyle } from "../sections/primitives";

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

/** The five from the screenshots of Owner's editor, in their order. */
const OWNERS_LIST: FeaturesProps["items"] = [
  { title: "Catering", icon: "UtensilsCrossed" },
  { title: "Gluten-Free Options", icon: "WheatOff" },
  { title: "Healthy Options", icon: "Heart" },
  { title: "Easy Parking", icon: "Car" },
  { title: "Vegan Options", icon: "Leaf" },
];

function render(props: Partial<FeaturesProps> = {}, style?: SectionStyle) {
  return renderToStaticMarkup(
    <FeaturesSection
      section={{
        id: "sec_features",
        kind: "features" as const,
        props: { heading: "Featuring", items: OWNERS_LIST, ...props },
        style,
      }}
      resolved={emptyResolvedMap()}
      ctx={ctx}
    />,
  );
}

describe("the highlights strip", () => {
  it("draws one icon and one label per highlight", () => {
    const html = render();
    for (const item of OWNERS_LIST) expect(html).toContain(item.title);
    // lucide renders an <svg> per icon; the heading contributes none.
    expect(html.match(/<svg/g)).toHaveLength(OWNERS_LIST.length);
  });

  /**
   * Wrapping, never a fixed column count. Five items falling three-then-two is
   * the layout doing this on its own, and is the reason the merchant is not
   * asked to choose a column count.
   */
  it("wraps rather than using a column grid", () => {
    const html = render();
    expect(html).toContain("flex-wrap");
    expect(html).not.toMatch(/grid-cols-\d/);
  });

  describe("alignment", () => {
    /**
     * Centred is the default because that is how the reference renders it, and
     * because a merchant who has set nothing should get the good-looking one.
     */
    it("centres the heading and the strip when nothing is set", () => {
      const html = render();
      expect(html).toContain("justify-center");
      expect(html).toContain("text-center");
    });

    it("centres the heading text, not merely its column", () => {
      // `mx-auto` alone leaves a short heading against the left edge of a
      // centred column, which is the bug this asserts is fixed.
      expect(render()).toMatch(/<header class="[^"]*mx-auto[^"]*text-center/);
    });

    it("packs left when the merchant chooses Left", () => {
      const html = render({}, { align: "left" });
      expect(html).toContain("justify-start");
      expect(html).not.toContain("justify-center");
    });

    /** The items follow the heading; there is no second switch to disagree with. */
    it("moves the heading and the items together", () => {
      const left = render({}, { align: "left" });
      expect(left).not.toMatch(/<header class="[^"]*text-center/);
      expect(left).toContain("justify-start");
    });
  });

  it("renders nothing on a public page when the merchant added no highlights", () => {
    expect(render({ items: [] })).toBe("");
  });

  describe("icon colour", () => {
    /**
     * `--site-text-brand`, not `--site-brand`: the theme's readable tint of the
     * brand rather than the raw fill. The icons used to take the raw fill, which
     * is the same defect the footer phone number had.
     */
    it("follows the brand by default", () => {
      expect(render()).toContain("var(--site-text-brand)");
    });

    it("passes a custom colour through when it already reads on the surface", () => {
      const html = render({ iconTone: "custom", iconColor: "#7F1D1D" });
      expect(html.toLowerCase()).toContain("#7f1d1d");
      expect(html).not.toContain("var(--site-text-brand)");
    });

    /**
     * The same guard section text gets. A pale icon on a pale surface is the
     * failure this prevents, and it is the reason the picker can be offered at
     * all rather than a closed set of tones.
     */
    it("darkens a custom colour that would vanish into the surface", () => {
      const html = render({ iconTone: "custom", iconColor: "#FFFFF0" });
      expect(html.toLowerCase()).not.toContain("#fffff0");
    });

    it("declines a custom colour on a brand band, which has no room for one", () => {
      const html = render({ iconTone: "custom", iconColor: "#B91C1C" }, { background: "brand" });
      expect(html.toLowerCase()).not.toContain("#b91c1c");
    });
  });
});

describe("the highlights drawer", () => {
  /**
   * `items`, `iconTone` and `iconColor` are drawn by `FeaturesEditor`, so the
   * schema-derived drawer must not draw them a second time. This is the
   * assertion that catches a field added to the schema and forgotten in
   * `hiddenFields` — which would show the merchant two controls for one value.
   */
  it("generates the heading only, leaving the rest to FeaturesEditor", () => {
    const def = SECTION_REGISTRY.features;
    const hidden = new Set(def.hiddenFields?.({}) ?? []);
    const generated = describeSchema(def.schema)
      .filter((control) => !hidden.has(control.name))
      .map((control) => control.name);

    expect(generated).toEqual(["heading"]);
  });

  it("hides every schema field it does not generate", () => {
    const def = SECTION_REGISTRY.features;
    const hidden = new Set(def.hiddenFields?.({}) ?? []);
    const all = describeSchema(def.schema).map((control) => control.name);

    expect(all.filter((name) => !hidden.has(name))).toEqual(["heading"]);
    expect([...hidden].every((name) => all.includes(name))).toBe(true);
  });
});
