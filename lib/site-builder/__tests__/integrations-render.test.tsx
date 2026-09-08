import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import IntegrationsSection from "@/components/site-builder/sections/IntegrationsSection";
import { emptyResolvedMap } from "../bindings/resolved";
import { createRenderContext, type RenderMode } from "../render-context";
import { integrationsDefaults } from "../sections/schemas/integrations";
import type { IntegrationsProps } from "../sections/schemas";

const UNTAPPD = "https://business.untappd.com/embeds/iframes/2800/7676";

function render(props: Partial<IntegrationsProps>, mode: RenderMode = "public"): string {
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
    <IntegrationsSection
      section={{
        id: "sec_1",
        kind: "integrations" as const,
        props: { ...integrationsDefaults(), ...props },
      }}
      resolved={emptyResolvedMap()}
      ctx={ctx}
    />,
  );
}

describe("a configured integration", () => {
  it("frames the reconstructed URL, not the merchant's paste", () => {
    const html = render({
      provider: "untappd",
      embedUrl: UNTAPPD,
      title: "What's on tap",
    });
    expect(html).toContain(`src="${UNTAPPD}"`);
    expect(html).toContain("What&#x27;s on tap");
    expect(html).toContain("sandbox=");
  });

  it("names the frame after the provider when the merchant gave no title", () => {
    expect(render({ provider: "untappd", embedUrl: UNTAPPD })).toContain(
      'title="Untappd beer menu"',
    );
  });
});

/**
 * The placeholder is the whole point of the Owner comparison: an unconfigured
 * integration should read as unfinished, in the page's own type at the section's
 * own spacing, rather than as a dashed developer box or as nothing at all.
 */
describe("an unconfigured integration", () => {
  it("shows the provider's own name and says what is missing, in the builder", () => {
    const html = render({ provider: "untappd", embedUrl: "" }, "builder");
    expect(html).toContain("Untappd beer menu");
    expect(html).toContain("Add your Untappd embed information to configure this integration.");
    expect(html).not.toContain("<iframe");
  });

  it("prefers the merchant's own title when they set one", () => {
    const html = render({ provider: "spotify", embedUrl: "", title: "Our playlist" }, "builder");
    expect(html).toContain("Our playlist");
    expect(html).not.toContain("Spotify player");
  });

  /**
   * `preview` and `public` are the same DOM as the live site. Configuration
   * instructions reaching a visitor would be worse than the section being
   * absent, so an unfilled integration simply is not there.
   */
  it.each<RenderMode>(["public", "preview"])("renders nothing at all in %s", (mode) => {
    expect(render({ provider: "untappd", embedUrl: "" }, mode)).toBe("");
  });

  /**
   * A stored link that no longer resolves — a provider switched behind an old
   * document, or a value repaired by `normalize` — takes the same path as an
   * empty one rather than framing something that will not load.
   */
  it("treats an unresolvable stored link exactly like an empty one", () => {
    expect(render({ provider: "untappd", embedUrl: "https://evil.test/x" }, "public")).toBe("");
    expect(render({ provider: "untappd", embedUrl: "https://evil.test/x" }, "builder")).toContain(
      "Add your Untappd embed information",
    );
  });
});
