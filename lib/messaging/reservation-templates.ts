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
  /**
   * The guest's own link to `/r/{manage_token}` — view, and cancel themselves.
   *
   * Optional because a staff-typed booking has no website behind it, and a
   * "manage online" link that lands on a site the merchant never published
   * would be worse than no link at all. Website bookings always supply it;
   * that is the whole point of plan decision D6.
   */
  manageUrl?: string | null;
}

/**
 * What the merchant is told when a stranger books on their site.
 *
 * A superset of the guest context, and deliberately so: this one carries the
 * unmasked phone number and email, because the person reading it is the one who
 * has to call if the kitchen floods.
 */
export interface MerchantReservationAlertContext extends ReservationContext {
  email?: string | null;
  phone?: string | null;
  locationName?: string | null;
  occasionTags?: string[] | null;
  dietaryTags?: string[] | null;
  /** Absolute link into `/dashboard/reservations`. */
  dashboardUrl?: string | null;
}

/**
 * The guest's "manage this booking" call to action.
 *
 * A table cell rather than a styled anchor on its own: Outlook renders padding
 * on an anchor inconsistently, and a button that collapses to bare underlined
 * text is the difference between a guest cancelling online and a guest simply
 * not turning up. The URL is repeated in small print underneath because a
 * forwarded email often arrives with its links stripped.
 *
 * Returns "" for a booking with no manage page, which is the correct output —
 * a dead button is worse than none.
 */
function renderManageButton(manageUrl?: string | null): string {
  if (!manageUrl) return "";
  const href = escapeHtml(manageUrl);
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:20px auto 0;">
      <tr>
        <td style="border-radius:999px;background:${ACCENT};">
          <a href="${href}" style="display:inline-block;padding:12px 28px;font:600 14px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#ffffff;text-decoration:none;border-radius:999px;">View or cancel</a>
        </td>
      </tr>
    </table>
    <div style="margin-top:10px;text-align:center;font:400 11px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${MUTED};word-break:break-all;">${href}</div>
  `;
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
    // Last, because an SMS is read top-down and a URL is the one line a guest
    // may want to tap. It REPLACES the sign-off rather than joining it: a
    // confirmation text that scrolls is one nobody finishes reading.
    ctx.manageUrl
      ? `View or cancel: ${ctx.manageUrl}`
      : "We look forward to seeing you!",
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
      ${
        ctx.manageUrl
          ? "If your plans change, you can view or cancel this reservation yourself."
          : "If your plans change, just reply to this message or give us a call."
      }
    </div>
    ${renderManageButton(ctx.manageUrl)}
  `;
  return renderBrandedEmail(brand, body, {
    previewText: `Reservation confirmed for ${ctx.partyName} · ${when}`,
    subjectFallback: `Reservation confirmed · ${brand.businessName}`,
  });
}

// ─── Requested (manual review) ───

/**
 * Sent the moment a guest submits, when the restaurant reviews each booking.
 *
 * Sent **instead of** the confirmed pair, never alongside it. The whole point of
 * manual review is that nothing is confirmed yet, and a guest who receives
 * "Reservation confirmed" three seconds after being told their request was sent
 * has been told two different things by the same restaurant.
 *
 * **It promises a hold, because there is one.** `reservation_occupancy` counts a
 * pending booking as occupying its table, so the table really is held while the
 * merchant decides. That sentence is what stops a guest booking somewhere else
 * as insurance.
 */
export function renderReservationRequestedText(
  brand: BrandedEmailContext,
  ctx: ReservationContext
): string {
  const when = fmtReservationShort(ctx.reservationDate, ctx.reservationTime);
  const lines = [
    brand.businessName,
    `Request sent for ${ctx.partyName}`,
    `${when} - Party of ${ctx.partySize}`,
    // Before the confirmation number, because it is the fact that changes what
    // the guest does next.
    "Not confirmed yet - we're holding your table while the restaurant answers.",
    ctx.confirmationNumber ? `Reference #${ctx.confirmationNumber}` : "",
    ctx.manageUrl
      ? `View or withdraw: ${ctx.manageUrl}`
      : "We'll let you know as soon as they answer.",
  ].filter(Boolean);
  return lines.join("\n");
}

export function renderReservationRequestedHtml(
  brand: BrandedEmailContext,
  ctx: ReservationContext
): string {
  const when = fmtReservationDateTime(ctx.reservationDate, ctx.reservationTime);
  const body = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${SURFACE};border-radius:16px;margin-bottom:16px;">
      <tr>
        <td style="padding:18px 20px;text-align:center;">
          <div style="font:600 13px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${MUTED};letter-spacing:0.08em;text-transform:uppercase;">Request sent</div>
          <div style="margin-top:8px;font:600 18px/1.3 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${ACCENT};letter-spacing:-0.01em;">${escapeHtml(when)}</div>
          <div style="margin-top:6px;font:500 14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${ACCENT};">${escapeHtml(ctx.partyName)} · Party of ${ctx.partySize}</div>
          ${ctx.confirmationNumber ? `<div style="margin-top:10px;font:400 12px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${MUTED};letter-spacing:0.04em;">Reference #${escapeHtml(ctx.confirmationNumber)}</div>` : ""}
        </td>
      </tr>
    </table>
    ${ctx.specialRequests ? `<div style="margin-bottom:16px;padding:12px 16px;border-radius:12px;background:${SURFACE};font:400 13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${MUTED};"><strong style="color:${ACCENT};font-weight:500;">Special requests:</strong> ${escapeHtml(ctx.specialRequests)}</div>` : ""}
    <div style="font:600 14px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${ACCENT};margin-bottom:6px;">
      Nothing is confirmed yet.
    </div>
    <div style="font:400 14px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${MUTED};">
      ${escapeHtml(brand.businessName)} confirms each booking themselves. We're holding your table
      while they do, and we'll email and text you as soon as they answer${
        ctx.manageUrl ? " — either way" : ""
      }.
    </div>
    ${renderManageButton(ctx.manageUrl)}
  `;
  return renderBrandedEmail(brand, body, {
    previewText: `Request sent for ${ctx.partyName} · ${when} · not confirmed yet`,
    subjectFallback: `Booking request sent · ${brand.businessName}`,
  });
}

// ─── Declined (the merchant said no) ───

/**
 * A decline carries one thing a cancellation does not: somewhere to go next.
 */
export interface ReservationDeclinedContext extends ReservationContext {
  /** The branch's phone number. The only useful next step for a declined guest. */
  venuePhone?: string | null;
}

/**
 * Sent when the merchant declines a request.
 *
 * **Deliberately not the cancellation pair.** "Your reservation was cancelled"
 * is a sentence about something the guest believed they had; this guest was
 * told from the start that they had a request. Reusing the cancellation copy
 * would tell them a reservation they never held has been taken away, which
 * reads as a mistake by the restaurant rather than an answer to their question.
 *
 * The reason is optional and merchant-written. It is shown verbatim (escaped)
 * because paraphrasing a restaurant's own words is not ours to do.
 */
export function renderReservationDeclinedText(
  brand: BrandedEmailContext,
  ctx: ReservationDeclinedContext
): string {
  const when = fmtReservationShort(ctx.reservationDate, ctx.reservationTime);
  const lines = [
    brand.businessName,
    `Sorry - we can't fit you in on ${when}`,
    `Party of ${ctx.partySize}`,
    ctx.cancellationReason ? `"${ctx.cancellationReason}"` : "",
    // The phone number replaces a sign-off, for the same reason the manage URL
    // does in the confirmed template: it is the one line worth tapping.
    ctx.venuePhone
      ? `Call us on ${ctx.venuePhone} and we'll try to find you another time.`
      : "Try another time on our website and we'll do our best.",
  ].filter(Boolean);
  return lines.join("\n");
}

export function renderReservationDeclinedHtml(
  brand: BrandedEmailContext,
  ctx: ReservationDeclinedContext
): string {
  const when = fmtReservationDateTime(ctx.reservationDate, ctx.reservationTime);
  const body = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${SURFACE};border-radius:16px;margin-bottom:16px;">
      <tr>
        <td style="padding:18px 20px;text-align:center;">
          <div style="font:600 13px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${MUTED};letter-spacing:0.08em;text-transform:uppercase;">Request declined</div>
          <div style="margin-top:8px;font:600 18px/1.3 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${ACCENT};letter-spacing:-0.01em;">${escapeHtml(when)}</div>
          <div style="margin-top:6px;font:500 14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${ACCENT};">${escapeHtml(ctx.partyName)} · Party of ${ctx.partySize}</div>
        </td>
      </tr>
    </table>
    ${ctx.cancellationReason ? `<div style="margin-bottom:16px;padding:12px 16px;border-radius:12px;background:${SURFACE};font:400 13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${MUTED};"><strong style="color:${ACCENT};font-weight:500;">From the restaurant:</strong> ${escapeHtml(ctx.cancellationReason)}</div>` : ""}
    <div style="font:400 14px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${ACCENT};margin-bottom:6px;">
      We're sorry — we couldn't fit you in at that time.
    </div>
    <div style="font:400 14px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${MUTED};">
      ${
        ctx.venuePhone
          ? `Give us a call on ${escapeHtml(ctx.venuePhone)} and we'll try to find you another time.`
          : "Try another time on our website and we'll do our best to seat you."
      }
    </div>
  `;
  return renderBrandedEmail(brand, body, {
    previewText: `We couldn't fit you in on ${when}`,
    subjectFallback: `About your booking request · ${brand.businessName}`,
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

// ─── Merchant alert ───

/**
 * "Someone just booked on your website."
 *
 * A separate template from the guest's, not a re-skin of it, because the two
 * readers need opposite things. The guest already knows who they are and wants
 * one fact: it worked. The merchant knows nothing about this person and needs
 * every fact — including the unmasked phone number, which is the difference
 * between knowing there is a party of 8 at 7pm and being able to do anything
 * about it.
 *
 * Sent to `reservation_settings.notify_emails`, a merchant-controlled list of
 * their own staff. Nothing here is ever sent to the guest.
 */
export function renderReservationMerchantAlertText(
  brand: BrandedEmailContext,
  ctx: MerchantReservationAlertContext
): string {
  const when = fmtReservationShort(ctx.reservationDate, ctx.reservationTime);
  const lines = [
    `New website booking - ${ctx.locationName || brand.businessName}`,
    `${ctx.partyName} - party of ${ctx.partySize}`,
    when,
    ctx.phone ? `Phone: ${ctx.phone}` : "",
    ctx.email ? `Email: ${ctx.email}` : "",
    ctx.confirmationNumber ? `Confirmation #${ctx.confirmationNumber}` : "",
    ctx.specialRequests ? `Notes: ${ctx.specialRequests}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

export function renderReservationMerchantAlertHtml(
  brand: BrandedEmailContext,
  ctx: MerchantReservationAlertContext
): string {
  const when = fmtReservationDateTime(ctx.reservationDate, ctx.reservationTime);
  const tags = [...(ctx.occasionTags ?? []), ...(ctx.dietaryTags ?? [])].filter(Boolean);

  const row = (label: string, value: string, href?: string) => `
      <tr>
        <td style="padding:8px 0;font:400 13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${MUTED};white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td>
        <td style="padding:8px 0 8px 16px;font:500 14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${ACCENT};">${
          href
            ? `<a href="${escapeHtml(href)}" style="color:${ACCENT};">${escapeHtml(value)}</a>`
            : escapeHtml(value)
        }</td>
      </tr>`;

  const body = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${SURFACE};border-radius:16px;margin-bottom:16px;">
      <tr>
        <td style="padding:18px 20px;text-align:center;">
          <div style="font:600 13px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${MUTED};letter-spacing:0.08em;text-transform:uppercase;">New website booking</div>
          <div style="margin-top:8px;font:600 18px/1.3 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${ACCENT};letter-spacing:-0.01em;">${escapeHtml(when)}</div>
          <div style="margin-top:6px;font:500 14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${ACCENT};">${escapeHtml(ctx.partyName)} · Party of ${ctx.partySize}</div>
        </td>
      </tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px;">
      ${ctx.locationName ? row("Location", ctx.locationName) : ""}
      ${ctx.phone ? row("Phone", ctx.phone, `tel:${ctx.phone.replace(/[^0-9+]/g, "")}`) : ""}
      ${ctx.email ? row("Email", ctx.email, `mailto:${ctx.email}`) : ""}
      ${ctx.confirmationNumber ? row("Confirmation", `#${ctx.confirmationNumber}`) : ""}
      ${tags.length > 0 ? row("Tags", tags.join(", ")) : ""}
    </table>

    ${ctx.specialRequests ? `<div style="margin-top:12px;padding:12px 16px;border-radius:12px;background:${SURFACE};font:400 13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${MUTED};"><strong style="color:${ACCENT};font-weight:500;">Guest note:</strong> ${escapeHtml(ctx.specialRequests)}</div>` : ""}

    <div style="margin-top:16px;font:400 13px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${MUTED};">
      The table is already assigned and the booking is on your floor plan. Nothing needs doing.
    </div>
    ${
      ctx.dashboardUrl
        ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:20px auto 0;"><tr><td style="border-radius:999px;background:${ACCENT};"><a href="${escapeHtml(ctx.dashboardUrl)}" style="display:inline-block;padding:12px 28px;font:600 14px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#ffffff;text-decoration:none;border-radius:999px;">Open reservations</a></td></tr></table>`
        : ""
    }
  `;

  return renderBrandedEmail(brand, body, {
    previewText: `${ctx.partyName} · party of ${ctx.partySize} · ${when}`,
    subjectFallback: `New website booking · ${brand.businessName}`,
  });
}

/**
 * "A guest cancelled themselves."
 *
 * Short on purpose. The merchant does not need the guest's contact details to
 * act on a cancellation — the table is already free — so this says what changed
 * and stops. Sending the full dossier again would train staff to skim these.
 */
export function renderReservationMerchantCancelledText(
  brand: BrandedEmailContext,
  ctx: MerchantReservationAlertContext
): string {
  const when = fmtReservationShort(ctx.reservationDate, ctx.reservationTime);
  const lines = [
    `Website booking cancelled - ${ctx.locationName || brand.businessName}`,
    `${ctx.partyName} - party of ${ctx.partySize}`,
    when,
    ctx.confirmationNumber ? `Was confirmation #${ctx.confirmationNumber}` : "",
    ctx.cancellationReason ? `Reason: ${ctx.cancellationReason}` : "",
    "The table is free again.",
  ].filter(Boolean);
  return lines.join("\n");
}

export function renderReservationMerchantCancelledHtml(
  brand: BrandedEmailContext,
  ctx: MerchantReservationAlertContext
): string {
  const when = fmtReservationDateTime(ctx.reservationDate, ctx.reservationTime);
  const body = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${SURFACE};border-radius:16px;margin-bottom:16px;">
      <tr>
        <td style="padding:18px 20px;text-align:center;">
          <div style="font:600 13px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${MUTED};letter-spacing:0.08em;text-transform:uppercase;">Website booking cancelled</div>
          <div style="margin-top:8px;font:500 16px/1.3 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${ACCENT};text-decoration:line-through;">${escapeHtml(when)}</div>
          <div style="margin-top:6px;font:400 14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${MUTED};">${escapeHtml(ctx.partyName)} · Party of ${ctx.partySize}${ctx.confirmationNumber ? ` · #${escapeHtml(ctx.confirmationNumber)}` : ""}</div>
        </td>
      </tr>
    </table>
    ${ctx.cancellationReason ? `<div style="margin-bottom:16px;padding:12px 16px;border-radius:12px;background:${SURFACE};font:400 13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${MUTED};"><strong style="color:${ACCENT};font-weight:500;">Reason:</strong> ${escapeHtml(ctx.cancellationReason)}</div>` : ""}
    <div style="font:400 14px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${MUTED};">
      The guest cancelled from their confirmation link. The table is free again and the slot is back on your website.
    </div>
  `;

  return renderBrandedEmail(brand, body, {
    previewText: `Cancelled · ${ctx.partyName} · ${when}`,
    subjectFallback: `Website booking cancelled · ${brand.businessName}`,
  });
}
