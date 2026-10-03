/** @vitest-environment happy-dom */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../table";

// React only flushes act() work when it knows it is under a test.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/*
 * A full-width row (empty state, loading, expanded detail) spans every column
 * with `colSpan={N}`. When tiered columns are hidden below their breakpoint
 * (§5.3), N is wider than the visible header, and a `table-fixed` table grows
 * an anonymous extra column that takes a share of the width: the header band
 * stops short of the table's right edge. The table clamps such spans to the
 * columns its header actually shows.
 */

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function Harness({ hideLast = true, span = 3 }: { hideLast?: boolean; span?: number }) {
  return (
    <Table variant="data" bounded={false} className="table-fixed">
      <TableHeader>
        <TableRow>
          <TableHead>One</TableHead>
          <TableHead>Two</TableHead>
          {/* Stands in for `hidden xl:table-cell` below its breakpoint. */}
          <TableHead style={hideLast ? { display: "none" } : undefined}>Three</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell colSpan={span}>Full width</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

const spanOf = () => Number(container.querySelector("td")?.getAttribute("colspan"));

describe("TableCell colSpan — never wider than the visible header", () => {
  it("clamps a full-width span to the header cells that are showing", () => {
    act(() => root.render(<Harness />));

    expect(spanOf()).toBe(2);
  });

  it("keeps the full span when every header cell shows", () => {
    act(() => root.render(<Harness hideLast={false} />));

    expect(spanOf()).toBe(3);
  });

  it("leaves a span that already fits alone", () => {
    act(() => root.render(<Harness span={1} />));

    expect(spanOf()).toBe(1);
  });

  it("recounts when a header cell is hidden after mount", async () => {
    act(() => root.render(<Harness hideLast={false} />));
    expect(spanOf()).toBe(3);

    await act(async () => {
      container.querySelectorAll("th")[2].style.display = "none";
      // MutationObserver callbacks run as microtasks.
      await Promise.resolve();
    });

    expect(spanOf()).toBe(2);
  });
});
