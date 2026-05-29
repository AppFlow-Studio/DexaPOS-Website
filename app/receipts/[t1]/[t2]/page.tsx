import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { Metadata } from "next";
import Image from "next/image";

interface PageProps {
  params: Promise<{ t1: string; t2: string }>;
}

export async function generateMetadata(): Promise<Metadata> {
  return {
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
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function CardIcon() {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="14"
      viewBox="0 0 18 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="0.5" y="0.5" width="17" height="13" rx="2.5" stroke="currentColor" strokeOpacity="0.4" />
      <rect x="0" y="3" width="18" height="3" fill="currentColor" fillOpacity="0.15" />
      <rect x="2" y="8" width="5" height="1.5" rx="0.75" fill="currentColor" fillOpacity="0.5" />
      <rect x="8" y="8" width="3" height="1.5" rx="0.75" fill="currentColor" fillOpacity="0.5" />
    </svg>
  );
}

function CashIcon() {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="14"
      viewBox="0 0 18 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="0.5" y="0.5" width="17" height="13" rx="2.5" stroke="currentColor" strokeOpacity="0.4" />
      <circle cx="9" cy="7" r="2.5" stroke="currentColor" strokeOpacity="0.5" />
      <circle cx="2.5" cy="7" r="1" fill="currentColor" fillOpacity="0.3" />
      <circle cx="15.5" cy="7" r="1" fill="currentColor" fillOpacity="0.3" />
    </svg>
  );
}

function paymentLabel(p: Payment): { icon: "card" | "cash"; text: string } {
  if (p.payment_method === "cash") {
    return { icon: "cash", text: "Cash" };
  }
  if (p.card_last_four) {
    const brand = p.card_type
      ? p.card_type.charAt(0).toUpperCase() + p.card_type.slice(1).toLowerCase()
      : "Card";
    return { icon: "card", text: `${brand} ····${p.card_last_four}` };
  }
  return { icon: "card", text: p.payment_method ?? "Payment" };
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

function authStatus(status: string | null): { label: string; green: boolean } {
  if (status === "captured" || status === "paid") return { label: "Approved", green: true };
  if (status === "refunded" || status === "partially_refunded") return { label: "Refunded", green: false };
  if (status === "voided") return { label: "Voided", green: false };
  return { label: status ?? "—", green: false };
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
        * { box-sizing: border-box; }
        @media print {
          body { background: white !important; }
          .no-print { display: none !important; }
          .powered-footer { display: none !important; }
          .receipt-card {
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            max-width: 100% !important;
          }
        }
      `}</style>

      {/*
        Outer shell:
        - min-h-screen so the gradient always fills the viewport
        - flex col so the powered footer sits below the card naturally
        - py-4 on mobile → py-8 on sm+ to give breathing room
        - px-3 on mobile → px-4 on sm+ (card has its own horizontal limit)
      */}
      <div className="min-h-screen bg-linear-to-br from-slate-100 to-slate-200 flex flex-col items-center justify-start py-4 sm:py-8 px-3 sm:px-4 gap-4">

        {/*
          Card:
          - w-full so it fills the screen on tiny phones
          - max-w-sm caps it at ~384px on mobile, sm:max-w-md at ~448px on tablets/desktop
          - On a 375px iPhone 14 this leaves 12px margin each side — readable, not cramped
        */}
        <div className="receipt-card w-full max-w-sm sm:max-w-md bg-white rounded-2xl sm:rounded-3xl shadow-xl overflow-hidden border border-slate-100">

          {/* Status banner */}
          {(isVoided || isRefunded) && (
            <div className={`flex flex-wrap items-center justify-center gap-1.5 text-xs font-bold tracking-widest uppercase py-2.5 px-4 ${
              isVoided ? "bg-red-500 text-white" : "bg-amber-500 text-white"
            }`}>
              <span>{isVoided ? "⊘ Voided" : "↩ Refunded"}</span>
              {isVoided && order.void_reason ? (
                <span className="font-normal tracking-normal normal-case opacity-90">· {order.void_reason}</span>
              ) : null}
            </div>
          )}

          {/* ── Header ──────────────────────────────────────────── */}
          <div className="flex flex-col items-center pt-6 sm:pt-8 pb-4 sm:pb-5 px-4 sm:px-6 text-center bg-linear-to-b from-white to-slate-50">
            {logo_url ? (
              <div className="mb-3 sm:mb-4 rounded-xl sm:rounded-2xl overflow-hidden shadow-md ring-2 ring-slate-100 w-16 h-16 sm:w-20 sm:h-20 shrink-0">
                <Image
                  src={logo_url}
                  alt={location.name ?? "Store logo"}
                  width={80}
                  height={80}
                  className="object-cover w-full h-full"
                  unoptimized
                />
              </div>
            ) : (
              <div className="mb-3 sm:mb-4 w-16 h-16 sm:w-20 sm:h-20 rounded-xl sm:rounded-2xl bg-slate-100 flex items-center justify-center text-xl sm:text-2xl font-bold text-slate-400 shrink-0">
                {location.name?.charAt(0) ?? "S"}
              </div>
            )}
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight leading-tight">
              {location.name}
            </h1>
            {location.address_line1 && (
              <p className="text-xs text-slate-500 mt-1 leading-relaxed max-w-xs">
                {location.address_line1}
                {location.address_line2 ? `, ${location.address_line2}` : ""}
                {location.city ? `, ${location.city}` : ""}
                {location.state ? `, ${location.state}` : ""}
                {location.postal_code ? ` ${location.postal_code}` : ""}
              </p>
            )}
            {location.phone && (
              <p className="text-xs text-slate-400 mt-0.5">{location.phone}</p>
            )}
          </div>

          <Dash />

          {/* ── Order meta ──────────────────────────────────────── */}
          <div className="flex justify-between items-start gap-4 px-4 sm:px-6 py-3 sm:py-3.5">
            <div className="min-w-0">
              <Label>Order</Label>
              <p className="text-sm font-bold text-slate-800 mt-0.5 truncate">{orderNumber}</p>
            </div>
            <div className="text-right shrink-0">
              <Label>Date</Label>
              <p className="text-xs text-slate-600 mt-0.5 whitespace-nowrap">{fmtDatetime(order.created_at)}</p>
            </div>
          </div>

          <Dash />

          {/* ── Items ───────────────────────────────────────────── */}
          <div className="px-4 sm:px-6 py-3 sm:py-4 space-y-3">
            <Label className="block mb-2">Items</Label>
            {activeItems.map((item) => (
              <div key={item.id}>
                {/* Item row — quantity badge + name + price */}
                <div className="flex justify-between items-start gap-3">
                  <span className="text-sm text-slate-800 leading-snug flex-1 min-w-0 wrap-break-word">
                    {item.quantity && item.quantity > 1 ? (
                      <span className="inline-flex items-center justify-center text-[10px] font-bold bg-slate-100 text-slate-500 rounded-md px-1.5 py-0.5 mr-1.5 align-middle leading-none">
                        {item.quantity}×
                      </span>
                    ) : null}
                    {item.item_name ?? "Item"}
                  </span>
                  <span className="text-sm text-slate-800 tabular-nums font-medium shrink-0 pt-px">
                    {fmt(item.subtotal)}
                  </span>
                </div>

                {/* Modifiers */}
                {item.modifiers
                  .filter((m) => !m.is_no && m.modifier_name)
                  .map((m, idx) => (
                    <div
                      key={idx}
                      className="flex justify-between items-start gap-2 text-xs text-slate-400 pl-4 mt-1"
                    >
                      <span className="flex items-center gap-1 flex-1 min-w-0 wrap-break-word">
                        <span className="text-slate-300 shrink-0">└</span>
                        {m.modifier_name}
                      </span>
                      {m.price_modifier && Number(m.price_modifier) > 0 ? (
                        <span className="tabular-nums text-slate-500 shrink-0">
                          +{fmt(m.price_modifier)}
                        </span>
                      ) : null}
                    </div>
                  ))}
              </div>
            ))}
          </div>

          <Dash />

          {/* ── Totals ──────────────────────────────────────────── */}
          <div className="px-4 sm:px-6 py-3 sm:py-4 space-y-2">
            {order.subtotal != null && (
              <Row label="Subtotal" value={fmt(order.effective_subtotal ?? order.subtotal)} />
            )}
            {order.discount_amount != null && Number(order.discount_amount) > 0 && (
              <Row
                label="Discount"
                value={`−${fmt(order.discount_amount)}`}
                valueClassName="text-emerald-600 font-medium"
              />
            )}
            {order.service_charge != null && Number(order.service_charge) > 0 && (
              <Row label="Service charge" value={fmt(order.service_charge)} />
            )}
            {order.tax_amount != null && (
              <Row label="Tax" value={fmt(order.effective_tax_amount ?? order.tax_amount)} />
            )}
            {order.tip_amount != null && Number(order.tip_amount) > 0 && (
              <Row label="Tip" value={fmt(order.tip_amount)} />
            )}

            {/* Total pill */}
            <div className="pt-2">
              <div className="bg-slate-900 rounded-xl sm:rounded-2xl px-4 py-3 flex justify-between items-center">
                <span className="text-white font-semibold text-sm sm:text-base">Total</span>
                <span className="text-white font-bold text-lg sm:text-xl tabular-nums">
                  {fmt(chargedTotal)}
                </span>
              </div>
            </div>
          </div>

          {/* ── Payments ────────────────────────────────────────── */}
          {payments.length > 0 && (
            <>
              <Dash />
              <div className="px-4 sm:px-6 py-3 sm:py-4 space-y-4">
                <Label className="block">Payment</Label>
                {payments.map((p, idx) => {
                  const { icon, text } = paymentLabel(p);
                  const terminalLabel = fmtTerminalType(p.terminal_type);
                  const { label: authLabel, green: authGreen } = authStatus(p.status);
                  const isCash = p.payment_method === "cash";
                  return (
                    <div key={idx} className="space-y-2.5">
                      {/* Card/Cash header row */}
                      <div className="flex items-center justify-between gap-3 min-w-0">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div
                            className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0 ${
                              icon === "cash"
                                ? "bg-emerald-50 text-emerald-600"
                                : "bg-blue-50 text-blue-600"
                            }`}
                          >
                            {icon === "cash" ? <CashIcon /> : <CardIcon />}
                          </div>
                          <p className="text-sm font-semibold text-slate-800 truncate">{text}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold text-slate-800 tabular-nums">
                            {fmt(p.total_amount ?? p.amount)}
                          </p>
                          {p.refunded_amount != null && Number(p.refunded_amount) > 0 && (
                            <p className="text-xs text-amber-600 tabular-nums">
                              −{fmt(p.refunded_amount)} back
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Auth detail rows — only for card payments with data */}
                      {!isCash && (
                        <div className="bg-slate-50 rounded-xl px-3 py-2.5 space-y-1.5">
                          {terminalLabel && (
                            <DetailRow label="Terminal" value={terminalLabel} />
                          )}
                          <DetailRow label="Transaction" value={txnType(p.status)} />
                          <DetailRow
                            label="Authorization"
                            value={authLabel}
                            valueClassName={authGreen ? "text-emerald-600 font-semibold" : "text-amber-600 font-semibold"}
                          />
                          {p.authorization_code && (
                            <DetailRow
                              label="Auth Code"
                              value={p.authorization_code}
                              valueClassName="font-mono font-semibold text-slate-700 tracking-wider"
                            />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* ── Thank-you footer ────────────────────────────────── */}
          <Dash />
          <div className="text-center py-5 sm:py-6 px-4 sm:px-6">
            <p className="text-sm font-medium text-slate-600">Thank you for your order!</p>
            <p className="text-xs text-slate-400 mt-0.5">We appreciate your business.</p>
          </div>
        </div>

        {/* Powered by Dexa — hidden on print */}
        <div className="powered-footer no-print flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 py-2 px-4 rounded-full bg-white/70 backdrop-blur border border-slate-200 shadow-sm">
          <span className="text-xs text-slate-400">Powered by</span>
          <span className="text-xs font-bold text-slate-700 tracking-tight">Dexa POS</span>
          <span className="w-1 h-1 rounded-full bg-slate-300" />
          <span className="text-xs text-slate-400">Digital Receipts</span>
        </div>
      </div>
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Dash() {
  return (
    <div className="px-4 sm:px-6">
      <div className="border-t border-dashed border-slate-200" />
    </div>
  );
}

function Label({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={`text-[10px] font-semibold tracking-widest text-slate-400 uppercase ${className}`}>
      {children}
    </p>
  );
}

function Row({
  label,
  value,
  valueClassName = "text-slate-600",
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex justify-between items-center gap-4">
      <span className="text-xs text-slate-500 min-w-0">{label}</span>
      <span className={`tabular-nums text-sm shrink-0 ${valueClassName}`}>{value}</span>
    </div>
  );
}

function DetailRow({
  label,
  value,
  valueClassName = "text-slate-600",
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex justify-between items-center gap-3">
      <span className="text-xs text-slate-400 shrink-0">{label}</span>
      <span className={`text-xs ${valueClassName}`}>{value}</span>
    </div>
  );
}
