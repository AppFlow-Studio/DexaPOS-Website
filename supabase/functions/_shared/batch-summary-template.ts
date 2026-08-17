// Email renderer for the batch-out settlement summary.
//
// Maps 1:1 to the printed batch-out ticket (PrinterService.printBatchSummary on
// the tablet). Consumes the jsonb returned by get_batch_summary_v1 verbatim —
// all money is persisted NUMERIC and is rendered as-is; totals are NEVER
// recomputed here (same discipline as receipt-template.ts). Email-client-safe:
// table layout, inline styles, no flex/grid, graceful in Outlook + Gmail.

// ─── Shape of get_batch_summary_v1(...) ──────────────────────────────────────
type AmountCount = { amount?: number | string | null; count?: number | string | null };

export interface BatchSummary {
  header: {
    settlement_batch_id?: string | null;
    batch_id?: string | null;
    batch_number?: string | null;
    castles_batch_num?: string | null;
    acquirer?: string | null;
    business_date?: string | null;
    business_date_start?: string | null;
    business_date_end?: string | null;
    opened_at?: string | null;
    closed_at?: string | null;
    settlement_date?: string | null;
    funded_date?: string | null;
    status?: string | null;
    processor?: string | null;
    terminal_id?: string | null;
    terminal_name?: string | null;
    terminal_serial?: string | null;
    register_id?: string | null;
    transaction_count?: number | string | null;
  };
  sales: {
    credit_total?: number | string | null;
    cash_total?: number | string | null;
    gift_total?: number | string | null;
    house_total?: number | string | null;
    gross?: number | string | null;
  };
  refunds: { count?: number | string | null; amount?: number | string | null };
  net: {
    gross?: number | string | null;
    tips?: number | string | null;
    refunds?: number | string | null;
    net_deposit?: number | string | null;
  };
  // All-tender totals for the batch's business day. Cash lives ONLY here
  // (cash never carries a settlement batch), so it's the source of truth for
  // the cash line on the printed ticket.
  business_day?: {
    business_date?: string | null;
    cash_total?: number | string | null;
    cash_count?: number | string | null;
    card_total?: number | string | null;
    gift_total?: number | string | null;
    house_total?: number | string | null;
    gross?: number | string | null;
  } | null;
  card_brands?: Record<string, AmountCount> | null;
  entry_modes?: Record<string, AmountCount> | null;
  payment_methods?: Record<string, AmountCount> | null;
  counts: {
    approvals?: number | string | null;
    refunds?: number | string | null;
    voids?: number | string | null;
  };
  adjustments?: {
    voids_count?: number | string | null;
    voids_amount?: number | string | null;
    tip_total?: number | string | null;
    refunded_tip_total?: number | string | null;
    tip_adjustments_count?: number | string | null;
  } | null;
  fees?: {
    dual_pricing_fee?: number | string | null;
    refunded_dual_pricing_fee?: number | string | null;
    processor_fees?: number | string | null;
    interchange_fees?: number | string | null;
    assessment_fees?: number | string | null;
  } | null;
}

export interface RenderBatchSummaryOptions {
  /** Location display name (get_batch_summary_v1 doesn't include it). */
  locationName?: string | null;
  /** Merchant logo URL (organizations.imageURL). */
  merchantLogoUrl?: string | null;
}

// Printed-paper palette — mirrors receipt-template.ts.
const INK = "#171717";
const INK_SOFT = "#404040";
const MUTED = "#525252";
const FAINT = "#737373";
const HAIRLINE = "#e5e5e5";
const RULE_STRONG = "#d4d4d4";
const PAPER = "#ffffff";
const PAGE_BG = "#e5e5e5";
const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function num(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
}

function fmtMoney(v: unknown): string {
  return `$${num(v).toFixed(2)}`;
}

function fmtInt(v: unknown): string {
  return String(Math.trunc(num(v)));
}

function fmtDate(v?: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtDatetime(v?: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
}

function titleCase(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Human batch label, matching the dashboard (BatchesView / ManualBatchoutDialog):
 * prefer the host batch number with the acquirer prefix (e.g. "VALOR-7"); only
 * fall back to the internal batch_id surrogate (e.g. "LAZY-VALOR-…") when no host
 * number exists.
 */
function formatBatchLabel(h: BatchSummary["header"]): string {
  const number = h.batch_number ?? h.castles_batch_num ?? null;
  if (number != null && String(number).trim() !== "") {
    return h.acquirer ? `${h.acquirer}-${number}` : String(number);
  }
  return h.batch_id ? String(h.batch_id) : "—";
}

const CARD_BRAND_LABELS: Record<string, string> = {
  VISA: "Visa",
  MASTERCARD: "Mastercard",
  AMEX: "Amex",
  DISCOVER: "Discover",
  OTHER: "Other",
};

const ENTRY_MODE_LABELS: Record<string, string> = {
  chip: "Chip",
  contactless: "Contactless",
  swipe: "Swipe",
  manual: "Manual",
  fallback: "Fallback",
  other: "Other",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─── Render helpers (email-safe table rows) ──────────────────────────────────

function rule(strong = false): string {
  return `<tr><td colspan="2" style="padding:12px 0;"><div style="height:1px;line-height:1px;font-size:0;background:${
    strong ? RULE_STRONG : HAIRLINE
  };">&nbsp;</div></td></tr>`;
}

function lineRow(
  label: string,
  value: string,
  opts: { strong?: boolean; mono?: boolean } = {}
): string {
  const weight = opts.strong ? "600" : "400";
  const labelColor = opts.strong ? INK : MUTED;
  const valueColor = opts.strong ? INK : INK_SOFT;
  const mono = opts.mono
    ? "font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;letter-spacing:0.04em;"
    : "";
  return `
    <tr>
      <td style="padding:2px 0;font:${weight} 13px/1.5 ${FONT};color:${labelColor};">${escapeHtml(
        label
      )}</td>
      <td style="padding:2px 0;text-align:right;font:${weight} 13px/1.5 ${FONT};color:${valueColor};${mono}white-space:nowrap;">${escapeHtml(
        value
      )}</td>
    </tr>`;
}

function sectionHeading(label: string): string {
  return `<tr><td colspan="2" style="padding:4px 0 6px 0;font:700 11px/1.2 ${FONT};letter-spacing:0.12em;text-transform:uppercase;color:${FAINT};">${escapeHtml(
    label
  )}</td></tr>`;
}

/** Rows for a { key: { amount, count } } breakdown map, in a fixed order. */
function breakdownRows(
  map: Record<string, AmountCount> | null | undefined,
  labels: Record<string, string>,
  order: string[]
): string {
  if (!map) return "";
  const keys = [
    ...order.filter((k) => map[k]),
    ...Object.keys(map).filter((k) => !order.includes(k)),
  ];
  return keys
    .map((k) => {
      const row = map[k];
      const label = labels[k] ?? titleCase(k);
      return lineRow(
        `${label} (${fmtInt(row?.count)})`,
        fmtMoney(row?.amount)
      );
    })
    .join("");
}

/**
 * Branded HTML batch-out summary. Sections mirror the printed ticket:
 * header → net deposit → sales → refunds/tips → card brands → entry modes →
 * transaction counts → fees.
 */
export function renderBatchSummaryHtml(
  summary: BatchSummary,
  options: RenderBatchSummaryOptions = {}
): string {
  const h = summary.header ?? {};
  const businessName = options.locationName || "Batch-Out Summary";
  const batchDate =
    h.business_date_start && h.business_date_end
      ? `${fmtDate(h.business_date_start)} – ${fmtDate(h.business_date_end)}`
      : fmtDate(h.business_date);

  const logoBlock = options.merchantLogoUrl
    ? `<img src="${escapeHtml(options.merchantLogoUrl)}" alt="${escapeHtml(
        businessName
      )}" width="56" height="56" style="display:inline-block;width:56px;height:56px;object-fit:contain;border:0;outline:none;text-decoration:none;margin-bottom:10px;">`
    : "";

  // ── Header meta rows ──
  const headerRows = [
    lineRow("Business date", batchDate, { strong: true }),
    lineRow("Batch", formatBatchLabel(h), { mono: true }),
    h.acquirer ? lineRow("Acquirer", String(h.acquirer)) : "",
    h.processor ? lineRow("Processor", titleCase(String(h.processor))) : "",
    h.terminal_name ? lineRow("Terminal", String(h.terminal_name)) : "",
    h.register_id ? lineRow("Register", String(h.register_id)) : "",
    h.status ? lineRow("Status", titleCase(String(h.status))) : "",
    lineRow("Opened", fmtDatetime(h.opened_at)),
    lineRow("Closed", fmtDatetime(h.closed_at)),
    h.settlement_date
      ? lineRow("Settlement date", fmtDate(h.settlement_date))
      : "",
    h.funded_date ? lineRow("Funded date", fmtDate(h.funded_date)) : "",
    lineRow("Transactions", fmtInt(h.transaction_count)),
  ].join("");

  // ── Sales (card settlement) ──
  // Cash/gift/house are settlement-batch scoped and are always $0 here — cash
  // never carries a settlement batch. The real tender split lives in the
  // Business Day block below, so this section stays card-settlement only.
  const s = summary.sales ?? {};
  const salesRows = [
    lineRow("Credit / card", fmtMoney(s.credit_total)),
    lineRow("Gross sales", fmtMoney(s.gross), { strong: true }),
  ].join("");

  // ── Business day (all tenders for the day, incl. cash) ──
  const bd = summary.business_day ?? null;
  const businessDayRows = bd
    ? [
        lineRow(`Cash (${fmtInt(bd.cash_count)})`, fmtMoney(bd.cash_total)),
        lineRow("Card", fmtMoney(bd.card_total)),
        num(bd.gift_total) !== 0 ? lineRow("Gift", fmtMoney(bd.gift_total)) : "",
        num(bd.house_total) !== 0
          ? lineRow("House account", fmtMoney(bd.house_total))
          : "",
        lineRow("Gross (all tenders)", fmtMoney(bd.gross), { strong: true }),
      ].join("")
    : "";

  // ── Refunds / tips ──
  const tips = num(summary.net?.tips ?? summary.adjustments?.tip_total);
  const refundTipRows = [
    lineRow(
      `Refunds (${fmtInt(summary.refunds?.count)})`,
      `−${fmtMoney(summary.refunds?.amount)}`
    ),
    lineRow("Tips", fmtMoney(tips)),
  ].join("");

  // ── Card brands / entry modes ──
  const brandRows = breakdownRows(summary.card_brands, CARD_BRAND_LABELS, [
    "VISA",
    "MASTERCARD",
    "AMEX",
    "DISCOVER",
    "OTHER",
  ]);
  const modeRows = breakdownRows(summary.entry_modes, ENTRY_MODE_LABELS, [
    "chip",
    "contactless",
    "swipe",
    "manual",
    "fallback",
    "other",
  ]);

  // ── Counts ──
  const c = summary.counts ?? {};
  const countRows = [
    lineRow("Approvals", fmtInt(c.approvals)),
    lineRow("Refunds", fmtInt(c.refunds)),
    lineRow("Voids", fmtInt(c.voids)),
  ].join("");

  // ── Fees (only if any is non-zero) ──
  const f = summary.fees ?? {};
  const feeEntries: Array<[string, unknown]> = [
    ["Dual-pricing fee", f.dual_pricing_fee],
    ["Processor fees", f.processor_fees],
    ["Interchange fees", f.interchange_fees],
    ["Assessment fees", f.assessment_fees],
  ];
  const anyFees = feeEntries.some(([, v]) => num(v) !== 0);
  const feeRows = anyFees
    ? feeEntries
        .filter(([, v]) => v != null && num(v) !== 0)
        .map(([label, v]) => lineRow(label, fmtMoney(v)))
        .join("")
    : "";

  const netDeposit = summary.net?.net_deposit;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="format-detection" content="telephone=no,address=no,email=no">
<title>Batch-Out Summary · ${escapeHtml(businessName)}</title>
</head>
<body style="margin:0;padding:0;background:${PAGE_BG};-webkit-font-smoothing:antialiased;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAGE_BG};">
  <tr>
    <td align="center" style="padding:28px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:420px;background:${PAPER};box-shadow:0 6px 24px rgba(0,0,0,0.10);">
        <tr>
          <td style="padding:30px 28px 28px 28px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <!-- Header -->
              <tr><td colspan="2" style="text-align:center;">
                ${logoBlock}
                <div style="font:700 17px/1.25 ${FONT};text-transform:uppercase;letter-spacing:0.03em;color:${INK};">${escapeHtml(
                  businessName
                )}</div>
                <div style="margin-top:4px;font:600 12px/1.4 ${FONT};letter-spacing:0.12em;text-transform:uppercase;color:${FAINT};">Batch-Out Summary</div>
              </td></tr>
              ${rule()}
              ${headerRows}
              ${rule(true)}
              <!-- Net deposit hero -->
              <tr>
                <td style="padding:6px 0;font:700 15px/1.2 ${FONT};text-transform:uppercase;letter-spacing:0.03em;color:${INK};">Net deposit</td>
                <td style="padding:6px 0;text-align:right;font:700 18px/1.2 ${FONT};color:${INK};white-space:nowrap;">${
                  netDeposit == null ? "—" : fmtMoney(netDeposit)
                }</td>
              </tr>
              ${rule()}
              ${sectionHeading("Sales")}
              ${salesRows}
              ${
                businessDayRows
                  ? `${rule()}${sectionHeading("Business Day · All Tenders")}${businessDayRows}`
                  : ""
              }
              ${rule()}
              ${sectionHeading("Refunds & Tips")}
              ${refundTipRows}
              ${
                brandRows
                  ? `${rule()}${sectionHeading("Card Brands")}${brandRows}`
                  : ""
              }
              ${
                modeRows
                  ? `${rule()}${sectionHeading("Entry Modes")}${modeRows}`
                  : ""
              }
              ${rule()}
              ${sectionHeading("Transaction Counts")}
              ${countRows}
              ${feeRows ? `${rule()}${sectionHeading("Fees")}${feeRows}` : ""}
              ${rule()}
              <!-- Footer -->
              <tr><td colspan="2" style="text-align:center;">
                <div style="font:400 12px/1.4 ${FONT};color:${FAINT};">This summary matches the printed batch-out ticket.</div>
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
