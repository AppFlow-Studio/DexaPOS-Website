import { Resend } from "resend";
import { sendSMS, isValidPhoneNumber } from "@/lib/messaging/telnyx";
import { isValidEmail } from "@/lib/messaging/resend";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
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
import { LogAuditEvent } from "@/app/dashboard/actions/audit-logs";

// Shared invoice-send core consumed by both the merchant send path
// (app/actions/invoices/send-invoice.ts) and the HQ platform-billing send path
// (app/manage/actions/admin-merchant/platform-invoices.ts). Authorization and
// recipient resolution are the caller's job; everything provider-facing (Resend /
// Telnyx / PDF / invoice_sends ledger / rate limit / status flip / audit) lives here.

export const RATE_LIMIT_SENDS = 3;
export const RATE_LIMIT_WINDOW_HOURS = 1;

export type SendInvoiceChannel = "email" | "sms";

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

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

/** Loads an invoice with the fields the send pipeline needs. */
export async function loadInvoiceForSend(
  supabase: ServiceClient,
  invoiceId: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from("invoices")
    .select(
      `
      *,
      items:invoice_items(*),
      customer:customers(id, name, email, phone),
      location:locations(name)
    `,
    )
    .eq("id", invoiceId)
    .single();
  if (error || !data) return null;
  return data as Record<string, unknown>;
}

async function fetchMerchantLogoUrl(
  supabase: ServiceClient,
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

export interface DispatchInvoiceSendParams {
  supabase: ServiceClient;
  userId: string;
  /** Invoice row loaded via loadInvoiceForSend (items + location joined). */
  invoice: Record<string, unknown>;
  channels: SendInvoiceChannel[];
  /** Pre-resolved recipients (caller decides customer vs. billing email). */
  emailRecipient: string;
  phoneRecipient: string;
  /** Overrides the email subject line ("Invoice … from {businessName}" default). */
  emailSubject?: string;
  /** Called once after a successful email send (e.g. persist to customer profile). */
  onEmailDelivered?: () => Promise<void>;
  /** Called once after a successful SMS send. */
  onSmsDelivered?: () => Promise<void>;
}

/**
 * Dispatches an already-loaded invoice over the requested channels. Handles the
 * 3/hr rate limit, invoice_sends ledger, Resend (HTML + PDF attach) / Telnyx,
 * status→sent stamping, and audit logging. Returns per-channel results.
 */
export async function dispatchInvoiceSend(
  params: DispatchInvoiceSendParams,
): Promise<SendInvoiceResult> {
  const { supabase, userId, invoice: inv, emailRecipient, phoneRecipient } = params;
  const channels = Array.from(new Set(params.channels ?? []));
  if (channels.length === 0) {
    return { success: false, message: "Select at least one channel.", results: [] };
  }

  const invoiceId = inv.id as string;
  const merchantId = inv.merchant_id as string | undefined;

  if (inv.status === "paid") {
    return { success: false, message: "This invoice is already paid.", results: [] };
  }
  if (inv.status === "cancelled") {
    return { success: false, message: "This invoice has been cancelled.", results: [] };
  }

  // ── Rate limit (mirrors receipts: 3 sends / invoice / hour) ────────────────
  const windowStart = new Date(
    Date.now() - RATE_LIMIT_WINDOW_HOURS * 60 * 60 * 1000,
  ).toISOString();
  const { data: recentSends } = await supabase
    .from("invoice_sends")
    .select("id")
    .eq("invoice_id", invoiceId)
    .gte("sent_at", windowStart);
  if ((recentSends?.length ?? 0) >= RATE_LIMIT_SENDS) {
    return {
      success: false,
      message: `Rate limit exceeded. Maximum ${RATE_LIMIT_SENDS} sends per invoice per hour.`,
      results: [],
    };
  }

  // ── Template payload ───────────────────────────────────────────────────────
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
          message: "No valid email recipient for this invoice.",
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
          invoice_id: invoiceId,
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

      // PDF attach — generation failure must not block delivery (HTML body +
      // pay link stand on their own); fall back to no attachment and log.
      let attachments: { filename: string; content: Buffer }[] | undefined;
      try {
        const pdfBuffer = await generateInvoicePdfBuffer(templateData);
        attachments = [
          {
            filename: buildInvoicePdfFilename(templateData.invoiceNumber),
            content: pdfBuffer,
          },
        ];
      } catch (pdfError) {
        console.error("[dispatchInvoiceSend] PDF generation failed:", pdfError);
      }

      const resend = new Resend(apiKey);
      const fromEmail = process.env.RESEND_FROM_EMAIL || "invoices@resend.dev";
      const { error: emailError } = await resend.emails.send({
        from: fromEmail,
        to: emailRecipient,
        subject:
          params.emailSubject ||
          `Invoice ${templateData.invoiceNumber} from ${businessName}`,
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
        if (params.onEmailDelivered) await params.onEmailDelivered();
      }
    } else {
      // SMS
      if (!phoneRecipient || !isValidPhoneNumber(phoneRecipient)) {
        results.push({
          channel,
          success: false,
          message: "No valid phone recipient for this invoice.",
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
          invoice_id: invoiceId,
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
        if (params.onSmsDelivered) await params.onSmsDelivered();
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
      .eq("id", invoiceId);
  }

  if (anySuccess) {
    await LogAuditEvent({
      merchantId: merchantId as string,
      action: `Sent Invoice: ${templateData.invoiceNumber}`,
      actionCategory: "billing",
      resourceType: "invoice",
      resourceId: invoiceId,
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
