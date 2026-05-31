"use server";

import { z } from "zod";
import { sendEmail, isValidEmail } from "@/lib/messaging/resend";

const Schema = z.object({
  business: z.string().trim().min(1).max(200),
  contact: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(7).max(40),
  email: z.string().trim().email().max(320),
  concept: z.enum([
    "qsr",
    "fine",
    "cafe",
    "pizzeria",
    "truck",
    "bar",
    "deli",
    "catering",
    "multi",
    "other",
  ]),
  locations: z.enum(["1", "2-5", "6-10", "11-25", "26-50", "50+"]),
  current: z.string().trim().max(200).optional().default(""),
  message: z.string().trim().max(5000).optional().default(""),
});

export type DemoRequestState = { ok: boolean; error?: string } | null;

function esc(s: string): string {
  return s.replace(
    /[<>&"]/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!,
  );
}

export async function submitDemoRequest(
  _prev: DemoRequestState,
  formData: FormData,
): Promise<DemoRequestState> {
  const raw = Object.fromEntries(formData.entries());
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Please fill in all required fields." };
  }

  const inbox = process.env.MARKETING_DEMO_REQUEST_INBOX;
  if (!inbox || !isValidEmail(inbox)) {
    console.error(
      "[submitDemoRequest] MARKETING_DEMO_REQUEST_INBOX is missing or invalid",
    );
    return {
      ok: false,
      error: "Email service not configured. Please email us directly.",
    };
  }

  const d = parsed.data;
  const html = `<h2>New DEXA POS demo request</h2>
    <table cellpadding="6" style="font-family:Inter,Arial,sans-serif;font-size:14px;border-collapse:collapse;">
      <tr><td><b>Business</b></td><td>${esc(d.business)}</td></tr>
      <tr><td><b>Contact</b></td><td>${esc(d.contact)}</td></tr>
      <tr><td><b>Phone</b></td><td>${esc(d.phone)}</td></tr>
      <tr><td><b>Email</b></td><td>${esc(d.email)}</td></tr>
      <tr><td><b>Concept</b></td><td>${d.concept}</td></tr>
      <tr><td><b>Locations</b></td><td>${d.locations}</td></tr>
      <tr><td><b>Current POS</b></td><td>${esc(d.current)}</td></tr>
      <tr><td valign="top"><b>Message</b></td><td>${esc(d.message).replace(/\n/g, "<br>")}</td></tr>
    </table>`;

  const result = await sendEmail(
    inbox,
    `Demo request — ${d.business}`,
    html,
  );
  if ("error" in result) {
    return {
      ok: false,
      error: "Could not send your request. Please try again.",
    };
  }
  return { ok: true };
}
