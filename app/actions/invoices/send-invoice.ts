"use server";

import { auth } from "@clerk/nextjs/server";
import { Resend } from "resend";
import { sendSMS } from "@/lib/messaging/telnyx";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  getEffectiveMerchantContext,
  UnauthorizedOrgError,
} from "@/lib/admin/merchant-context";
import { resolveAppUrl } from "@/lib/messaging/app-url";
import {
  renderInvoiceHtml,
  renderInvoiceText,
  dueLabelFor,
  type InvoiceTemplateData,
} from "@/lib/messaging/invoice-template";
import {
  generateInvoicePdfBuffer,
  buildInvoicePdfFilename,
} from "@/lib/invoices/invoice-pdf";
import { isValidEmail } from "@/lib/messaging/resend";
import { isValidPhoneNumber } from "@/lib/messaging/telnyx";
import { LogAuditEvent } from "@/app/dashboard/actions/audit-logs";

const RATE_LIMIT_SENDS = 3;
const RATE_LIMIT_WINDOW_HOURS = 1;

export type SendInvoiceChannel = "email" | "sms";

export interface SendInvoiceParams {
  invoiceId: string;
  channels: SendInvoiceChannel[];
  /** Overrides the customer's email; falls back to the linked customer. */
  email?: string;
  /** Overrides the customer's phone; falls back to the linked customer. */
  phone?: string;
  /** When true, persist a provided email/phone to the linked customer profile. */
  saveToProfile?: boolean;
}

export interface ChannelResult {
  channel: SendInvoiceChannel;
  success: boolean;
  message: string;
}

export interface SendInvoiceResult {
  success: boolean;
  message: string;
  results: ChannelResult[];
}

/** Confirms the invoice belongs to the caller's effective merchant. */
async function effectiveMerchantOwns(merchantId: string | null | undefined): Promise<boolean> {
  if (!merchantId) return false;
  try {
    const ctx = await getEffectiveMerchantContext(null);
    return ctx.merchantId === merchantId;
  } catch (err) {
    if (err instanceof UnauthorizedOrgError) return false;
    throw err;
  }
}

async function fetchMerchantLogoUrl(
  supabase: ReturnType<typeof createServiceRoleClient>,
  merchantId: string | undefined,
): Promise<string | null> {
  if (!merchantId) return null;
  const { data } = await supabase
    .from("merchants")
    .select("clerk_org_id, organizations(imageURL)")
    .eq("id", merchantId)
    .maybeSingle();
  const org = (
    data as {
      organizations?:
        | { imageURL?: string | null }
        | { imageURL?: string | null }[]
        | null;
    } | null
  )?.organizations;
  if (!org) return null;
  const record = Array.isArray(org) ? org[0] : org;
  return record?.imageURL ?? null;
}

export async function sendInvoice(
  params: SendInvoiceParams,
): Promise<SendInvoiceResult> {
  const { userId } = await auth();
  if (!userId) {
    return { success: false, message: "Unauthorized", results: [] };
  }

  const channels = Array.from(new Set(params.channels ?? []));
  if (channels.length === 0) {
    return { success: false, message: "Select at least one channel.", results: [] };
  }

  const supabase = createServiceRoleClient();

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select(
      `
      *,
      items:invoice_items(*),
      customer:customers(id, name, email, phone),
      location:locations(name)
    `,
    )
    .eq("id", params.invoiceId)
    .single();

  if (invoiceError || !invoice) {
    return { success: false, message: "Invoice not found", results: [] };
  }

  const inv = invoice as Record<string, unknown>;
  const merchantId = inv.merchant_id as string | undefined;

  if (!(await effectiveMerchantOwns(merchantId))) {
    return { success: false, message: "Invoice not found", results: [] };
  }

  if (inv.status === "paid") {
    return { success: false, message: "This invoice is already paid.", results: [] };
  }
  if (inv.status === "cancelled") {
    return { success: false, message: "This invoice has been cancelled.", results: [] };
  }

  // ── Rate limit (mirrors receipts: 3 sends / invoice / hour) ────────────────
  const oneHourAgo = new Date(
    Date.now() - RATE_LIMIT_WINDOW_HOURS * 60 * 60 * 1000,
  ).toISOString();
  const { data: recentSends } = await supabase
    .from("invoice_sends")
    .select("id")
    .eq("invoice_id", params.invoiceId)
    .gte("sent_at", oneHourAgo);
  if ((recentSends?.length ?? 0) >= RATE_LIMIT_SENDS) {
    return {
      success: false,
      message: `Rate limit exceeded. Maximum ${RATE_LIMIT_SENDS} sends per invoice per hour.`,
      results: [],
    };
  }

  // ── Recipients: explicit overrides win, else fall back to the customer ─────
  const customer = (inv.customer as {
    id?: string;
    email?: string | null;
    phone?: string | null;
  } | null) ?? null;
  const emailRecipient = (params.email || customer?.email || "").trim();
  const phoneRecipient = (params.phone || customer?.phone || "").trim();

  // ── Build the template payload ─────────────────────────────────────────────
  const locationName = (inv.location as { name?: string } | null)?.name ?? null;
  const { data: merchantRow } = await supabase
    .from("merchants")
    .select("name, dba_name")
    .eq("id", merchantId as string)
    .maybeSingle();
  const merchantName =
    (merchantRow as { name?: string; dba_name?: string } | null)?.dba_name ||
    (merchantRow as { name?: string } | null)?.name ||
    null;
  const businessName = locationName || merchantName || "Invoice";

  const templateData: InvoiceTemplateData = {
    invoiceNumber: inv.invoice_number as string,
    businessName,
    subtotal: inv.subtotal as number,
    discountAmount: inv.discount_amount as number,
    taxRate: inv.tax_rate as number,
    taxAmount: inv.tax_amount as number,
    totalAmount: inv.total_amount as number,
    amountPaid: (inv.amount_paid as number) ?? 0,
    dueLabel: dueLabelFor(
      inv.payment_due_type as string | null,
      inv.due_date as string | null,
    ),
    note: inv.note as string | null,
    items: ((inv.items as Array<Record<string, unknown>>) ?? []).map((i) => ({
      name: i.name as string,
      description: i.description as string | null,
      quantity: i.quantity as number,
      unit_price: i.unit_price as number,
      total_price: i.total_price as number,
    })),
  };

  const appUrl = await resolveAppUrl();
  const publicToken = inv.public_token as string | undefined;
  const payUrl = publicToken && appUrl ? `${appUrl}/invoice/${publicToken}` : null;

  const results: ChannelResult[] = [];
  let anySuccess = false;

  for (const channel of channels) {
    if (channel === "email") {
      if (!emailRecipient || !isValidEmail(emailRecipient)) {
        results.push({
          channel,
          success: false,
          message: "No valid email on file for this customer.",
        });
        continue;
      }
      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) {
        results.push({
          channel,
          success: false,
          message: "Email service not configured (RESEND_API_KEY).",
        });
        continue;
      }

      const { data: pendingRow } = await supabase
        .from("invoice_sends")
        .insert({
          invoice_id: params.invoiceId,
          merchant_id: merchantId,
          delivery_method: "email",
          recipient: emailRecipient,
          status: "pending",
          created_by: userId,
        })
        .select("id")
        .single();

      const logoUrl = await fetchMerchantLogoUrl(supabase, merchantId);
      const html = renderInvoiceHtml(templateData, {
        merchantLogoUrl: logoUrl,
        payUrl,
      });

      // Attach the invoice as a PDF. Generation failure must not block delivery
      // — the HTML body + pay link stand on their own — so fall back to no
      // attachment and log.
      let attachments:
        | { filename: string; content: Buffer }[]
        | undefined;
      try {
        const pdfBuffer = await generateInvoicePdfBuffer(templateData);
        attachments = [
          {
            filename: buildInvoicePdfFilename(templateData.invoiceNumber),
            content: pdfBuffer,
          },
        ];
      } catch (pdfError) {
        console.error("[sendInvoice] PDF generation failed:", pdfError);
      }

      const resend = new Resend(apiKey);
      const fromEmail = process.env.RESEND_FROM_EMAIL || "invoices@resend.dev";
      const { error: emailError } = await resend.emails.send({
        from: fromEmail,
        to: emailRecipient,
        subject: `Invoice ${templateData.invoiceNumber} from ${businessName}`,
        html,
        ...(attachments ? { attachments } : {}),
      });

      if (pendingRow) {
        await supabase
          .from("invoice_sends")
          .update({
            status: emailError ? "failed" : "sent",
            error_message: emailError ? emailError.message : null,
          })
          .eq("id", (pendingRow as { id: string }).id);
      }

      if (emailError) {
        results.push({ channel, success: false, message: emailError.message });
      } else {
        anySuccess = true;
        results.push({ channel, success: true, message: "Email sent." });
        if (params.saveToProfile && customer?.id && params.email) {
          await supabase
            .from("customers")
            .update({ email: emailRecipient })
            .eq("id", customer.id);
        }
      }
    } else {
      // SMS
      if (!phoneRecipient || !isValidPhoneNumber(phoneRecipient)) {
        results.push({
          channel,
          success: false,
          message: "No valid phone on file for this customer.",
        });
        continue;
      }
      if (
        !process.env.TELNYX_API_KEY ||
        (!process.env.TELNYX_FROM_NUMBER && !process.env.TELNYX_MESSAGING_PROFILE_ID)
      ) {
        results.push({
          channel,
          success: false,
          message: "SMS service not configured (Telnyx).",
        });
        continue;
      }

      const { data: pendingRow } = await supabase
        .from("invoice_sends")
        .insert({
          invoice_id: params.invoiceId,
          merchant_id: merchantId,
          delivery_method: "sms",
          recipient: phoneRecipient,
          status: "pending",
          created_by: userId,
        })
        .select("id")
        .single();

      const text = renderInvoiceText(templateData, payUrl || appUrl);
      const smsResult = await sendSMS(phoneRecipient, text);
      const failed = "error" in smsResult;

      if (pendingRow) {
        await supabase
          .from("invoice_sends")
          .update({
            status: failed ? "failed" : "sent",
            error_message: failed ? smsResult.error : null,
          })
          .eq("id", (pendingRow as { id: string }).id);
      }

      if (failed) {
        results.push({ channel, success: false, message: smsResult.error });
      } else {
        anySuccess = true;
        results.push({ channel, success: true, message: "SMS sent." });
        if (params.saveToProfile && customer?.id && params.phone) {
          await supabase
            .from("customers")
            .update({ phone: phoneRecipient })
            .eq("id", customer.id);
        }
      }
    }
  }

  // ── Flip to sent + stamp sent_at only when something actually dispatched ───
  if (anySuccess && (inv.status === "draft" || inv.status === "overdue")) {
    await supabase
      .from("invoices")
      .update({
        status: "sent",
        sent_at: (inv.sent_at as string | null) ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.invoiceId);
  }

  if (anySuccess) {
    await LogAuditEvent({
      merchantId: merchantId as string,
      action: `Sent Invoice: ${templateData.invoiceNumber}`,
      actionCategory: "billing",
      resourceType: "invoice",
      resourceId: params.invoiceId,
      resourceName: templateData.invoiceNumber,
      metadata: {
        channels,
        results: results.map((r) => ({ channel: r.channel, success: r.success })),
      },
    });
  }

  const message = anySuccess
    ? results.every((r) => r.success)
      ? "Invoice sent."
      : "Invoice sent on some channels — see details."
    : results[0]?.message || "Failed to send invoice.";

  return { success: anySuccess, message, results };
}
