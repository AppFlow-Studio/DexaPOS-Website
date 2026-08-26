import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { Metadata } from "next";
import Image from "next/image";
import { formatReceiptDateTime } from "@/lib/receipts/format";
import {
  toReceiptData,
  type RawPublicReceipt,
  type ReceiptContractItem,
  type ReceiptContractPayment,
} from "@/lib/receipts/contract";
import { getOrderBreakdown } from "@/lib/orders/order-breakdown";
import type { OrderPayment } from "@/types/order-management";

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
  const receipt = data as RawPublicReceipt | null;
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
//
// This page renders from the shared receipt contract (lib/receipts/contract.ts)
// — the same contract the dashboard receipt and the email receipt consume — so
// header, dates, and totals stay identical across surfaces. The RPC returns the
// raw shape (RawPublicReceipt); toReceiptData() normalizes it (resolving the
// single header block) into ReceiptData for rendering.

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(amount: number | null | undefined): string {
  if (amount == null) return "$0.00";
  return `$${Number(amount).toFixed(2)}`;
}

function paymentBrand(p: ReceiptContractPayment): string {
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

  // Normalize the raw RPC response into the shared receipt contract. This
  // resolves the single header block (template header_text → else location
  // record) — the same precedence the dashboard receipt uses.
  const receipt = toReceiptData(data as RawPublicReceipt);
  const { order, location, header, logo_url, items, payments } = receipt;

  const orderNumber = order.display_number
    ? order.display_number
    : order.order_number
    ? `#${order.order_number}`
    : "—";

  const isVoided = !!order.voided_at;
  const isRefunded = order.payment_status === "refunded";

  // Single source of truth for totals — the same lane resolver the dashboard
  // receipt uses. Every total line comes from one self-consistent pricing track
  // so the receipt foots on dual / mixed-tender orders.
  const breakdown = getOrderBreakdown(order, payments as unknown as OrderPayment[]);
  const lane = breakdown.primary;
  const laneLabel = breakdown.display === "cash" ? "Cash" : "Card";
  const grandTotal =
    breakdown.isMixed && lane.amountPaid > 0 ? lane.amountPaid : lane.total + lane.tip;

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
        <div className="receipt-paper w-full  bg-white shadow-[0_6px_24px_rgba(0,0,0,0.10)] text-neutral-900 px-7 pt-8 pb-7">

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
              // Height-driven, not a fixed square: `h-30 w-auto` (120px) scales
              // a logo of any aspect up to the target height, while `max-w-[70%]`
              // stops a wide mark from spanning the whole receipt. `max-h`
              // alone would only cap — it never scales a small asset up.
              <Image
                src={logo_url}
                alt={location.name ?? "Store logo"}
                width={240}
                height={120}
                className="object-contain h-30 w-auto max-w-[70%] mb-3"
                unoptimized
              />
            ) : null}
            <h1 className="text-lg font-bold tracking-wide leading-tight wrap-break-word">
              {header.name}
            </h1>
            {header.source === "template" ? (
              header.rawText && (
                <p className="text-[13px] text-neutral-600 mt-1.5 leading-relaxed whitespace-pre-line">
                  {header.rawText}
                </p>
              )
            ) : (
              <>
                {header.addressLines.length > 0 && (
                  <p className="text-[13px] text-neutral-600 mt-1.5 leading-relaxed whitespace-pre-line">
                    {header.addressLines.join("\n")}
                  </p>
                )}
                {header.phone && (
                  <p className="text-[13px] text-neutral-600 mt-1">{header.phone}</p>
                )}
              </>
            )}
          </div>

          <Rule />

          {/* ── Order meta ──────────────────────────────────────── */}
          <div className="space-y-1">
            <Line label="Order" value={orderNumber} strong />
            <Line label="Ordered" value={formatReceiptDateTime(order.created_at, location.timezone)} />
          </div>

          <Rule />

          {/* ── Items (seat/course grouping when present, matching dashboard) ── */}
          <div className="space-y-3">
            {groupItemsBySeatCourse(activeItems, order.order_type).map((grp) => (
              <div key={grp.key}>
                {grp.label && (
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-600 mb-1">
                    {grp.label}
                  </div>
                )}
                {grp.items.map((item) => (
                  <ItemRow key={item.id} item={item} />
                ))}
              </div>
            ))}
          </div>

          <Rule />

          {/* ── Totals — single footing pricing lane (shared getOrderBreakdown) ── */}
          <div className="space-y-1.5">
            <Line label="Subtotal" value={fmt(lane.subtotal)} />
            {lane.discount > 0 && (
              <Line label="Discount" value={`−${fmt(lane.discount)}`} />
            )}
            {lane.serviceCharge > 0 && (
              <Line label="Service Charge" value={fmt(lane.serviceCharge)} />
            )}
            {lane.tax > 0 && <Line label="Tax" value={fmt(lane.tax)} />}
            {lane.tip > 0 && <Line label="Tip" value={fmt(lane.tip)} />}
            {breakdown.mixedCashDiscount > 0 && (
              <Line label="Cash Discount" value={`−${fmt(breakdown.mixedCashDiscount)}`} />
            )}

            <div className="flex justify-between items-baseline pt-2.5 mt-1.5 border-t border-neutral-300">
              <span className="text-[15px] font-bold uppercase tracking-wide">
                {breakdown.isMixed ? "Total" : breakdown.dual ? `Total (${laneLabel})` : "Total"}
              </span>
              <span className="text-[15px] font-bold tabular-nums">{fmt(grandTotal)}</span>
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

                {/* Reconciliation — matches dashboard */}
                {lane.amountPaid > 0 && (
                  <div className="pt-1.5 border-t border-dashed border-neutral-300">
                    <Line label="Amount Paid" value={fmt(lane.amountPaid)} strong />
                  </div>
                )}
                {lane.amountDue > 0 && (
                  <Line label="Amount Due" value={fmt(lane.amountDue)} />
                )}
              </div>
            </>
          )}

          <Rule />

          {/* ── Footer — template footer_text, matching dashboard ─────────── */}
          <div className="text-center">
            {receipt.footerText ? (
              <p className="text-[13px] whitespace-pre-line">{receipt.footerText}</p>
            ) : (
              <>
                <p className="text-[13px] font-medium">Thank you for your order!</p>
                <p className="text-[12px] text-neutral-500 mt-0.5">We appreciate your business.</p>
              </>
            )}
            <p className="text-[12px] text-neutral-500 mt-2">
              {formatReceiptDateTime(order.created_at, location.timezone)}
            </p>
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

/**
 * Group items by seat · course for dine-in orders that carry that context,
 * mirroring the dashboard receipt. Returns a single unlabeled group otherwise.
 */
function groupItemsBySeatCourse(
  items: ReceiptContractItem[],
  orderType: string | null | undefined
): { key: string; label: string | null; items: ReceiptContractItem[] }[] {
  const hasSeatCourse =
    orderType === "dine_in" &&
    items.some((i) => i.seat_number != null || i.course_number != null);

  if (!hasSeatCourse) {
    return [{ key: "all", label: null, items }];
  }

  const order: string[] = [];
  const byGroup = new Map<string, ReceiptContractItem[]>();
  for (const it of items) {
    const seat = it.seat_number != null ? `Seat ${it.seat_number}` : null;
    const course = it.course_number != null ? `Course ${it.course_number}` : null;
    const label = [seat, course].filter(Boolean).join(" · ") || "Other";
    if (!byGroup.has(label)) {
      byGroup.set(label, []);
      order.push(label);
    }
    byGroup.get(label)!.push(it);
  }
  return order.map((label) => ({ key: label, label, items: byGroup.get(label)! }));
}

/** One item line with size, grouped modifiers (+price), per-item discount, and notes. */
function ItemRow({ item }: { item: ReceiptContractItem }) {
  const mods = item.modifiers.filter((m) => !m.is_no && m.modifier_name);
  return (
    <div className="mb-2">
      <div className="flex justify-between items-start gap-3">
        <span className="text-[14px] leading-snug flex-1 min-w-0 wrap-break-word">
          <span className="tabular-nums">{item.quantity ?? 1}</span>
          {"  "}
          {item.item_name ?? "Item"}
        </span>
        <span className="text-[14px] tabular-nums shrink-0 pt-px">{fmt(item.subtotal)}</span>
      </div>

      {item.selected_size_name && (
        <div className="text-[12.5px] text-neutral-500 pl-5 mt-0.5">
          Size: {item.selected_size_name}
        </div>
      )}

      {mods.map((m, idx) => (
        <div
          key={m.id ?? idx}
          className="flex justify-between items-start gap-2 text-[12.5px] text-neutral-500 pl-5 mt-0.5"
        >
          <span className="flex-1 min-w-0 wrap-break-word">
            {m.modifier_name}
            {m.quantity && Number(m.quantity) > 1 ? ` (×${m.quantity})` : ""}
          </span>
          {m.price_modifier && Number(m.price_modifier) !== 0 ? (
            <span className="tabular-nums shrink-0">
              +{fmt(Number(m.price_modifier) * Number(m.quantity ?? 1))}
            </span>
          ) : null}
        </div>
      ))}

      {item.discount_amount != null && Number(item.discount_amount) > 0 && (
        <div className="flex justify-between items-start gap-2 text-[12.5px] text-emerald-700 pl-5 mt-0.5">
          <span className="flex-1 min-w-0 wrap-break-word">{item.discount_name || "Discount"}</span>
          <span className="tabular-nums shrink-0">−{fmt(item.discount_amount)}</span>
        </div>
      )}

      {item.special_instructions && (
        <div className="text-[12.5px] text-neutral-500 italic pl-5 mt-0.5">
          Note: {item.special_instructions}
        </div>
      )}
    </div>
  );
}
