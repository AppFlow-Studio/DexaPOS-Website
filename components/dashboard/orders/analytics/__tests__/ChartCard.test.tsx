import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import React from "react";
import { ChartCard } from "../ChartCard";

// UI-DESIGN-SYSTEM §13.4: chart subtitles drop below `sm`; the chart stays.

const classesAround = (html: string, text: string) =>
  html.match(new RegExp(`class="([^"]*)"[^>]*>${text}<`))?.[1] ?? "";

describe("ChartCard subtitle on phones", () => {
  it("hides the subtitle below sm by default", () => {
    const html = renderToString(
      <ChartCard title="Hourly sales" subtitle="Revenue by hour of day">chart</ChartCard>,
    );

    expect(classesAround(html, "Revenue by hour of day")).toContain("max-sm:hidden");
  });

  it("keeps a subtitle that states the chart's unit", () => {
    const html = renderToString(
      <ChartCard title="Covers" subtitle="Average covers per hour" showSubtitleOnMobile>
        chart
      </ChartCard>,
    );

    expect(classesAround(html, "Average covers per hour")).not.toContain("max-sm:hidden");
  });
});
