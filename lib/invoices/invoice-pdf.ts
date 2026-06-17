// Server-side invoice PDF generator. Mirrors the content of the public invoice
// view (app/invoice/[token]/page.tsx) and the email template
// (lib/messaging/invoice-template.ts) so the three stay visually consistent.
//
// Unlike lib/subscription-billing/invoice-pdf.ts (which ends in pdf.save() — a
// browser-only download API), this returns a Buffer via pdf.output("arraybuffer")
// so it can run in a Node server action / route handler and be attached to email
// or streamed as a download. Reuses jsPDF + jspdf-autotable (already deps).

import type { InvoiceTemplateData } from "@/lib/messaging/invoice-template";

// DEXA palette — neutral/white with a single brand blue. Mirrors the templates.
const INK = "#171717";
const MUTED = "#525252";
const FAINT = "#737373";
const HAIRLINE = "#e5e5e5";
const RULE_STRONG = "#d4d4d4";
const BRAND = "#0C4FD1";

function num(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
}

function fmtMoney(v: unknown): string {
  return `$${num(v).toFixed(2)}`;
}

function fileSafe(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildInvoicePdfFilename(invoiceNumber: string): string {
  const base = fileSafe(invoiceNumber || "invoice") || "invoice";
  return `${base}.pdf`;
}

/**
 * Render an invoice to a PDF Buffer. Layout mirrors the hosted invoice view:
 * centered header, "Amount due" headline, payment-due meta, line items table,
 * totals, optional note, and a "Powered by Dexa POS" footer.
 */
export async function generateInvoicePdfBuffer(
  data: InvoiceTemplateData,
): Promise<Buffer> {
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = autoTableModule.default;

  const pdf = new jsPDF({ unit: "pt", format: "letter" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const marginX = 56;
  const contentWidth = pageWidth - marginX * 2;
  const centerX = pageWidth / 2;
  let y = 64;

  const subtotal = num(data.subtotal);
  const discount = num(data.discountAmount);
  const taxRate = num(data.taxRate);
  const tax = num(data.taxAmount);
  const total = num(data.totalAmount);
  const paid = num(data.amountPaid);
  const amountDue = Math.max(0, total - paid);

  // ── Header (centered business name + invoice number) ───────────────────────
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(17);
  pdf.setTextColor(INK);
  pdf.text((data.businessName || "Invoice").toUpperCase(), centerX, y, {
    align: "center",
  });

  y += 18;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.setTextColor(MUTED);
  pdf.text(`Invoice ${data.invoiceNumber}`, centerX, y, { align: "center" });

  if (data.dueLabel) {
    y += 15;
    pdf.text(`Payment due: ${data.dueLabel}`, centerX, y, { align: "center" });
  }

  // ── Amount due headline ────────────────────────────────────────────────────
  y += 28;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(FAINT);
  pdf.text("AMOUNT DUE", centerX, y, { align: "center" });

  y += 24;
  pdf.setFontSize(26);
  pdf.setTextColor(INK);
  pdf.text(fmtMoney(amountDue), centerX, y, { align: "center" });

  // ── Rule ───────────────────────────────────────────────────────────────────
  y += 22;
  pdf.setDrawColor(HAIRLINE);
  pdf.setLineWidth(0.7);
  pdf.line(marginX, y, pageWidth - marginX, y);
  y += 22;

  // ── Items table ────────────────────────────────────────────────────────────
  const body = (data.items.length ? data.items : []).map((item) => {
    const qty = num(item.quantity) || 1;
    const name = item.name || "Item";
    const label = item.description ? `${name}\n${item.description}` : name;
    return [
      String(qty),
      label,
      fmtMoney(item.unit_price),
      fmtMoney(item.total_price),
    ];
  });

  autoTable(pdf, {
    startY: y,
    margin: { left: marginX, right: marginX },
    theme: "plain",
    styles: {
      font: "helvetica",
      fontSize: 10,
      textColor: INK,
      cellPadding: { top: 7, right: 0, bottom: 7, left: 0 },
      lineColor: HAIRLINE,
      lineWidth: 0,
    },
    headStyles: {
      fontStyle: "bold",
      textColor: MUTED,
      fontSize: 9,
      lineColor: RULE_STRONG,
      lineWidth: { bottom: 0.7 },
    },
    head: [["Qty", "Item", "Unit price", "Amount"]],
    body: body.length
      ? body
      : [["", "No items", "", ""]],
    columnStyles: {
      0: { halign: "left", cellWidth: 36 },
      1: { halign: "left", cellWidth: contentWidth - 36 - 90 - 90 },
      2: { halign: "right", cellWidth: 90 },
      3: { halign: "right", cellWidth: 90 },
    },
  });

  // jspdf-autotable stashes the final Y on the doc instance.
  y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
    .finalY;

  // ── Totals (right-aligned block) ───────────────────────────────────────────
  y += 8;
  pdf.setDrawColor(HAIRLINE);
  pdf.line(marginX, y, pageWidth - marginX, y);
  y += 20;

  const labelX = pageWidth - marginX - 200;
  const valueX = pageWidth - marginX;

  const totalsRows: Array<[string, string]> = [
    ["Subtotal", fmtMoney(subtotal)],
  ];
  if (discount > 0) totalsRows.push(["Discount", `-${fmtMoney(discount)}`]);
  if (taxRate > 0) totalsRows.push([`Tax (${taxRate}%)`, fmtMoney(tax)]);
  if (paid > 0) totalsRows.push(["Amount paid", `-${fmtMoney(paid)}`]);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(MUTED);
  totalsRows.forEach(([label, value]) => {
    pdf.setTextColor(MUTED);
    pdf.text(label, labelX, y);
    pdf.setTextColor(INK);
    pdf.text(value, valueX, y, { align: "right" });
    y += 16;
  });

  // Total due — emphasized with a hairline above.
  y += 2;
  pdf.setDrawColor(RULE_STRONG);
  pdf.line(labelX, y - 8, valueX, y - 8);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.setTextColor(INK);
  pdf.text("TOTAL DUE", labelX, y + 4);
  pdf.text(fmtMoney(amountDue), valueX, y + 4, { align: "right" });
  y += 24;

  // ── Note ───────────────────────────────────────────────────────────────────
  if (data.note) {
    y += 8;
    pdf.setDrawColor(HAIRLINE);
    pdf.line(marginX, y, pageWidth - marginX, y);
    y += 18;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(FAINT);
    pdf.text("NOTE", marginX, y);
    y += 14;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(MUTED);
    const noteLines = pdf.splitTextToSize(data.note, contentWidth);
    pdf.text(noteLines, marginX, y);
    y += noteLines.length * 13;
  }

  // ── Footer ─────────────────────────────────────────────────────────────────
  const footerY = pdf.internal.pageSize.getHeight() - 48;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(FAINT);
  pdf.text("Powered by ", centerX, footerY, { align: "center" });
  // Brand wordmark, nudged so "Dexa POS" sits beside the prefix.
  const prefixWidth = pdf.getTextWidth("Powered by ");
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(BRAND);
  pdf.text("Dexa POS", centerX + prefixWidth / 2, footerY, { align: "left" });

  const arrayBuffer = pdf.output("arraybuffer");
  return Buffer.from(arrayBuffer);
}
