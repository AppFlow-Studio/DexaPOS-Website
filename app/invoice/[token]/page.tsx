import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { Metadata } from "next";
import Image from "next/image";
import { PayPanel } from "./PayPanel";
import { getInvoicePaymentBootstrap } from "@/app/actions/invoices/invoice-payment-bootstrap";

interface PageProps {
  params: Promise<{ token: string }>;
}

// ─── Types (shape of get_public_invoice) ───────────────────────────────────────

interface InvoiceData {
  invoice: {
    invoice_number: string;
    status: string;
    bill_type: string;
    payment_due_type: string;
    due_date: string | null;
    subtotal: number | null;
    discount_amount: number | null;
    tax_rate: number | null;
    tax_amount: number | null;
    total_amount: number | null;
    amount_paid: number | null;
    note: string | null;
    created_at: string | null;
    sent_at: string | null;
    paid_at: string | null;
  };
  merchant: { name: string | null };
  location: {
    name: string | null;
    address_line1: string | null;
    address_line2: string | null;
    city: string | null;
    state: string | null;
    postal_code: string | null;
    phone: string | null;
  } | null;
  customer: { name: string | null; email: string | null; phone: string | null } | null;
  logo_url: string | null;
  items: Array<{
    id: string;
    name: string | null;
    description: string | null;
    quantity: number | null;
    unit_price: number | null;
    total_price: number | null;
  }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const supabase = createServiceRoleClient();
  const { data } = await supabase.rpc("get_public_invoice", { p_token: token });
  const inv = data as InvoiceData | null;
  const name = (inv?.location?.name || inv?.merchant?.name)?.trim();
  const num = inv?.invoice?.invoice_number;
  const title = name
    ? `Invoice${num ? ` ${num}` : ""} from ${name}`
    : "Invoice";
  return {
    title,
    description: title,
    robots: { index: false, follow: false },
    formatDetection: { telephone: false, address: false, email: false },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(amount: number | null | undefined): string {
  if (amount == null) return "$0.00";
  return `$${Number(amount).toFixed(2)}`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function dueLabel(paymentDueType: string, dueDate: string | null): string {
  switch (paymentDueType) {
    case "upon_receipt":
      return "Upon receipt";
    case "net_15":
      return "Net 15";
    case "net_30":
      return "Net 30";
    case "net_60":
      return "Net 60";
    case "custom":
      return dueDate ? fmtDate(dueDate) : "Custom";
    default:
      return "—";
  }
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  viewed: "Viewed",
  paid: "Paid",
  overdue: "Overdue",
  cancelled: "Cancelled",
  payment_failed: "Payment Failed",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function PublicInvoicePage({ params }: PageProps) {
  const { token } = await params;

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("get_public_invoice", {
    p_token: token,
  });

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    notFound();
  }

  const { invoice, merchant, location, items, logo_url } = data as InvoiceData;
  const businessName = location?.name || merchant?.name || "Invoice";

  const total = Number(invoice.total_amount ?? 0);
  const paid = Number(invoice.amount_paid ?? 0);
  const amountDue = Math.max(0, total - paid);
  const isPaid = invoice.status === "paid";
  const isPayable = !isPaid && invoice.status !== "cancelled";

  // Resolve the NMI Collect.js tokenization key for this invoice's location.
  // Null when NMI isn't provisioned — the card form degrades gracefully.
  const { tokenizationKey } = isPayable
    ? await getInvoicePaymentBootstrap(token)
    : { tokenizationKey: null };

  return (
    <div className="min-h-screen bg-neutral-200 flex flex-col items-center justify-start py-6 sm:py-10 px-4 gap-5">
      <div className="w-full max-w-[420px] bg-white shadow-[0_6px_24px_rgba(0,0,0,0.10)] text-neutral-900 px-7 pt-8 pb-7 rounded-lg">
        {/* ── Header ──────────────────────────────────────────── */}
        <div className="flex flex-col items-center text-center">
          {logo_url ? (
            <Image
              src={logo_url}
              alt={businessName}
              width={72}
              height={72}
              className="object-contain w-16 h-16 mb-3"
              unoptimized
            />
          ) : null}
          <h1 className="text-lg font-bold uppercase tracking-wide leading-tight wrap-break-word">
            {businessName}
          </h1>
          <p className="text-[13px] text-neutral-600 mt-1.5">
            Invoice {invoice.invoice_number}
          </p>
          {location?.address_line1 && (
            <p className="text-[13px] text-neutral-600 mt-1.5 leading-relaxed">
              {location.address_line1}
              {location.address_line2 ? <><br />{location.address_line2}</> : null}
              <br />
              {location.city ? `${location.city}, ` : ""}
              {location.state ? `${location.state} ` : ""}
              {location.postal_code ?? ""}
            </p>
          )}
          {location?.phone && (
            <p className="text-[13px] text-neutral-600 mt-1">{location.phone}</p>
          )}
        </div>

        <Rule />

        {/* ── Amount due headline ─────────────────────────────── */}
        <div className="text-center">
          <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-neutral-500">
            {isPaid ? "Paid in full" : "Amount due"}
          </p>
          <p className="mt-1 text-3xl font-bold tabular-nums">
            {fmt(isPaid ? total : amountDue)}
          </p>
          <span
            className={`inline-block mt-2 px-2.5 py-0.5 rounded-full text-[12px] font-medium ${
              isPaid
                ? "bg-green-100 text-green-700"
                : invoice.status === "overdue" || invoice.status === "payment_failed"
                ? "bg-red-100 text-red-700"
                : "bg-blue-100 text-blue-700"
            }`}
          >
            {STATUS_LABELS[invoice.status] ?? invoice.status}
          </span>
        </div>

        <Rule />

        {/* ── Meta ────────────────────────────────────────────── */}
        <div className="space-y-1">
          <Line label="Issued" value={fmtDate(invoice.sent_at ?? invoice.created_at)} />
          <Line
            label="Payment due"
            value={dueLabel(invoice.payment_due_type, invoice.due_date)}
          />
          {isPaid && invoice.paid_at && (
            <Line label="Paid on" value={fmtDate(invoice.paid_at)} />
          )}
        </div>

        <Rule />

        {/* ── Items ───────────────────────────────────────────── */}
        <div className="space-y-3">
          {items.length === 0 ? (
            <p className="text-[13px] text-neutral-500">No items</p>
          ) : (
            items.map((item) => (
              <div key={item.id}>
                <div className="flex justify-between items-start gap-3">
                  <span className="text-[14px] leading-snug flex-1 min-w-0 wrap-break-word">
                    <span className="tabular-nums">{item.quantity ?? 1}</span>
                    {"  "}
                    {item.name ?? "Item"}
                    {item.description ? (
                      <span className="block text-[12.5px] text-neutral-500 mt-0.5">
                        {item.description}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-[14px] tabular-nums shrink-0 pt-px">
                    {fmt(item.total_price)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        <Rule />

        {/* ── Totals ──────────────────────────────────────────── */}
        <div className="space-y-1.5">
          {invoice.subtotal != null && (
            <Line label="Subtotal" value={fmt(invoice.subtotal)} />
          )}
          {invoice.discount_amount != null && Number(invoice.discount_amount) > 0 && (
            <Line label="Discount" value={`−${fmt(invoice.discount_amount)}`} />
          )}
          {invoice.tax_rate != null && Number(invoice.tax_rate) > 0 && (
            <Line label={`Tax (${invoice.tax_rate}%)`} value={fmt(invoice.tax_amount)} />
          )}
          {paid > 0 && <Line label="Amount paid" value={`−${fmt(paid)}`} />}

          <div className="flex justify-between items-baseline pt-2.5 mt-1.5 border-t border-neutral-300">
            <span className="text-[15px] font-bold uppercase tracking-wide">
              Total due
            </span>
            <span className="text-[15px] font-bold tabular-nums">
              {fmt(isPaid ? 0 : amountDue)}
            </span>
          </div>
        </div>

        {/* ── Pay (NMI Collect.js — §3) ───────────────────────── */}
        {isPayable && (
          <PayPanel
            publicToken={token}
            amountDue={amountDue}
            tokenizationKey={tokenizationKey}
          />
        )}

        {/* ── Note ────────────────────────────────────────────── */}
        {invoice.note && (
          <>
            <Rule />
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.04em] text-neutral-500 mb-1">
                Note
              </p>
              <p className="text-[13px] text-neutral-700 whitespace-pre-wrap">
                {invoice.note}
              </p>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center justify-center gap-2 text-[12px] text-neutral-500">
        <span>Powered by</span>
        <span className="font-bold text-neutral-700 tracking-tight">Dexa POS</span>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Rule() {
  return <div className="border-t border-neutral-200 my-4" />;
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline gap-4">
      <span className="text-[13px] min-w-0 wrap-break-word text-neutral-600">
        {label}
      </span>
      <span className="text-[13px] tabular-nums shrink-0 text-right text-neutral-700">
        {value}
      </span>
    </div>
  );
}
