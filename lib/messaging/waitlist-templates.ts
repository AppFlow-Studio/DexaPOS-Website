import {
  COLORS,
  escapeHtml,
  renderBrandedEmail,
  type BrandedEmailContext,
} from "./notification-shared";

const { ACCENT, MUTED, SURFACE } = COLORS;

export interface WaitlistAddedContext {
  partyName: string;
  partySize: number;
  position?: number | null;
  quotedWaitMinutes?: number | null;
}

/** SMS for "you're on the waitlist". Single GSM-7 segment for typical content. */
export function renderWaitlistAddedText(
  brand: BrandedEmailContext,
  ctx: WaitlistAddedContext
): string {
  const lines = [brand.businessName];
  const head = `Hi ${ctx.partyName}, you're on the waitlist`;
  const partyLine = `Party of ${ctx.partySize}`;
  const positionLine =
    typeof ctx.position === "number" && ctx.position > 0
      ? `Position #${ctx.position}`
      : "";
  const waitLine =
    typeof ctx.quotedWaitMinutes === "number" && ctx.quotedWaitMinutes > 0
      ? `Est. wait: ~${ctx.quotedWaitMinutes} min`
      : "";
  lines.push(head, [partyLine, positionLine].filter(Boolean).join(" - "));
  if (waitLine) lines.push(waitLine);
  lines.push("We'll text you when your table is ready.");
  return lines.filter(Boolean).join("\n");
}

/** Email for "you're on the waitlist" — branded card. */
export function renderWaitlistAddedHtml(
  brand: BrandedEmailContext,
  ctx: WaitlistAddedContext
): string {
  const positionRow =
    typeof ctx.position === "number" && ctx.position > 0
      ? `<div style="font:600 13px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${MUTED};letter-spacing:0.08em;text-transform:uppercase;">Position</div>
         <div style="margin-top:4px;font:600 24px/1.2 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${ACCENT};letter-spacing:-0.02em;">#${ctx.position}</div>`
      : "";
  const waitRow =
    typeof ctx.quotedWaitMinutes === "number" && ctx.quotedWaitMinutes > 0
      ? `<div style="margin-top:10px;font:400 13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${MUTED};">Estimated wait: ~${ctx.quotedWaitMinutes} min</div>`
      : "";
  const body = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${SURFACE};border-radius:16px;margin-bottom:16px;">
      <tr>
        <td style="padding:18px 20px;text-align:center;">
          ${positionRow}
          <div style="margin-top:${positionRow ? "10" : "0"}px;font:500 16px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${ACCENT};">${escapeHtml(ctx.partyName)} · Party of ${ctx.partySize}</div>
          ${waitRow}
        </td>
      </tr>
    </table>
    <div style="font:400 14px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${ACCENT};margin-bottom:8px;">
      You're on the waitlist.
    </div>
    <div style="font:400 14px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${MUTED};">
      We'll send you a text when your table is ready. Please stay nearby.
    </div>
  `;
  return renderBrandedEmail(brand, body, {
    previewText: `You're on the waitlist at ${brand.businessName}`,
    subjectFallback: `You're on the waitlist · ${brand.businessName}`,
  });
}

/** SMS for "your table is ready". */
export function renderTableReadyText(
  brand: BrandedEmailContext,
  partyName: string
): string {
  return [
    brand.businessName,
    `Hi ${partyName}, your table is ready!`,
    "Please return to the host stand.",
  ].join("\n");
}
