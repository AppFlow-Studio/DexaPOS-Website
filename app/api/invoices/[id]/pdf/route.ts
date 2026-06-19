import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  getEffectiveMerchantContext,
  UnauthorizedOrgError,
} from "@/lib/admin/merchant-context";
import {
  dueLabelFor,
  type InvoiceTemplateData,
} from "@/lib/messaging/invoice-template";
import {
  generateInvoicePdfBuffer,
  buildInvoicePdfFilename,
} from "@/lib/invoices/invoice-pdf";

// jsPDF needs Node APIs (Buffer / arraybuffer output), not the Edge runtime.
export const runtime = "nodejs";

/**
 * Authenticated invoice PDF download. Regenerates the document on demand from
 * current invoice data (stateless — no stored file), so it always reflects the
 * latest edits. Authorization mirrors sendInvoice(): the invoice must belong to
 * the caller's effective merchant (honoring impersonation).
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "Missing invoice id" }, { status: 400 });
  }

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    .eq("id", id)
    .single();

  if (invoiceError || !invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  const inv = invoice as Record<string, unknown>;
  const merchantId = inv.merchant_id as string | undefined;

  // ── Ownership check (same guard as sendInvoice) ───────────────────────────
  let owns = false;
  try {
    const merchantCtx = await getEffectiveMerchantContext(null);
    owns = !!merchantId && merchantCtx.merchantId === merchantId;
  } catch (err) {
    if (!(err instanceof UnauthorizedOrgError)) throw err;
  }
  if (!owns) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  // ── Build the shared template payload ─────────────────────────────────────
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

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await generateInvoicePdfBuffer(templateData);
  } catch (err) {
    console.error("[invoice pdf route] generation failed:", err);
    return NextResponse.json(
      { error: "Failed to generate PDF" },
      { status: 500 },
    );
  }

  const filename = buildInvoicePdfFilename(templateData.invoiceNumber);

  return new NextResponse(pdfBuffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(pdfBuffer.length),
      "Cache-Control": "private, no-store",
    },
  });
}
