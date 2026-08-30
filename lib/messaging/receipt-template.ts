import { getOrderBreakdown, type BreakdownOrderInput } from "@/lib/orders/order-breakdown";
import type { OrderPayment } from "@/types/order-management";

type ReceiptOrder = {
  display_number?: string | null;
  order_number?: string | null;
  created_at: string;
  order_type?: string | null;
  table_number?: string | number | null;
  customer_name?: string | null;
  status?: string | null;
  payment_status?: string | null;
  voided_at?: string | null;
  void_reason?: string | null;
  subtotal?: number | string | null;
  tax_amount?: number | string | null;
  discount_amount?: number | string | null;
  service_charge?: number | string | null;
  tip_amount?: number | string | null;
  total_amount?: number | string | null;
  amount_paid?: number | string | null;
  amount_due?: number | string | null;
  effective_subtotal?: number | string | null;
  effective_tax_amount?: number | string | null;
  effective_total?: number | string | null;
  payment_pricing_mode?: string | null;
  // Per-lane columns (present in the orders row; required to resolve the
  // charged lane so cash-order receipts foot — never pair effective_* w/ cash_total).
  card_subtotal?: number | string | null;
  card_tax_amount?: number | string | null;
  cash_subtotal?: number | string | null;
  cash_tax_amount?: number | string | null;
  cash_total?: number | string | null;
  card_total?: number | string | null;
  special_instructions?: string | null;
  order_items?: ReceiptItem[] | null;
  order_payments?: ReceiptPayment[] | null;
};

type ReceiptItem = {
  item_name?: string | null;
  quantity?: number | null;
  unit_price?: number | string | null;
  subtotal?: number | string | null;
  is_voided?: boolean | null;
  order_item_modifiers?: ReceiptModifier[] | null;
};

type ReceiptModifier = {
  modifier_group_name?: string | null;
  modifier_name?: string | null;
  quantity?: number | null;
  price_modifier?: number | string | null;
  is_no?: boolean | null;
};

type ReceiptPayment = {
  payment_method?: string | null;
  status?: string | null;
  amount?: number | string | null;
  total_amount?: number | string | null;
  tip_amount?: number | string | null;
  refunded_amount?: number | string | null;
  refunded_at?: string | null;
  card_last_four?: string | null;
  card_type?: string | null;
  terminal_type?: string | null;
  authorization_code?: string | null;
};

type ReceiptLocation = {
  name?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  phone?: string | null;
};

// Printed-paper palette — mirrors the hosted page (app/receipts/[t1]/[t2]).
const INK = "#171717"; // neutral-900
const INK_SOFT = "#404040"; // neutral-700
const MUTED = "#525252"; // neutral-600
const FAINT = "#737373"; // neutral-500
const HAIRLINE = "#e5e5e5"; // neutral-200
const RULE_STRONG = "#d4d4d4"; // neutral-300
const PAPER = "#ffffff";
const PAGE_BG = "#e5e5e5"; // neutral-200
const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function num(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
}

function fmtMoney(v: unknown): string {
  return `$${num(v).toFixed(2)}`;
}

function fmtDatetime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
}

const CARD_BRAND_LABELS: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  master_card: "Mastercard",
  amex: "Amex",
  american_express: "Amex",
  discover: "Discover",
  diners: "Diners Club",
  diners_club: "Diners Club",
  jcb: "JCB",
  unionpay: "UnionPay",
  union_pay: "UnionPay",
};

function cardBrandLabel(cardType?: string | null): string | null {
  if (!cardType) return null;
  const key = cardType.trim().toLowerCase();
  if (CARD_BRAND_LABELS[key]) return CARD_BRAND_LABELS[key];
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function paymentLabel(method?: string | null): string {
  const m = (method ?? "").toLowerCase();
  if (m.startsWith("card_")) return "Card";
  if (m === "cash") return "Cash";
  if (m === "gift_card") return "Gift Card";
  if (m === "house_account") return "House Account";
  if (m === "external") return "External";
  return method ? method.replace(/_/g, " ") : "Payment";
}

/** "{Brand} ····1234" for cards, or just the method label for cash etc. */
function paymentDisplay(p: ReceiptPayment, opts: { dotChar: string }): string {
  const brand = cardBrandLabel(p.card_type);
  const isCard = (p.payment_method ?? "").toLowerCase().startsWith("card_");
  const head = isCard ? brand ?? "Card" : paymentLabel(p.payment_method);
  return p.card_last_four ? `${head} ${opts.dotChar}${p.card_last_four}` : head;
}

const TERMINAL_LABELS: Record<string, string | null> = {
  dejavoo_spinapi: "Dejavoo SpinAPI",
  dejavoo_p18: "Dejavoo P18",
  dejavoo: "Dejavoo",
  castles: "Castles",
  manual: "Manual Entry",
  cash_drawer: "Cash Drawer",
  none: null,
};

function fmtTerminalType(t?: string | null): string | null {
  if (!t) return null;
  if (t in TERMINAL_LABELS) return TERMINAL_LABELS[t];
  return t;
}

function txnType(status?: string | null): string {
  if (status === "refunded" || status === "partially_refunded") return "Refund";
  if (status === "voided") return "Void";
  return "Sale";
}

function authLabel(status?: string | null): string {
  if (status === "captured" || status === "paid") return "Approved";
  if (status === "refunded" || status === "partially_refunded") return "Refunded";
  if (status === "voided") return "Voided";
  return status ?? "—";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface RenderReceiptOptions {
  /** Merchant logo URL (organizations.imageURL). Rendered above business name. */
  merchantLogoUrl?: string | null;
  /**
   * Hosted receipt URL (/receipts/{t1}/{t2}). When present, a "View receipt
   * online" button is rendered so the email and the hosted SMS receipt point
   * at the same page.
   */
  receiptUrl?: string | null;
}

// ─── Render helpers (email-safe table rows) ──────────────────────────────────

function rule(strong = false): string {
  return `<tr><td style="padding:14px 0;"><div style="height:1px;line-height:1px;font-size:0;background:${
    strong ? RULE_STRONG : HAIRLINE
  };">&nbsp;</div></td></tr>`;
}

/** Label/value row matching the hosted page's <Line> component. */
function lineRow(
  label: string,
  value: string,
  opts: { strong?: boolean; mono?: boolean } = {}
): string {
  const weight = opts.strong ? "600" : "400";
  const labelColor = opts.strong ? INK : MUTED;
  const valueColor = opts.strong ? INK : INK_SOFT;
  const mono = opts.mono
    ? "font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;letter-spacing:0.06em;"
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

/**
 * Branded HTML receipt — visually matches the hosted public receipt page
 * (app/receipts/[t1]/[t2]). Email-client-safe: table layout, inline styles,
 * no flex/grid, graceful in Outlook + Gmail.
 */
export function renderReceiptHtml(
  order: ReceiptOrder,
  location: ReceiptLocation | null,
  options: RenderReceiptOptions = {}
): string {
  const allItems = order.order_items ?? [];
  const items = allItems.filter((i) => !i.is_voided);
  const payments = (order.order_payments ?? []).filter((p) => {
    const s = (p.status ?? "").toLowerCase();
    return (
      s === "captured" ||
      s === "paid" ||
      s === "refunded" ||
      s === "partially_refunded"
    );
  });

  const orderNumber = order.display_number
    ? order.display_number
    : order.order_number
    ? `#${order.order_number}`
    : "—";

  const businessName = location?.name || "Receipt";
  const isVoided = !!order.voided_at;
  const isRefunded = (order.payment_status ?? "").toLowerCase() === "refunded";

  // Totals — single pricing track so the breakdown always foots. The lane the
  // order was charged on drives every line; `effective_*` is a card alias and
  // pairing it with `cash_total` is exactly the cash-order mismatch we fix here.
  const breakdown = getOrderBreakdown(
    order as BreakdownOrderInput,
    payments as unknown as OrderPayment[]
  );
  const lane = breakdown.primary;
  const subtotal = lane.subtotal;
  const tax = lane.tax;
  const discount = lane.discount;
  const service = lane.serviceCharge;
  const tip = lane.tip;
  // Split-tender orders show the list ladder bridged by the cash discount down
  // to what was collected; pure lanes already bake the discount into the total.
  const cashDiscount = breakdown.mixedCashDiscount;
  const chargedTotal =
    breakdown.isMixed && lane.amountPaid > 0 ? lane.amountPaid : lane.total + tip;

  // ── Banner ──
  const banner =
    isVoided || isRefunded
      ? `
      <tr><td style="padding:0 0 18px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${INK};">
          <tr><td style="padding:8px;text-align:center;">
            <div style="font:700 12px/1.2 ${FONT};letter-spacing:0.2em;text-transform:uppercase;color:${INK};">${
              isVoided ? "Voided" : "Refunded"
            }</div>
            ${
              isVoided && order.void_reason
                ? `<div style="margin-top:2px;font:400 11px/1.4 ${FONT};color:${FAINT};">${escapeHtml(
                    order.void_reason
                  )}</div>`
                : ""
            }
          </td></tr>
        </table>
      </td></tr>`
      : "";

  // ── Header ──
  const addressBlock = location?.address_line1
    ? `<div style="margin-top:6px;font:400 13px/1.55 ${FONT};color:${MUTED};">${escapeHtml(
        location.address_line1
      )}${
        location.address_line2
          ? `<br>${escapeHtml(location.address_line2)}`
          : ""
      }<br>${escapeHtml(
        [
          location.city ? `${location.city},` : "",
          location.state ?? "",
          location.postal_code ?? "",
        ]
          .filter(Boolean)
          .join(" ")
      )}</div>`
    : "";
  const phoneBlock = location?.phone
    ? `<div style="margin-top:4px;font:400 13px/1.5 ${FONT};color:${MUTED};">${escapeHtml(
        location.phone
      )}</div>`
    : "";
  const logoBlock = options.merchantLogoUrl
    ? `<img src="${escapeHtml(
        options.merchantLogoUrl
      )}" alt="${escapeHtml(
        businessName
      )}" height="120" style="display:inline-block;height:120px;width:auto;max-width:70%;object-fit:contain;border:0;outline:none;text-decoration:none;margin-bottom:10px;">`
    : "";

  // ── Items ──
  const itemsHtml = items
    .map((item) => {
      const qty = item.quantity ?? 1;
      const name = escapeHtml(item.item_name ?? "Item");
      const lineTotal = fmtMoney(item.subtotal);
      const mods = (item.order_item_modifiers ?? [])
        .filter((m) => !m.is_no && m.modifier_name)
        .map((m) => {
          const mName = escapeHtml(m.modifier_name ?? "");
          const mPrice = num(m.price_modifier);
          const priceLabel =
            mPrice > 0
              ? `<span style="color:${FAINT};white-space:nowrap;">+${fmtMoney(
                  mPrice
                )}</span>`
              : "";
          return `
            <tr>
              <td style="padding:2px 0 0 20px;font:400 12px/1.5 ${FONT};color:${FAINT};">${mName}</td>
              <td style="padding:2px 0 0 0;text-align:right;font:400 12px/1.5 ${FONT};">${priceLabel}</td>
            </tr>`;
        })
        .join("");
      return `
        <tr>
          <td style="padding:8px 0 0 0;font:400 14px/1.4 ${FONT};color:${INK};">
            <span style="color:${INK};">${qty}</span>&nbsp;&nbsp;${name}
          </td>
          <td style="padding:8px 0 0 0;text-align:right;font:400 14px/1.4 ${FONT};color:${INK};white-space:nowrap;">${lineTotal}</td>
        </tr>
        ${mods}`;
    })
    .join("");

  // ── Totals ──
  const totalsHtml = [
    order.subtotal != null ? lineRow("Subtotal", fmtMoney(subtotal)) : "",
    discount > 0 ? lineRow("Discount", `−${fmtMoney(discount)}`) : "",
    service > 0 ? lineRow("Service Charge", fmtMoney(service)) : "",
    order.tax_amount != null ? lineRow("Tax", fmtMoney(tax)) : "",
    tip > 0 ? lineRow("Tip", fmtMoney(tip)) : "",
    cashDiscount > 0 ? lineRow("Cash Discount", `−${fmtMoney(cashDiscount)}`) : "",
  ].join("");

  // ── Payments ──
  const paymentsHtml = payments
    .map((p) => {
      const isCash = (p.payment_method ?? "").toLowerCase() === "cash";
      const brand = paymentDisplay(p, { dotChar: "····" });
      const amount = fmtMoney(p.total_amount ?? p.amount);
      const terminalLabel = fmtTerminalType(p.terminal_type);
      const refunded = num(p.refunded_amount);
      const detailRows = isCash
        ? ""
        : [
            terminalLabel ? lineRow("Terminal", terminalLabel) : "",
            lineRow("Transaction Type", txnType(p.status)),
            lineRow("Authorization", authLabel(p.status)),
            p.authorization_code
              ? lineRow("Approval Code", p.authorization_code, { mono: true })
              : "",
          ].join("");
      const refundRow =
        refunded > 0 ? lineRow("Refunded", `−${fmtMoney(refunded)}`) : "";
      return `
        ${lineRow(brand, amount, { strong: true })}
        ${detailRows}
        ${refundRow}
        <tr><td colspan="2" style="padding:6px 0 0 0;"></td></tr>`;
    })
    .join("");

  // ── CTA ──
  const ctaHtml = options.receiptUrl
    ? `
    <tr><td style="padding:6px 0 0 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr><td align="center" style="padding:0;">
          <a href="${escapeHtml(
            options.receiptUrl
          )}" target="_blank" style="display:inline-block;padding:11px 22px;background:${INK};color:#ffffff;font:600 13px/1 ${FONT};text-decoration:none;letter-spacing:0.02em;">View receipt online</a>
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
<title>Receipt · Order ${escapeHtml(String(orderNumber))}</title>
</head>
<body style="margin:0;padding:0;background:${PAGE_BG};-webkit-font-smoothing:antialiased;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAGE_BG};">
  <tr>
    <td align="center" style="padding:28px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:380px;background:${PAPER};box-shadow:0 6px 24px rgba(0,0,0,0.10);">
        <tr>
          <td style="padding:30px 28px 28px 28px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              ${banner}
              <!-- Header -->
              <tr><td style="text-align:center;">
                ${logoBlock}
                <div style="font:700 17px/1.25 ${FONT};text-transform:uppercase;letter-spacing:0.03em;color:${INK};">${escapeHtml(
                  businessName
                )}</div>
                ${addressBlock}
                ${phoneBlock}
              </td></tr>
              ${rule()}
              <!-- Order meta -->
              <tr><td>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  ${lineRow("Order", String(orderNumber), { strong: true })}
                  ${
                    order.table_number != null && String(order.table_number).trim() !== ""
                      ? lineRow("Table", escapeHtml(String(order.table_number)), { strong: true })
                      : ""
                  }
                  ${lineRow("Ordered", fmtDatetime(order.created_at))}
                </table>
              </td></tr>
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
                    <td style="padding:10px 0 0 0;font:700 15px/1.2 ${FONT};text-transform:uppercase;letter-spacing:0.03em;color:${INK};">Total</td>
                    <td style="padding:10px 0 0 0;text-align:right;font:700 15px/1.2 ${FONT};color:${INK};white-space:nowrap;">${fmtMoney(
                      chargedTotal
                    )}</td>
                  </tr>
                </table>
              </td></tr>
              ${
                paymentsHtml
                  ? `${rule()}
              <tr><td>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  ${paymentsHtml}
                </table>
              </td></tr>`
                  : ""
              }
              ${rule()}
              <!-- Footer -->
              <tr><td style="text-align:center;">
                <div style="font:500 13px/1.4 ${FONT};color:${INK};">Thank you for your order!</div>
                <div style="margin-top:2px;font:400 12px/1.4 ${FONT};color:${FAINT};">We appreciate your business.</div>
              </td></tr>
              ${ctaHtml}
            </table>
          </td>
        </tr>
      </table>
      <div style="margin-top:14px;font:400 11px/1.5 ${FONT};color:${FAINT};">
        Powered by <span style="color:${INK_SOFT};font-weight:700;">Dexa POS</span> · Digital Receipts
      </div>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/**
 * SMS receipt — single branded line with a hosted receipt link.
 * Short enough to reliably fit in 1 SMS segment and avoid carrier spam flags.
 *
 * Amount shown = sum of payment net amounts (total_amount − refunded_amount)
 * across captured/paid/(partially_)refunded rows. order.total_amount is the
 * bill, which can diverge from collected when there are discounts, comps,
 * cash-priced surcharges, or partial payments. Primary tender = the row with
 * the largest net amount, so the dominant tender wins when a card pre-auth
 * and a cash settlement both sit on the same order.
 */
export function renderReceiptText(
  order: ReceiptOrder,
  location: ReceiptLocation | null,
  receiptUrl: string
): string {
  // display_number already contains the leading '#' (e.g. "#S1-0003").
  // order_number is the raw internal ref — prefix '#' only in that fallback.
  const rawNumber = order.display_number || order.order_number;
  const orderNumber = rawNumber
    ? order.display_number
      ? rawNumber
      : `#${rawNumber}`
    : "-";

  const businessName = location?.name || "Receipt";

  const settled = (order.order_payments ?? [])
    .filter((p) => {
      const s = (p.status ?? "").toLowerCase();
      return (
        s === "captured" ||
        s === "paid" ||
        s === "refunded" ||
        s === "partially_refunded"
      );
    })
    .map((p) => ({ p, net: num(p.total_amount) - num(p.refunded_amount) }))
    .filter((x) => x.net > 0);

  const collected = settled.reduce((s, x) => s + x.net, 0);
  const total = fmtMoney(collected > 0 ? collected : order.total_amount);

  const primary = settled.slice().sort((a, b) => b.net - a.net)[0]?.p;
  const paidLine = primary ? paymentDisplay(primary, { dotChar: "****" }) : "";

  const summary = paidLine ? `${total}, ${paidLine}` : total;
  return `${businessName} — Order ${orderNumber} (${summary}). View receipt: ${receiptUrl}`;
}
