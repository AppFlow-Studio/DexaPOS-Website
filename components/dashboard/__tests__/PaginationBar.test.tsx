import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import React from "react";
import { PaginationBar } from "../PaginationBar";
import type { PaginationMeta } from "@/types/pagination";

const meta = (total: number, pageSize = 10, page = 2): PaginationMeta => ({
  page,
  pageSize,
  total,
  totalPages: Math.max(1, Math.ceil(total / pageSize)),
  hasNextPage: page * pageSize < total,
  hasPreviousPage: page > 1,
});

describe("PaginationBar", () => {
  it("draws no rule above itself (UI-DESIGN-SYSTEM §5.5)", () => {
    const html = renderToString(<PaginationBar pagination={meta(29)} onPageChange={() => {}} />);
    const rootClasses = html.match(/class="([^"]*)"/)?.[1] ?? "";

    expect(rootClasses.split(/\s+/)).not.toContain("border-t");
  });

  it("states the range and the total", () => {
    const html = renderToString(
      <PaginationBar pagination={meta(29)} onPageChange={() => {}} itemLabel="alerts" />,
    );
    // Visible text only: renderToString separates adjacent text nodes with
    // `<!-- -->`, so "11-20" never appears literally in the markup.
    const text = html.replace(/<[^>]+>/g, "");

    expect(text).toContain("Showing 11-20 of 29 alerts");
  });

  it("renders nothing when every row fits on one page", () => {
    const html = renderToString(<PaginationBar pagination={meta(8, 10, 1)} onPageChange={() => {}} />);

    expect(html).toBe("");
  });
});
