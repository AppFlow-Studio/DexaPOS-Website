import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import React from "react";
import { PageHeader } from "../PageHeader";
import { PanelSection } from "../PanelSection";
import { StatTile, InsetTile } from "../StatTile";

// UI-DESIGN-SYSTEM §13.4: below `sm` a page drops its subtitle, section
// captions and stat metas. The primitives do it by default so sixty pages do
// not each have to remember; a line that carries scope opts back in.

/** Classes of the element that directly wraps `text`. */
function classesAround(html: string, text: string): string {
  const match = html.match(new RegExp(`class="([^"]*)"[^>]*>${text}<`));
  if (!match) throw new Error(`no element wrapping "${text}" in ${html}`);
  return match[1];
}

describe("PageHeader subtitle on phones", () => {
  it("hides the subtitle below sm by default", () => {
    const html = renderToString(<PageHeader title="Orders" subtitle="Track every order" />);

    expect(classesAround(html, "Track every order")).toContain("max-sm:hidden");
  });

  it("keeps a subtitle that carries scope", () => {
    const html = renderToString(
      <PageHeader title="Location settings" subtitle="Downtown" showSubtitleOnMobile />,
    );

    expect(classesAround(html, "Downtown")).not.toContain("max-sm:hidden");
  });

  it("still merges subtitleClassName", () => {
    const html = renderToString(
      <PageHeader title="Orders" subtitle="Track every order" subtitleClassName="max-md:hidden" />,
    );
    const classes = classesAround(html, "Track every order");

    expect(classes).toContain("max-md:hidden");
    expect(classes).toContain("max-sm:hidden");
  });
});

describe("PanelSection caption on phones", () => {
  it("hides the caption below sm by default", () => {
    const html = renderToString(<PanelSection label="Revenue" caption="Gross, before refunds" />);

    expect(classesAround(html, "Gross, before refunds")).toContain("max-sm:hidden");
  });

  it("keeps a caption that carries scope", () => {
    const html = renderToString(
      <PanelSection label="Revenue" caption="Last 30 days" showCaptionOnMobile />,
    );

    expect(classesAround(html, "Last 30 days")).not.toContain("max-sm:hidden");
  });
});

describe("StatTile meta on phones", () => {
  it("hides the meta line below sm by default", () => {
    const html = renderToString(<StatTile label="Orders" value="124" meta="vs last week" />);

    expect(classesAround(html, "vs last week")).toContain("max-sm:hidden");
  });

  it("keeps a meta line the figure depends on", () => {
    const html = renderToString(
      <StatTile label="Active" value="9" meta="of 12 locations" showMetaOnMobile />,
    );

    expect(classesAround(html, "of 12 locations")).not.toContain("max-sm:hidden");
  });
});

describe("InsetTile meta on phones", () => {
  it("hides the meta line below sm by default", () => {
    const html = renderToString(<InsetTile label="DoorDash" value="$1,204" meta="42 orders" />);

    expect(classesAround(html, "42 orders")).toContain("max-sm:hidden");
  });

  it("keeps a meta line on request and merges metaClassName", () => {
    const html = renderToString(
      <InsetTile label="DoorDash" value="$1,204" meta="42 orders" showMetaOnMobile metaClassName="font-medium" />,
    );
    const classes = classesAround(html, "42 orders");

    expect(classes).not.toContain("max-sm:hidden");
    expect(classes).toContain("font-medium");
  });
});
