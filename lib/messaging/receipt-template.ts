type ReceiptOrder = {
  display_number?: string | null;
  order_number?: string | null;
  created_at: string;
  order_type?: string | null;
  table_number?: string | number | null;
  customer_name?: string | null;
  subtotal?: number | string | null;
  tax_amount?: number | string | null;
  discount_amount?: number | string | null;
  service_charge?: number | string | null;
  tip_amount?: number | string | null;
  total_amount?: number | string | null;
  special_instructions?: string | null;
  order_items?: ReceiptItem[] | null;
  order_payments?: ReceiptPayment[] | null;
};

type ReceiptItem = {
  item_name?: string | null;
  quantity?: number | null;
  subtotal?: number | string | null;
  is_voided?: boolean | null;
  order_item_modifiers?: ReceiptModifier[] | null;
};

type ReceiptModifier = {
  modifier_name?: string | null;
  quantity?: number | null;
  price_modifier?: number | string | null;
};

type ReceiptPayment = {
  payment_method?: string | null;
  status?: string | null;
  total_amount?: number | string | null;
  card_last_four?: string | null;
  card_type?: string | null;
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

const ACCENT = "#0f172a";
const MUTED = "#64748b";
const HAIRLINE = "#e2e8f0";
const SURFACE = "#f8fafc";
const CARD_BG = "#ffffff";
const PAGE_BG = "#f1f5f9";

function num(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
}

function fmtMoney(v: unknown): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(num(v));
}

function fmtDate(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }),
    time: d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    }),
  };
}

function fmtOrderType(t?: string | null): string {
  if (!t) return "";
  return t
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
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
}

/**
 * Modern, clean HTML receipt. Email-client-safe (table layout, inline styles,
 * graceful degradation in Outlook for border-radius).
 */
export function renderReceiptHtml(
  order: ReceiptOrder,
  location: ReceiptLocation | null,
  options: RenderReceiptOptions = {}
): string {
  const items = order.order_items ?? [];
  const payments = (order.order_payments ?? []).filter((p) => {
    const s = (p.status ?? "").toLowerCase();
    return s === "captured" || s === "paid";
  });

  const { date, time } = fmtDate(order.created_at);
  const orderNumber = order.display_number || order.order_number || "—";

  const businessName = location?.name || "Receipt";
  const addressParts = [
    location?.address_line1,
    location?.address_line2,
    [location?.city, location?.state].filter(Boolean).join(", "),
    location?.postal_code,
  ].filter(Boolean);
  const address = addressParts.join(" · ");

  const orderTypeLabel = fmtOrderType(order.order_type);
  const tablePart = order.table_number ? `Table ${order.table_number}` : "";
  const metaLine = [
    `${date} · ${time}`,
    [orderTypeLabel, tablePart].filter(Boolean).join(" · "),
  ]
    .filter(Boolean)
    .join("<br>");

  const itemsHtml = items
    .map((item) => {
      const qty = item.quantity ?? 1;
      const name = escapeHtml(item.item_name ?? "Item");
      const lineTotal = fmtMoney(item.subtotal);
      const voided = item.is_voided ? "text-decoration:line-through;color:#94a3b8;" : "";
      const mods = (item.order_item_modifiers ?? [])
        .map((m) => {
          const mName = escapeHtml(m.modifier_name ?? "");
          const mQty = m.quantity && m.quantity > 1 ? ` ×${m.quantity}` : "";
          const mPrice = num(m.price_modifier) * (m.quantity ?? 1);
          const priceLabel = mPrice > 0 ? `<span style="color:${MUTED};">+ ${fmtMoney(mPrice)}</span>` : "";
          return `
            <tr>
              <td style="padding:0 0 4px 16px;font:400 13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${MUTED};">${mName}${mQty}</td>
              <td style="padding:0 0 4px 0;text-align:right;font:400 13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">${priceLabel}</td>
            </tr>`;
        })
        .join("");
      return `
        <tr>
          <td style="padding:10px 0 ${mods ? "4" : "10"}px 0;font:500 15px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${ACCENT};${voided}">
            <span style="display:inline-block;min-width:28px;color:${MUTED};font-weight:400;">${qty}×</span>${name}
          </td>
          <td style="padding:10px 0 ${mods ? "4" : "10"}px 0;text-align:right;font:500 15px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${ACCENT};${voided}">${lineTotal}</td>
        </tr>
        ${mods}
      `;
    })
    .join("");

  const subtotal = num(order.subtotal);
  const tax = num(order.tax_amount);
  const discount = num(order.discount_amount);
  const service = num(order.service_charge);
  const tip = num(order.tip_amount);
  const total = num(order.total_amount);

  const totalsRow = (label: string, amount: number, opts?: { negative?: boolean }) => `
    <tr>
      <td style="padding:6px 0;font:400 14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${MUTED};">${label}</td>
      <td style="padding:6px 0;text-align:right;font:500 14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${opts?.negative ? "#16a34a" : ACCENT};">${opts?.negative ? "−" : ""}${fmtMoney(Math.abs(amount))}</td>
    </tr>`;

  const totalsHtml = [
    totalsRow("Subtotal", subtotal),
    discount > 0 ? totalsRow("Discount", discount, { negative: true }) : "",
    service > 0 ? totalsRow("Service charge", service) : "",
    tax > 0 ? totalsRow("Tax", tax) : "",
    tip > 0 ? totalsRow("Tip", tip) : "",
  ].join("");

  const paymentsHtml = payments
    .map((p) => {
      const display = paymentDisplay(p, { dotChar: "····" });
      return `
        <tr>
          <td style="padding:4px 0;font:500 13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${ACCENT};">${escapeHtml(display)}</td>
          <td style="padding:4px 0;text-align:right;font:500 13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${ACCENT};">${fmtMoney(p.total_amount)}</td>
        </tr>`;
    })
    .join("");

  const customerLine = order.customer_name
    ? `<div style="margin-bottom:6px;font:500 16px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${ACCENT};">Thank you, ${escapeHtml(order.customer_name)}</div>`
    : `<div style="margin-bottom:6px;font:500 16px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${ACCENT};">Thank you</div>`;

  const specialHtml = order.special_instructions
    ? `<div style="margin-top:16px;padding:12px 16px;border-radius:12px;background:${SURFACE};font:400 13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${MUTED};"><strong style="color:${ACCENT};font-weight:500;">Note:</strong> ${escapeHtml(order.special_instructions)}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Receipt · Order ${escapeHtml(String(orderNumber))}</title>
</head>
<body style="margin:0;padding:0;background:${PAGE_BG};-webkit-font-smoothing:antialiased;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAGE_BG};">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background:${CARD_BG};border-radius:24px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.06);">
        <tr>
          <td style="padding:32px 32px 8px 32px;text-align:center;">
            ${options.merchantLogoUrl ? `<img src="${escapeHtml(options.merchantLogoUrl)}" alt="${escapeHtml(businessName)}" width="64" height="64" style="display:inline-block;width:64px;height:64px;border-radius:16px;object-fit:cover;border:0;outline:none;text-decoration:none;margin-bottom:12px;">` : ""}
            <div style="font:600 22px/1.3 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${ACCENT};letter-spacing:-0.01em;">${escapeHtml(businessName)}</div>
            ${address ? `<div style="margin-top:6px;font:400 13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${MUTED};">${escapeHtml(address)}</div>` : ""}
            ${location?.phone ? `<div style="margin-top:2px;font:400 13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${MUTED};">${escapeHtml(location.phone)}</div>` : ""}
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px 0 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${SURFACE};border-radius:16px;">
              <tr>
                <td style="padding:18px 20px;text-align:center;">
                  <div style="font:600 13px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${MUTED};letter-spacing:0.08em;text-transform:uppercase;">Order</div>
                  <div style="margin-top:4px;font:600 24px/1.2 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${ACCENT};letter-spacing:-0.02em;">#${escapeHtml(String(orderNumber))}</div>
                  <div style="margin-top:10px;font:400 13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${MUTED};">${metaLine}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px 0 32px;">
            <div style="font:600 11px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${MUTED};letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px;">Items</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              ${itemsHtml || `<tr><td style="padding:8px 0;color:${MUTED};font:400 14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">No items</td></tr>`}
            </table>
            ${specialHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px 0 32px;">
            <div style="height:1px;background:${HAIRLINE};"></div>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px 0 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              ${totalsHtml}
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 32px 0 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${ACCENT};border-radius:14px;">
              <tr>
                <td style="padding:16px 20px;font:600 14px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#ffffff;letter-spacing:0.02em;">Total</td>
                <td style="padding:16px 20px;text-align:right;font:600 18px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#ffffff;letter-spacing:-0.01em;">${fmtMoney(total)}</td>
              </tr>
            </table>
          </td>
        </tr>
        ${paymentsHtml ? `
        <tr>
          <td style="padding:20px 32px 0 32px;">
            <div style="font:600 11px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${MUTED};letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px;">Paid</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              ${paymentsHtml}
            </table>
          </td>
        </tr>` : ""}
        <tr>
          <td style="padding:28px 32px 32px 32px;text-align:center;">
            ${customerLine}
            <div style="font:400 13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${MUTED};">We hope to see you again soon.</div>
          </td>
        </tr>
      </table>
      <div style="margin-top:16px;font:400 11px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${MUTED};">
        Receipt sent by ${escapeHtml(businessName)}
      </div>
      <div style="margin-top:8px;font:500 11px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${MUTED};letter-spacing:0.04em;">
        Powered by <span style="color:${ACCENT};font-weight:600;">Dexa POS</span>
      </div>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/**
 * SMS receipt — ASCII-safe (GSM-7) so a typical 3-item order stays within
 * 1–2 SMS segments (160 chars each). Long itemized orders may span 3+
 * segments; that's accepted as the cost of including line items.
 */
export function renderReceiptText(
  order: ReceiptOrder,
  location: ReceiptLocation | null
): string {
  const orderNumber = order.display_number || order.order_number || "-";
  const businessName = location?.name || "Receipt";
  const total = fmtMoney(order.total_amount);
  const { date } = fmtDate(order.created_at);
  const shortDate = date.replace(/, \d{4}$/, "");

  const SMS_MAX_ITEMS = 5;
  const items = (order.order_items ?? []).filter((i) => !i.is_voided);
  const shown = items.slice(0, SMS_MAX_ITEMS);
  const remaining = items.length - shown.length;
  const itemLines = shown.map((i) => {
    const qty = i.quantity ?? 1;
    const name = (i.item_name ?? "Item").trim();
    const price = fmtMoney(i.subtotal);
    const qtyPrefix = qty > 1 ? `${qty}x ` : "";
    return `- ${qtyPrefix}${name} ${price}`;
  });
  if (remaining > 0) {
    itemLines.push(`...and ${remaining} more`);
  }

  const payments = (order.order_payments ?? []).filter((p) => {
    const s = (p.status ?? "").toLowerCase();
    return s === "captured" || s === "paid";
  });
  const primary = payments[0];
  const paidLine = primary ? paymentDisplay(primary, { dotChar: "****" }) : "";

  const lines = [
    businessName,
    `Order #${orderNumber} - ${shortDate}`,
    ...itemLines,
    `Total: ${total}`,
    paidLine ? `Paid: ${paidLine}` : "",
    "Thank you!",
  ].filter(Boolean);

  return lines.join("\n");
}
