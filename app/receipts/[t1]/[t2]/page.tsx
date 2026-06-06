import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { Metadata } from "next";
import Image from "next/image";

interface PageProps {
  params: Promise<{ t1: string; t2: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { t1, t2 } = await params;
  const supabase = createServiceRoleClient();
  const { data } = await supabase.rpc("get_public_receipt", {
    p_order_token: t1,
    p_send_token: t2,
  });
  const receipt = data as ReceiptData | null;
  const storeName = receipt?.location?.name?.trim();
  const orderNum = receipt?.order?.display_number
    ? receipt.order.display_number
    : receipt?.order?.order_number
    ? `#${receipt.order.order_number}`
    : null;

  const title = storeName
    ? `Your receipt from ${storeName}${orderNum ? ` · ${orderNum}` : ""}`
    : "Your receipt";
  const description = storeName
    ? `Your digital receipt from ${storeName}${orderNum ? ` for order ${orderNum}` : ""}.`
    : "Your digital receipt.";

  return {
    title,
    description,
    openGraph: { title, description },
    twitter: { card: "summary", title, description },
    robots: { index: false, follow: false },
    // Prevent iOS Safari from turning addresses, phone numbers, and
    // order codes into blue tappable links.
    formatDetection: { telephone: false, address: false, email: false },
  };
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Modifier {
  modifier_group_name: string | null;
  modifier_name: string | null;
  price_modifier: number | null;
  quantity: number | null;
  is_no: boolean | null;
}

interface OrderItem {
  id: string;
  item_name: string | null;
  quantity: number | null;
  unit_price: number | null;
  subtotal: number | null;
  is_voided: boolean | null;
  modifiers: Modifier[];
}

interface Payment {
  payment_method: string | null;
  amount: number | null;
  tip_amount: number | null;
  total_amount: number | null;
  status: string | null;
  card_type: string | null;
  card_last_four: string | null;
  terminal_type: string | null;
  authorization_code: string | null;
  refunded_amount: number | null;
  refunded_at: string | null;
}

interface ReceiptData {
  order: {
    display_number: string | null;
    order_number: string | null;
    created_at: string | null;
    status: string | null;
    payment_status: string | null;
    voided_at: string | null;
    void_reason: string | null;
    subtotal: number | null;
    tax_amount: number | null;
    tip_amount: number | null;
    discount_amount: number | null;
    service_charge: number | null;
    total_amount: number | null;
    effective_subtotal: number | null;
    effective_tax_amount: number | null;
    effective_total: number | null;
    payment_pricing_mode: string | null;
    cash_total: number | null;
    card_total: number | null;
  };
  location: {
    name: string | null;
    address_line1: string | null;
    address_line2: string | null;
    city: string | null;
    state: string | null;
    postal_code: string | null;
    phone: string | null;
  };
  logo_url: string | null;
  items: OrderItem[];
  payments: Payment[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(amount: number | null | undefined): string {
  if (amount == null) return "$0.00";
  return `$${Number(amount).toFixed(2)}`;
}

function fmtDatetime(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
}

function paymentBrand(p: Payment): string {
  if (p.payment_method === "cash") return "Cash";
  const brand = p.card_type ? p.card_type.toUpperCase() : "CARD";
  return p.card_last_four ? `${brand} ····${p.card_last_four}` : brand;
}

function fmtTerminalType(t: string | null): string | null {
  if (!t) return null;
  const map: Record<string, string> = {
    dejavoo_spinapi: "Dejavoo SpinAPI",
    dejavoo_p18:     "Dejavoo P18",
    dejavoo:         "Dejavoo",
    castles:         "Castles",
    manual:          "Manual Entry",
    cash_drawer:     "Cash Drawer",
    none:            null as unknown as string,
  };
  return map[t] ?? t;
}

function txnType(status: string | null): string {
  if (status === "refunded" || status === "partially_refunded") return "Refund";
  if (status === "voided") return "Void";
  return "Sale";
}

function authLabel(status: string | null): string {
  if (status === "captured" || status === "paid") return "Approved";
  if (status === "refunded" || status === "partially_refunded") return "Refunded";
  if (status === "voided") return "Voided";
  return status ?? "—";
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ReceiptPage({ params }: PageProps) {
  const { t1, t2 } = await params;

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("get_public_receipt", {
    p_order_token: t1,
    p_send_token: t2,
  });

  // Supabase connection/server error — throw so Next.js shows the error
  // boundary (with a Refresh button) rather than a misleading 404.
  if (error) {
    throw new Error(error.message);
  }

  // RPC returned null → tokens don't match any row → genuine 404.
  if (!data) {
    notFound();
  }

  const receipt = data as ReceiptData;
  const { order, location, logo_url, items, payments } = receipt;

  const orderNumber = order.display_number
    ? order.display_number
    : order.order_number
    ? `#${order.order_number}`
    : "—";

  const isVoided = !!order.voided_at;
  const isRefunded = order.payment_status === "refunded";

  const orderTotal =
    order.payment_pricing_mode === "cash"
      ? order.cash_total
      : order.payment_pricing_mode === "card"
      ? order.card_total
      : order.effective_total ?? order.total_amount;

  // The order-level total may exclude a tip captured at the terminal.
  // Sum the payments to get the real amount collected, then fall back
  // to the order total if no payments have been recorded yet.
  const paymentSum = payments.reduce(
    (s, p) => s + Number(p.total_amount ?? p.amount ?? 0),
    0
  );
  const chargedTotal = paymentSum > 0 ? paymentSum : orderTotal;

  const activeItems = items.filter((i) => !i.is_voided);

  return (
    <>
      <style>{`
        @media print {
          body { background: white !important; }
          .no-print { display: none !important; }
          .receipt-paper {
            box-shadow: none !important;
            max-width: 100% !important;
          }
        }
      `}</style>

      <div className="min-h-screen bg-neutral-200 flex flex-col items-center justify-start py-6 sm:py-10 px-4 gap-5">

        {/* The "paper": flat white, square edges, fine type — like a real printed receipt. */}
        <div className="receipt-paper w-full max-w-[360px] bg-white shadow-[0_6px_24px_rgba(0,0,0,0.10)] text-neutral-900 px-7 pt-8 pb-7">

          {/* Status banner — plain, monochrome, no icons */}
          {(isVoided || isRefunded) && (
            <div className="mb-5 border border-neutral-900 py-2 text-center">
              <p className="text-sm font-bold tracking-[0.2em] uppercase">
                {isVoided ? "Voided" : "Refunded"}
              </p>
              {isVoided && order.void_reason ? (
                <p className="text-xs text-neutral-500 mt-0.5">{order.void_reason}</p>
              ) : null}
            </div>
          )}

          {/* ── Header ──────────────────────────────────────────── */}
          <div className="flex flex-col items-center text-center">
            {logo_url ? (
              <Image
                src={logo_url}
                alt={location.name ?? "Store logo"}
                width={72}
                height={72}
                className="object-contain w-16 h-16 mb-3"
                unoptimized
              />
            ) : null}
            <h1 className="text-lg font-bold uppercase tracking-wide leading-tight wrap-break-word">
              {location.name}
            </h1>
            {location.address_line1 && (
              <p className="text-[13px] text-neutral-600 mt-1.5 leading-relaxed">
                {location.address_line1}
                {location.address_line2 ? <><br />{location.address_line2}</> : null}
                <br />
                {location.city ? `${location.city}, ` : ""}
                {location.state ? `${location.state} ` : ""}
                {location.postal_code ?? ""}
              </p>
            )}
            {location.phone && (
              <p className="text-[13px] text-neutral-600 mt-1">{location.phone}</p>
            )}
          </div>

          <Rule />

          {/* ── Order meta ──────────────────────────────────────── */}
          <div className="space-y-1">
            <Line label="Order" value={orderNumber} strong />
            <Line label="Ordered" value={fmtDatetime(order.created_at)} />
          </div>

          <Rule />

          {/* ── Items ───────────────────────────────────────────── */}
          <div className="space-y-3">
            {activeItems.map((item) => (
              <div key={item.id}>
                <div className="flex justify-between items-start gap-3">
                  <span className="text-[14px] leading-snug flex-1 min-w-0 wrap-break-word">
                    <span className="tabular-nums">{item.quantity ?? 1}</span>
                    {"  "}
                    {item.item_name ?? "Item"}
                  </span>
                  <span className="text-[14px] tabular-nums shrink-0 pt-px">
                    {fmt(item.subtotal)}
                  </span>
                </div>

                {/* Modifiers — plain indented text, no glyphs */}
                {item.modifiers
                  .filter((m) => !m.is_no && m.modifier_name)
                  .map((m, idx) => (
                    <div
                      key={idx}
                      className="flex justify-between items-start gap-2 text-[12.5px] text-neutral-500 pl-5 mt-0.5"
                    >
                      <span className="flex-1 min-w-0 wrap-break-word">{m.modifier_name}</span>
                      {m.price_modifier && Number(m.price_modifier) > 0 ? (
                        <span className="tabular-nums shrink-0">+{fmt(m.price_modifier)}</span>
                      ) : null}
                    </div>
                  ))}
              </div>
            ))}
          </div>

          <Rule />

          {/* ── Totals ──────────────────────────────────────────── */}
          <div className="space-y-1.5">
            {order.subtotal != null && (
              <Line label="Subtotal" value={fmt(order.effective_subtotal ?? order.subtotal)} />
            )}
            {order.discount_amount != null && Number(order.discount_amount) > 0 && (
              <Line label="Discount" value={`−${fmt(order.discount_amount)}`} />
            )}
            {order.service_charge != null && Number(order.service_charge) > 0 && (
              <Line label="Service Charge" value={fmt(order.service_charge)} />
            )}
            {order.tax_amount != null && (
              <Line label="Tax" value={fmt(order.effective_tax_amount ?? order.tax_amount)} />
            )}
            {order.tip_amount != null && Number(order.tip_amount) > 0 && (
              <Line label="Tip" value={fmt(order.tip_amount)} />
            )}

            <div className="flex justify-between items-baseline pt-2.5 mt-1.5 border-t border-neutral-300">
              <span className="text-[15px] font-bold uppercase tracking-wide">Total</span>
              <span className="text-[15px] font-bold tabular-nums">{fmt(chargedTotal)}</span>
            </div>
          </div>

          {/* ── Payments ────────────────────────────────────────── */}
          {payments.length > 0 && (
            <>
              <Rule />
              <div className="space-y-4">
                {payments.map((p, idx) => {
                  const isCash = p.payment_method === "cash";
                  const terminalLabel = fmtTerminalType(p.terminal_type);
                  return (
                    <div key={idx} className="space-y-1.5">
                      <Line
                        label={paymentBrand(p)}
                        value={fmt(p.total_amount ?? p.amount)}
                        strong
                      />
                      {!isCash && (
                        <>
                          {terminalLabel && <Line label="Terminal" value={terminalLabel} />}
                          <Line label="Transaction Type" value={txnType(p.status)} />
                          <Line label="Authorization" value={authLabel(p.status)} />
                          {p.authorization_code && (
                            <Line label="Approval Code" value={p.authorization_code} mono />
                          )}
                        </>
                      )}
                      {p.refunded_amount != null && Number(p.refunded_amount) > 0 && (
                        <Line label="Refunded" value={`−${fmt(p.refunded_amount)}`} />
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <Rule />

          {/* ── Footer ──────────────────────────────────────────── */}
          <div className="text-center">
            <p className="text-[13px] font-medium">Thank you for your order!</p>
            <p className="text-[12px] text-neutral-500 mt-0.5">We appreciate your business.</p>
          </div>
        </div>

        {/* Powered by Dexa — hidden on print */}
        <div className="no-print flex items-center justify-center gap-2 text-[12px] text-neutral-500">
          <span>Powered by</span>
          <span className="font-bold text-neutral-700 tracking-tight">Dexa POS</span>
          <span className="w-1 h-1 rounded-full bg-neutral-400" />
          <span>Digital Receipts</span>
        </div>
      </div>
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Rule() {
  return <div className="border-t border-neutral-200 my-4" />;
}

function Line({
  label,
  value,
  strong = false,
  mono = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between items-baseline gap-4">
      <span
        className={`text-[13px] min-w-0 wrap-break-word ${
          strong ? "font-semibold text-neutral-900" : "text-neutral-600"
        }`}
      >
        {label}
      </span>
      <span
        className={`text-[13px] tabular-nums shrink-0 text-right ${
          strong ? "font-semibold text-neutral-900" : "text-neutral-700"
        } ${mono ? "font-mono tracking-wider" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}
