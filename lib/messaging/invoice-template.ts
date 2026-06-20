// Branded HTML + SMS templates for invoice delivery. Email-client-safe: table
// layout, inline styles, no flex/grid (graceful in Outlook + Gmail). Visual
// language mirrors the receipt template but for a payable: header, line items,
// totals, amount due, and an absolute "View & pay invoice" CTA.

export interface InvoiceTemplateItem {
  name: string;
  description?: string | null;
  quantity: number | string | null;
  unit_price: number | string | null;
  total_price: number | string | null;
}

export interface InvoiceTemplateData {
  invoiceNumber: string;
  businessName: string;
  subtotal: number | string | null;
  discountAmount: number | string | null;
  taxRate: number | string | null;
  taxAmount: number | string | null;
  totalAmount: number | string | null;
  amountPaid?: number | string | null;
  dueLabel?: string | null;
  note?: string | null;
  items: InvoiceTemplateItem[];
}

export interface RenderInvoiceOptions {
  merchantLogoUrl?: string | null;
  /** Absolute hosted invoice URL (https://…/invoice/<token>). */
  payUrl?: string | null;
}

/**
 * Human label for an invoice's payment-due terms. Shared by the email sender,
 * the public page, and the PDF so all three render terms identically.
 */
export function dueLabelFor(
  paymentDueType: string | null,
  dueDate: string | null,
): string | null {
  switch (paymentDueType) {
    case "upon_receipt":
      return "Upon receipt";
    case "net_15":
      return "Net 15";
    case "net_30":
      return "Net 30";
    case "net_60":
      return "Net 60";
    case "custom":
      return dueDate
        ? new Date(dueDate).toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
          })
        : null;
    default:
      return null;
  }
}

// DEXA palette — neutral/white with a single brand blue.
const INK = "#171717";
const INK_SOFT = "#404040";
const MUTED = "#525252";
const FAINT = "#737373";
const HAIRLINE = "#e5e5e5";
const RULE_STRONG = "#d4d4d4";
const PAPER = "#ffffff";
const PAGE_BG = "#e5e5e5";
const BRAND = "#0C4FD1";
const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function num(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
}

function fmtMoney(v: unknown): string {
  return `$${num(v).toFixed(2)}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function rule(strong = false): string {
  return `<tr><td style="padding:14px 0;"><div style="height:1px;line-height:1px;font-size:0;background:${
    strong ? RULE_STRONG : HAIRLINE
  };">&nbsp;</div></td></tr>`;
}

function lineRow(label: string, value: string, strong = false): string {
  const weight = strong ? "600" : "400";
  const labelColor = strong ? INK : MUTED;
  const valueColor = strong ? INK : INK_SOFT;
  return `
    <tr>
      <td style="padding:2px 0;font:${weight} 13px/1.5 ${FONT};color:${labelColor};">${escapeHtml(
        label,
      )}</td>
      <td style="padding:2px 0;text-align:right;font:${weight} 13px/1.5 ${FONT};color:${valueColor};white-space:nowrap;">${escapeHtml(
        value,
      )}</td>
    </tr>`;
}

/**
 * Branded HTML invoice email. The amount due (= total − amount_paid) is the
 * headline; the CTA links to the hosted /invoice/<token> page.
 */
export function renderInvoiceHtml(
  data: InvoiceTemplateData,
  options: RenderInvoiceOptions = {},
): string {
  const subtotal = num(data.subtotal);
  const discount = num(data.discountAmount);
  const taxRate = num(data.taxRate);
  const tax = num(data.taxAmount);
  const total = num(data.totalAmount);
  const paid = num(data.amountPaid);
  const amountDue = Math.max(0, total - paid);

  const logoBlock = options.merchantLogoUrl
    ? `<img src="${escapeHtml(options.merchantLogoUrl)}" alt="${escapeHtml(
        data.businessName,
      )}" width="64" height="64" style="display:inline-block;width:64px;height:64px;object-fit:contain;border:0;outline:none;text-decoration:none;margin-bottom:10px;">`
    : "";

  const itemsHtml = data.items
    .map((item) => {
      const qty = num(item.quantity) || 1;
      const name = escapeHtml(item.name || "Item");
      const desc = item.description
        ? `<div style="font:400 12px/1.5 ${FONT};color:${FAINT};margin-top:2px;">${escapeHtml(
            item.description,
          )}</div>`
        : "";
      return `
        <tr>
          <td style="padding:8px 0 0 0;font:400 14px/1.4 ${FONT};color:${INK};">
            <span style="color:${INK};">${qty}</span>&nbsp;&nbsp;${name}${desc}
          </td>
          <td style="padding:8px 0 0 0;text-align:right;font:400 14px/1.4 ${FONT};color:${INK};white-space:nowrap;">${fmtMoney(
            item.total_price,
          )}</td>
        </tr>`;
    })
    .join("");

  const totalsHtml = [
    lineRow("Subtotal", fmtMoney(subtotal)),
    discount > 0 ? lineRow("Discount", `−${fmtMoney(discount)}`) : "",
    taxRate > 0 ? lineRow(`Tax (${taxRate}%)`, fmtMoney(tax)) : "",
    paid > 0 ? lineRow("Amount Paid", `−${fmtMoney(paid)}`) : "",
  ].join("");

  const dueBlock = data.dueLabel
    ? `<div style="margin-top:4px;font:400 13px/1.5 ${FONT};color:${MUTED};">Payment due: ${escapeHtml(
        data.dueLabel,
      )}</div>`
    : "";

  const noteBlock = data.note
    ? `${rule()}
      <tr><td>
        <div style="font:600 12px/1.4 ${FONT};text-transform:uppercase;letter-spacing:0.04em;color:${FAINT};margin-bottom:4px;">Note</div>
        <div style="font:400 13px/1.6 ${FONT};color:${INK_SOFT};white-space:pre-wrap;">${escapeHtml(
          data.note,
        )}</div>
      </td></tr>`
    : "";

  const ctaHtml = options.payUrl
    ? `
    <tr><td style="padding:6px 0 0 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr><td align="center" style="padding:0;">
          <a href="${escapeHtml(
            options.payUrl,
          )}" target="_blank" style="display:inline-block;padding:12px 26px;background:${BRAND};color:#ffffff;font:600 14px/1 ${FONT};text-decoration:none;letter-spacing:0.02em;border-radius:6px;">View &amp; pay invoice</a>
        </td></tr>
      </table>
    </td></tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="format-detection" content="telephone=no,address=no,email=no">
<title>Invoice ${escapeHtml(data.invoiceNumber)}</title>
</head>
<body style="margin:0;padding:0;background:${PAGE_BG};-webkit-font-smoothing:antialiased;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAGE_BG};">
  <tr>
    <td align="center" style="padding:28px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:420px;background:${PAPER};box-shadow:0 6px 24px rgba(0,0,0,0.10);border-radius:8px;">
        <tr>
          <td style="padding:30px 28px 28px 28px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <!-- Header -->
              <tr><td style="text-align:center;">
                ${logoBlock}
                <div style="font:700 17px/1.25 ${FONT};text-transform:uppercase;letter-spacing:0.03em;color:${INK};">${escapeHtml(
                  data.businessName,
                )}</div>
                <div style="margin-top:6px;font:400 13px/1.5 ${FONT};color:${MUTED};">Invoice ${escapeHtml(
                  data.invoiceNumber,
                )}</div>
                ${dueBlock}
              </td></tr>
              ${rule()}
              <!-- Amount due headline -->
              <tr><td style="text-align:center;padding:2px 0 2px 0;">
                <div style="font:600 12px/1.4 ${FONT};text-transform:uppercase;letter-spacing:0.06em;color:${FAINT};">Amount due</div>
                <div style="margin-top:4px;font:700 30px/1.1 ${FONT};color:${INK};">${fmtMoney(
                  amountDue,
                )}</div>
              </td></tr>
              ${ctaHtml ? `<tr><td style="padding:14px 0 0 0;"></td></tr>${ctaHtml}` : ""}
              ${rule()}
              <!-- Items -->
              <tr><td>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  ${
                    itemsHtml ||
                    `<tr><td style="padding:8px 0;color:${FAINT};font:400 13px/1.5 ${FONT};">No items</td></tr>`
                  }
                </table>
              </td></tr>
              ${rule()}
              <!-- Totals -->
              <tr><td>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  ${totalsHtml}
                </table>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:10px;border-top:1px solid ${RULE_STRONG};">
                  <tr>
                    <td style="padding:10px 0 0 0;font:700 15px/1.2 ${FONT};text-transform:uppercase;letter-spacing:0.03em;color:${INK};">Total Due</td>
                    <td style="padding:10px 0 0 0;text-align:right;font:700 15px/1.2 ${FONT};color:${INK};white-space:nowrap;">${fmtMoney(
                      amountDue,
                    )}</td>
                  </tr>
                </table>
              </td></tr>
              ${noteBlock}
              ${rule()}
              <!-- Footer -->
              <tr><td style="text-align:center;">
                <div style="font:500 13px/1.4 ${FONT};color:${INK};">Thank you for your business!</div>
              </td></tr>
            </table>
          </td>
        </tr>
      </table>
      <div style="margin-top:14px;font:400 11px/1.5 ${FONT};color:${FAINT};">
        Powered by <span style="color:${INK_SOFT};font-weight:700;">Dexa POS</span>
      </div>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/**
 * SMS invoice — single branded line with the absolute pay link. Short enough to
 * fit one segment and avoid carrier spam flags.
 */
export function renderInvoiceText(
  data: InvoiceTemplateData,
  payUrl: string,
): string {
  const total = num(data.totalAmount);
  const paid = num(data.amountPaid);
  const amountDue = Math.max(0, total - paid);
  return `${data.businessName} — Invoice ${data.invoiceNumber}, ${fmtMoney(
    amountDue,
  )} due. View & pay: ${payUrl}`;
}
