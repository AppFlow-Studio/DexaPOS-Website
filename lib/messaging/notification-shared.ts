const ACCENT = "#0f172a";
const MUTED = "#64748b";
const HAIRLINE = "#e2e8f0";
const SURFACE = "#f8fafc";
const CARD_BG = "#ffffff";
const PAGE_BG = "#f1f5f9";

export const COLORS = { ACCENT, MUTED, HAIRLINE, SURFACE, CARD_BG, PAGE_BG };

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface BrandedEmailContext {
  businessName: string;
  logoUrl?: string | null;
  address?: string | null;
  phone?: string | null;
}

/**
 * Wraps a body fragment with the standard Dexa receipt-style email shell:
 * outer card with rounded corners, optional logo + business name header,
 * and "Powered by Dexa POS" footer.
 *
 * `bodyHtml` is the inner content that goes between the header and footer.
 * It should not include its own header/footer chrome.
 */
export function renderBrandedEmail(
  ctx: BrandedEmailContext,
  bodyHtml: string,
  options: { previewText?: string; subjectFallback?: string } = {}
): string {
  const previewText = options.previewText ?? "";
  const title = options.subjectFallback ?? "Notification";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:${PAGE_BG};-webkit-font-smoothing:antialiased;">
${previewText ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(previewText)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAGE_BG};">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background:${CARD_BG};border-radius:24px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.06);">
        <tr>
          <td style="padding:32px 32px 8px 32px;text-align:center;">
            ${ctx.logoUrl ? `<img src="${escapeHtml(ctx.logoUrl)}" alt="${escapeHtml(ctx.businessName)}" width="64" height="64" style="display:inline-block;width:64px;height:64px;border-radius:16px;object-fit:cover;border:0;outline:none;text-decoration:none;margin-bottom:12px;">` : ""}
            <div style="font:600 22px/1.3 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${ACCENT};letter-spacing:-0.01em;">${escapeHtml(ctx.businessName)}</div>
            ${ctx.address ? `<div style="margin-top:6px;font:400 13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${MUTED};">${escapeHtml(ctx.address)}</div>` : ""}
            ${ctx.phone ? `<div style="margin-top:2px;font:400 13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${MUTED};">${escapeHtml(ctx.phone)}</div>` : ""}
          </td>
        </tr>
        <tr>
          <td style="padding:8px 32px 0 32px;">
            ${bodyHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px 32px 32px;text-align:center;">
            <div style="height:1px;background:${HAIRLINE};margin-bottom:16px;"></div>
            <div style="font:400 11px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${MUTED};">
              Sent by ${escapeHtml(ctx.businessName)}
            </div>
            <div style="margin-top:8px;font:500 11px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${MUTED};letter-spacing:0.04em;">
              Powered by <span style="color:${ACCENT};font-weight:600;">Dexa POS</span>
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/**
 * Format an ISO date string (YYYY-MM-DD) as a friendly date.
 * Optional time string ("HH:MM" or "HH:MM:SS") appends a time.
 */
export function fmtReservationDateTime(
  date: string,
  time?: string | null
): string {
  const d = new Date(`${date}T${time ?? "12:00:00"}`);
  const dateStr = d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  if (!time) return dateStr;
  const timeStr = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${dateStr} at ${timeStr}`;
}

/** Short variant: "Sat May 4 - 7:30 PM" — for SMS, ASCII-safe. */
export function fmtReservationShort(
  date: string,
  time?: string | null
): string {
  const d = new Date(`${date}T${time ?? "12:00:00"}`);
  const dateStr = d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  if (!time) return dateStr;
  const timeStr = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${dateStr} - ${timeStr}`;
}
