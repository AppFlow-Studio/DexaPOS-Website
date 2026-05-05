import {
  COLORS,
  escapeHtml,
  fmtReservationDateTime,
  fmtReservationShort,
  renderBrandedEmail,
  type BrandedEmailContext,
} from "./notification-shared";

const { ACCENT, MUTED, SURFACE } = COLORS;

export interface ReservationContext {
  partyName: string;
  partySize: number;
  reservationDate: string;
  reservationTime?: string | null;
  confirmationNumber?: string | null;
  specialRequests?: string | null;
  cancellationReason?: string | null;
}

// ─── Confirmation ───

export function renderReservationConfirmedText(
  brand: BrandedEmailContext,
  ctx: ReservationContext
): string {
  const when = fmtReservationShort(ctx.reservationDate, ctx.reservationTime);
  const lines = [
    brand.businessName,
    `Reservation confirmed for ${ctx.partyName}`,
    `${when} - Party of ${ctx.partySize}`,
    ctx.confirmationNumber ? `Confirmation #${ctx.confirmationNumber}` : "",
    "We look forward to seeing you!",
  ].filter(Boolean);
  return lines.join("\n");
}

export function renderReservationConfirmedHtml(
  brand: BrandedEmailContext,
  ctx: ReservationContext
): string {
  const when = fmtReservationDateTime(
    ctx.reservationDate,
    ctx.reservationTime
  );
  const body = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${SURFACE};border-radius:16px;margin-bottom:16px;">
      <tr>
        <td style="padding:18px 20px;text-align:center;">
          <div style="font:600 13px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${MUTED};letter-spacing:0.08em;text-transform:uppercase;">Reservation confirmed</div>
          <div style="margin-top:8px;font:600 18px/1.3 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${ACCENT};letter-spacing:-0.01em;">${escapeHtml(when)}</div>
          <div style="margin-top:6px;font:500 14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${ACCENT};">${escapeHtml(ctx.partyName)} · Party of ${ctx.partySize}</div>
          ${ctx.confirmationNumber ? `<div style="margin-top:10px;font:400 12px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${MUTED};letter-spacing:0.04em;">Confirmation #${escapeHtml(ctx.confirmationNumber)}</div>` : ""}
        </td>
      </tr>
    </table>
    ${ctx.specialRequests ? `<div style="margin-bottom:16px;padding:12px 16px;border-radius:12px;background:${SURFACE};font:400 13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${MUTED};"><strong style="color:${ACCENT};font-weight:500;">Special requests:</strong> ${escapeHtml(ctx.specialRequests)}</div>` : ""}
    <div style="font:400 14px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${ACCENT};margin-bottom:6px;">
      We've got you on the books.
    </div>
    <div style="font:400 14px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${MUTED};">
      If your plans change, just reply to this message or give us a call.
    </div>
  `;
  return renderBrandedEmail(brand, body, {
    previewText: `Reservation confirmed for ${ctx.partyName} · ${when}`,
    subjectFallback: `Reservation confirmed · ${brand.businessName}`,
  });
}

// ─── Cancellation ───

export function renderReservationCancelledText(
  brand: BrandedEmailContext,
  ctx: ReservationContext
): string {
  const when = fmtReservationShort(ctx.reservationDate, ctx.reservationTime);
  const lines = [
    brand.businessName,
    `Reservation cancelled`,
    `${when} - Party of ${ctx.partySize}`,
    ctx.confirmationNumber ? `Confirmation #${ctx.confirmationNumber}` : "",
    "Hope to see you another time.",
  ].filter(Boolean);
  return lines.join("\n");
}

export function renderReservationCancelledHtml(
  brand: BrandedEmailContext,
  ctx: ReservationContext
): string {
  const when = fmtReservationDateTime(
    ctx.reservationDate,
    ctx.reservationTime
  );
  const body = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${SURFACE};border-radius:16px;margin-bottom:16px;">
      <tr>
        <td style="padding:18px 20px;text-align:center;">
          <div style="font:600 13px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${MUTED};letter-spacing:0.08em;text-transform:uppercase;">Reservation cancelled</div>
          <div style="margin-top:8px;font:500 16px/1.3 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${ACCENT};text-decoration:line-through;">${escapeHtml(when)}</div>
          <div style="margin-top:6px;font:400 14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${MUTED};">${escapeHtml(ctx.partyName)} · Party of ${ctx.partySize}</div>
          ${ctx.confirmationNumber ? `<div style="margin-top:10px;font:400 12px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${MUTED};letter-spacing:0.04em;">Was confirmation #${escapeHtml(ctx.confirmationNumber)}</div>` : ""}
        </td>
      </tr>
    </table>
    ${ctx.cancellationReason ? `<div style="margin-bottom:16px;padding:12px 16px;border-radius:12px;background:${SURFACE};font:400 13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${MUTED};"><strong style="color:${ACCENT};font-weight:500;">Reason:</strong> ${escapeHtml(ctx.cancellationReason)}</div>` : ""}
    <div style="font:400 14px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${ACCENT};margin-bottom:6px;">
      Your reservation has been cancelled.
    </div>
    <div style="font:400 14px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${MUTED};">
      We hope to welcome you another time.
    </div>
  `;
  return renderBrandedEmail(brand, body, {
    previewText: `Reservation cancelled · ${when}`,
    subjectFallback: `Reservation cancelled · ${brand.businessName}`,
  });
}
