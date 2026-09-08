import { NextResponse } from "next/server";

import { getClientIp, rateLimit } from "@/lib/cms/form-security";
import { normalizeForm } from "@/lib/site-builder/forms/document";
import {
  FORM_ERROR_PARAM,
  FORM_EVENT_PARAM,
  FORM_SUBMITTED_PARAM,
  HONEYPOT_FIELD,
  MIN_FILL_MS,
  RENDERED_AT_FIELD,
} from "@/lib/site-builder/forms/protocol";
import { deliverFormSubmissionNotification } from "@/lib/site-builder/forms/notification-delivery";
import { MAX_SUBMISSION_BYTES, buildSubmission } from "@/lib/site-builder/forms/submission";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * Where a public form posts.
 *
 * **A route handler rather than a Server Action**, so the form works with no
 * JavaScript: a native `<form method="post">` needs somewhere to POST to and
 * something to redirect it back. That choice is what makes a restaurant's
 * catering enquiry form survive a failed script bundle.
 *
 * The order of operations is deliberate, and it is the order
 * `lib/cms/form-security.ts` prescribes for every public endpoint in this
 * codebase:
 *
 *   1. size cap        — before parsing, so a huge body is never materialised
 *   2. honeypot/timing — silently *accept* so a bot learns nothing
 *   3. rate limit      — per IP and per form
 *   4. load the authoritative published definition
 *   5. validate against it — the definition is the allowlist
 *   6. insert with the service role
 *
 * **Every failure looks the same from outside.** A bad form id, an unpublished
 * form, another merchant's form and a validation failure all redirect back the
 * same way. A form id is guessable, and an endpoint that answers "no such form"
 * differently from "that form is not published" is an enumeration oracle for
 * which merchants exist.
 */

export const runtime = "nodejs";

/** Generous for a form, mean for an abuser. */
const RATE_LIMIT = { max: 5, windowSeconds: 300 };

export async function POST(request: Request): Promise<Response> {
  const referer = request.headers.get("referer");

  // A form always posts from the page it is on, so a missing Referer is either
  // a stripped-header client or a hand-crafted request. Either way there is
  // nowhere to send them back to.
  const back = safeReturnUrl(referer);
  if (!back) return new NextResponse("Bad request", { status: 400 });

  // 1. Size, before parsing. Per-field caps are not a cap on the request.
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_SUBMISSION_BYTES) {
    return redirectBack(back, FORM_ERROR_PARAM, "");
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return redirectBack(back, FORM_ERROR_PARAM, "");
  }

  const formId = str(form.get("formId"));
  const siteId = str(form.get("siteId"));
  if (!isUuid(formId) || !isUuid(siteId)) return redirectBack(back, FORM_ERROR_PARAM, "");

  // 2. Bot signals. Silently *succeed* — the confirmation is shown, nothing is
  //    stored, and an automated submitter gets no signal to iterate against.
  if (looksAutomated(form)) return redirectBack(back, FORM_SUBMITTED_PARAM, formId);

  // 3. Rate limit, keyed per form so one busy form cannot lock out another.
  const ip = getClientIp(request);
  const allowed = await rateLimit({
    ip,
    action: `site-form:${formId}`,
    max: RATE_LIMIT.max,
    windowSeconds: RATE_LIMIT.windowSeconds,
  });
  if (!allowed) return redirectBack(back, FORM_ERROR_PARAM, formId);

  const supabase = createServiceRoleClient();

  // 4. The authoritative definition — published only, scoped by site. Read
  //    through the same SECURITY DEFINER function an anonymous render uses, so
  //    the endpoint cannot accept a form the site would not have shown.
  const { data, error } = await supabase.rpc("get_public_site_form", {
    p_site_id: siteId,
    p_form_id: formId,
  });

  const row = (data as Record<string, unknown>[] | null)?.[0];
  if (error || !row) return redirectBack(back, FORM_ERROR_PARAM, formId);

  const doc = normalizeForm(row.definition);

  // 5. The definition is the allowlist. `buildSubmission` iterates the fields,
  //    never the posted body, so an unknown key cannot be stored at all.
  const result = buildSubmission(doc, formEntries(form, doc));
  if (!result.ok) return redirectBack(back, FORM_ERROR_PARAM, formId);

  // 6. Service role, because anon has no insert policy on this table by design:
  //    submissions hold other people's names and phone numbers, and a public
  //    write policy is one predicate mistake away from a lead-list leak.
  //    `merchant_id` and `site_id` are derived by trigger, never sent.
  const notificationRecipients = doc.settings.notifyEmails;
  const { data: inserted, error: insertError } = await supabase
    .from("site_form_submissions")
    .insert({
      form_id: formId,
      answers: result.record.answers,
      contact_name: result.record.contact.name,
      contact_email: result.record.contact.email,
      contact_phone: result.record.contact.phone,
      contact_address: result.record.contact.address,
      ip_hash: await hashIp(ip),
      user_agent: (request.headers.get("user-agent") ?? "").slice(0, 300) || null,
      // Snapshot the destination. Retrying an old response must not silently
      // send it to a different person because the form settings changed later.
      notification_recipients: notificationRecipients,
      notification_state: notificationRecipients.length > 0 ? "pending" : "not_requested",
    })
    .select("id, created_at")
    .single();

  if (insertError || !inserted) {
    console.error(
      "[site-forms] submission insert failed:",
      insertError?.message ?? "insert returned no row",
    );
    return redirectBack(back, FORM_ERROR_PARAM, formId);
  }

  // Store first, notify second. A failed email is recorded for the merchant and
  // never turns a successfully stored public response into an error page.
  if (notificationRecipients.length > 0) {
    const attemptedAt = new Date().toISOString();
    const delivery = await deliverFormSubmissionNotification({
      recipients: notificationRecipients,
      formName: String(row.form_name ?? doc.title ?? "Website form"),
      record: result.record,
      receivedAt: String(inserted.created_at ?? attemptedAt),
    });

    const { error: deliveryStateError } = await supabase
      .from("site_form_submissions")
      .update({
        notification_state: delivery.ok ? "sent" : "failed",
        notification_attempts: 1,
        notification_last_attempt_at: attemptedAt,
        notification_sent_at: delivery.ok ? attemptedAt : null,
        notification_error: delivery.error,
        notification_message_ids: delivery.messageIds,
      })
      .eq("id", inserted.id);

    if (deliveryStateError) {
      console.error("[site-forms] notification state update failed:", deliveryStateError.message);
    }
  }

  return redirectBack(back, FORM_SUBMITTED_PARAM, formId, crypto.randomUUID());
}

/**
 * Collects posted values, keyed by field id, in the shape `buildSubmission`
 * expects.
 *
 * Reads only the ids the definition names — a second, redundant pass of the
 * same allowlist. `getAll` is used for every field so a multiple-choice answer
 * arrives as the array it is.
 */
function formEntries(form: FormData, doc: ReturnType<typeof normalizeForm>) {
  const out: Record<string, unknown> = {};

  for (const field of doc.fields) {
    const values = form.getAll(field.id).flatMap((v) => (typeof v === "string" ? [v] : []));
    if (values.length === 0) continue;
    out[field.id] = field.kind === "multiple-choice" ? values : values[0];
  }

  return out;
}

/**
 * Honeypot first, timing second.
 *
 * The honeypot is the real filter; the elapsed-time check is a soft signal
 * against the crudest replay tooling and is trivially spoofable, which is
 * exactly how `lib/cms/form-security.ts` describes its own version.
 */
function looksAutomated(form: FormData): boolean {
  const honeypot = str(form.get(HONEYPOT_FIELD));
  if (honeypot !== "") return true;

  const renderedAt = Number(str(form.get(RENDERED_AT_FIELD)));
  if (!Number.isFinite(renderedAt) || renderedAt <= 0) return false;

  const elapsed = Date.now() - renderedAt;
  // Negative means a clock skew or a forged stamp, not a fast human.
  return elapsed >= 0 && elapsed < MIN_FILL_MS;
}

/**
 * Back to the page the form was on, and only ever to a path on that same
 * origin.
 *
 * The Referer is attacker-controllable, so the host is discarded entirely and
 * only the path and a rebuilt query survive. Redirecting to a caller-supplied
 * absolute URL would make this an open redirect with a form in front of it.
 */
function safeReturnUrl(referer: string | null): URL | null {
  if (!referer) return null;
  try {
    const url = new URL(referer);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

function redirectBack(back: URL, param: string, value: string, eventToken?: string): Response {
  const target = new URL(back.toString());

  // Clear any previous outcome so a resubmit does not show two banners.
  target.searchParams.delete(FORM_SUBMITTED_PARAM);
  target.searchParams.delete(FORM_ERROR_PARAM);
  target.searchParams.delete(FORM_EVENT_PARAM);
  if (value) target.searchParams.set(param, value);
  if (eventToken) target.searchParams.set(FORM_EVENT_PARAM, eventToken);

  // 303 so the browser follows with GET — the POST/redirect/GET pattern, which
  // is what stops a refresh from re-submitting the form.
  return NextResponse.redirect(target, 303);
}

/**
 * A salted hash, never the address itself.
 *
 * Enough to spot a flood from one source; not a visitor-tracking log the
 * merchant never asked for and would have to disclose. Salted with a
 * deployment secret so the table is not a rainbow-table lookup of every visitor
 * who ever filled in a form.
 */
async function hashIp(ip: string): Promise<string | null> {
  if (!ip || ip === "unknown") return null;
  try {
    const salt = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    const bytes = new TextEncoder().encode(`${salt}:${ip}`);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
      .slice(0, 16)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}

function str(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
