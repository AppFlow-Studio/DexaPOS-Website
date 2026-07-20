import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { sendEmail } from "@/lib/messaging/resend";
import { sanitizeText } from "@/lib/cms/sanitize";
import {
  getClientIp,
  originAllowed,
  isBot,
  rateLimit,
  text,
  email,
  isValid,
  type FieldErrors,
} from "@/lib/cms/form-security";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Best-effort notification email; never blocks a saved submission. */
async function notify(record: Record<string, string>) {
  const inbox = process.env.MARKETING_DEMO_REQUEST_INBOX;
  if (!inbox) return;
  const rows = Object.entries(record)
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;font-weight:600">${esc(k)}</td><td style="padding:4px 0">${esc(v || "—")}</td></tr>`)
    .join("");
  const html = `<h2>New demo request</h2><table>${rows}</table>`;
  try {
    await sendEmail(inbox, `New demo request — ${record.business}`, html);
  } catch (err) {
    console.error("contact: notification email failed", err);
  }
}

export async function POST(req: Request) {
  // 1. Same-origin only.
  if (!originAllowed(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 2. Parse JSON defensively.
  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // 3. Bots: accept silently so they get no signal, but never write.
  if (isBot(body)) {
    return NextResponse.json({ ok: true });
  }

  // 4. Rate limit by IP.
  const allowed = await rateLimit({
    ip: getClientIp(req),
    action: "contact",
    max: 5,
    windowSeconds: 600,
  });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // 5. Validate + sanitize every field.
  const errors: FieldErrors = {};
  const record = {
    business: text(body.business, "business", errors, { max: 200, required: true }),
    contact_name: text(body.contact_name, "contact_name", errors, { max: 120, required: true }),
    phone: text(body.phone, "phone", errors, { max: 40, required: true }),
    email: email(body.email, "email", errors),
    concept: text(body.concept, "concept", errors, { max: 60, required: true }),
    locations: text(body.locations, "locations", errors, { max: 40, required: true }),
    current_pos: text(body.current_pos, "current_pos", errors, { max: 200 }),
    message: text(body.message, "message", errors, { max: 4000 }),
  };

  if (!isValid(errors)) {
    return NextResponse.json({ error: "Invalid submission" }, { status: 400 });
  }

  const clean = {
    business: sanitizeText(record.business),
    contact_name: sanitizeText(record.contact_name),
    phone: sanitizeText(record.phone),
    email: sanitizeText(record.email),
    concept: sanitizeText(record.concept),
    locations: sanitizeText(record.locations),
    current_pos: sanitizeText(record.current_pos),
    message: sanitizeText(record.message),
  };

  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("contact_submissions").insert(clean);

  if (error) {
    console.error("Failed to save contact submission:", error);
    return NextResponse.json({ error: "Failed to submit" }, { status: 500 });
  }

  // Row is saved — email is a best-effort side channel.
  await notify(clean);

  return NextResponse.json({ ok: true });
}
