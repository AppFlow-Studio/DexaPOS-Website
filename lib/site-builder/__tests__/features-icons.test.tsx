import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import FeaturesSection, {
  FEATURE_ICON_NAMES,
} from "@/components/site-builder/sections/FeaturesSection";
import { emptyResolvedMap } from "../bindings/resolved";
import { createRenderContext, type RenderMode } from "../render-context";
import { featuresDefaults, type FeaturesProps } from "../sections/schemas/features";

const ROOT = join(__dirname, "..", "..", "..");

function section(props: Partial<FeaturesProps> = {}) {
  return {
    id: "sec_features",
    kind: "features" as const,
    props: { ...featuresDefaults(), ...props },
  };
}

function render(props: Partial<FeaturesProps>, mode: RenderMode = "public"): string {
  const ctx = createRenderContext({
    mode,
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

  return renderToStaticMarkup(
    <FeaturesSection section={section(props)} resolved={emptyResolvedMap()} ctx={ctx} />,
  );
}

describe("FeaturesSection icons", () => {
  /**
   * The regression this guards. This section renders on the server, and its
   * output is serialized as an RSC flight payload by `renderCanvas` for the
   * builder canvas and the new-page template preview. Every lucide icon sits
   * behind a shared `"use client"` base module, so returning one inside that
   * payload made React ask the invoking route's client manifest for a module it
   * never bundled — crashing the Showcase-template preview in production with
   * "Could not find the module .../lucide-react/dist/esm/Icon.mjs#default in the
   * React Client Manifest". Icons must therefore be inline SVG, never lucide
   * components, so nothing in this section imports lucide-react.
   */
  it("does not import lucide-react (icons must be inline SVG, not client components)", () => {
    const source = readFileSync(
      join(ROOT, "components/site-builder/sections/FeaturesSection.tsx"),
      "utf8",
    );
    expect(source).not.toMatch(/from ["']lucide-react["']/);
  });

  it("renders an allowlisted icon as an SVG with lucide's own geometry", () => {
    const html = render({
      items: [{ icon: "Truck", title: "Delivery and pickup" }],
      columns: 3,
    });

    expect(html).toContain("<svg");
    expect(html).toContain('stroke="currentColor"');
    // Truck's first path, verbatim from lucide's icon data — proves the name
    // resolved against the allowlist and rendered real geometry, not a blank.
    expect(html).toContain("M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2");
    expect(html).toContain("Delivery and pickup");
  });

  it("renders nothing for an unrecognised icon name but keeps the item", () => {
    const html = render({
      items: [{ icon: "NotARealIcon", title: "Still here" }],
      columns: 3,
    });

    expect(html).not.toContain("<svg");
    expect(html).toContain("Still here");
  });

  it("keeps every showcase-template icon in the allowlist", () => {
    // The Showcase starter seeds Truck / Clock / Leaf; the picker offers the
    // rest. A name dropped from the map degrades to no icon, so guard the set.
    for (const name of ["Truck", "Clock", "Leaf"]) {
      expect(FEATURE_ICON_NAMES).toContain(name);
    }
  });
});
