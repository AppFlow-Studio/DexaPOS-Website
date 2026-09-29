import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import React from "react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "../table";

const render = (props: React.ComponentProps<typeof Table>) =>
  renderToString(
    <Table {...props}>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>Row</TableCell>
        </TableRow>
      </TableBody>
    </Table>,
  );

// renderToString escapes `&` inside attributes, so `[&_tr]` arrives as `[&amp;_tr]`.
const classesOf = (html: string, slot: string) =>
  (html.match(new RegExp(`data-slot="${slot}"[^>]*class="([^"]*)"`))?.[1] ?? "")
    .replace(/&amp;/g, "&")
    .split(/\s+/);

describe("TableHeader — no rule under a data table's header (UI-DESIGN-SYSTEM §5.5)", () => {
  it("clears the header row's border under variant=data", () => {
    const header = classesOf(render({ variant: "data" }), "table-header");

    expect(header).toContain("[&_tr]:border-0");
    expect(header).not.toContain("[&_tr]:border-b");
  });

  it("keeps the header rule on a default table", () => {
    const header = classesOf(render({}), "table-header");

    expect(header).toContain("[&_tr]:border-b");
  });
});

describe("Table — bounded height (UI-DESIGN-SYSTEM §5.7)", () => {
  it("caps a data table's height from md up and pins its header", () => {
    const html = render({ variant: "data" });
    const container = classesOf(html, "table-container");
    const header = classesOf(html, "table-header");

    expect(container).toContain("md:max-h-[min(70vh,40rem)]");
    expect(container).toContain("md:overflow-y-auto");
    expect(header).toEqual(expect.arrayContaining(["sticky", "top-0", "bg-card", "[&_tr]:bg-muted/50"]));
  });

  it("never caps on phones, where a nested touch scroll traps the thumb", () => {
    const container = classesOf(render({ variant: "data" }), "table-container");

    expect(container).not.toContain("max-h-[min(70vh,40rem)]");
    expect(container).not.toContain("overflow-y-auto");
  });

  it("prints at full height", () => {
    const html = render({ variant: "data" });

    expect(classesOf(html, "table-container")).toEqual(
      expect.arrayContaining(["print:max-h-none", "print:overflow-visible"]),
    );
    expect(classesOf(html, "table-header")).toContain("print:static");
  });

  it("opts out with bounded={false}, for dialogs and nested tables", () => {
    const html = render({ variant: "data", bounded: false });

    expect(classesOf(html, "table-container").join(" ")).not.toContain("max-h-");
    expect(classesOf(html, "table-header")).not.toContain("sticky");
  });

  it("lets containerClassName set a different cap", () => {
    const container = classesOf(render({ variant: "data", containerClassName: "md:max-h-80" }), "table-container");

    expect(container).toContain("md:max-h-80");
    expect(container).not.toContain("md:max-h-[min(70vh,40rem)]");
  });

  it("leaves default tables alone", () => {
    const html = render({});

    expect(classesOf(html, "table-container").join(" ")).not.toContain("max-h-");
    expect(classesOf(html, "table-header")).not.toContain("sticky");
  });
});
