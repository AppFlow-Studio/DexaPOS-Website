"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  OrderResponse,
  OrderItem,
  OrderPayment,
  OrderItemModifier,
} from "@/types/order-management";
import { Location } from "@/types/merchant_locations";
import { X, RotateCcw, Ban, Printer } from "lucide-react";
import { cn } from "@/lib/utils";
import { RefundVoidDialog } from "./RefundVoidDialog";
import { GetSessionTableLabel } from "@/app/dashboard/actions/order";
import {
  getReceiptTemplate,
  type ReceiptTemplate,
} from "@/app/dashboard/actions/receipt-templates";
import { getOrderBreakdown } from "@/lib/orders/order-breakdown";
import { resolveReceiptHeader } from "@/lib/receipts/header";
import { formatReceiptDateTime } from "@/lib/receipts/format";
import { useQuery } from "@tanstack/react-query";

interface ReceiptModalProps {
  order: OrderResponse;
  location: Location | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Format currency
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
}

// Get payment method display name
function getPaymentMethodName(method: string): string {
  const methods: Record<string, string> = {
    cash: "Cash",
    card_spinapi: "Card",
    card_dvpaylite: "Card",
    card_manual: "Card",
    gift_card: "Gift Card",
    house_account: "House Account",
    external: "External",
  };
  return methods[method] || method.replace("_", " ");
}

// Format a staff name from the various shapes the API returns.
function formatStaffName(
  s?: { first_name?: string; last_name?: string; display_name?: string } | null
): string | null {
  if (!s) return null;
  if (s.display_name) return s.display_name;
  const full = [s.first_name, s.last_name].filter(Boolean).join(" ").trim();
  return full || null;
}

// Group an item's modifiers by modifier_group_name, preserving order.
function groupModifiers(
  mods: OrderItemModifier[]
): { group: string; mods: OrderItemModifier[] }[] {
  const groups: { group: string; mods: OrderItemModifier[] }[] = [];
  const byName = new Map<string, OrderItemModifier[]>();
  for (const m of mods) {
    const key = m.modifier_group_name || "";
    if (!byName.has(key)) {
      const arr: OrderItemModifier[] = [];
      byName.set(key, arr);
      groups.push({ group: key, mods: arr });
    }
    byName.get(key)!.push(m);
  }
  return groups;
}

// Render a single order item's body (name/qty/price, modifiers, discount, note).
type ReceiptItem = OrderItem & { order_item_modifiers?: OrderItemModifier[] };

function ReceiptItemRow({
  item,
  showMods,
  modsLarge,
}: {
  item: ReceiptItem;
  showMods: boolean;
  modsLarge: boolean;
}) {
  const name = item.is_open_item
    ? item.open_item_name || item.item_name
    : item.item_name;
  const grouped = groupModifiers(item.order_item_modifiers || []);
  return (
    <div className="item-row mb-2">
      <div className="item-main flex justify-between">
        <span
          className={cn(
            "item-name flex-1 pr-2",
            item.is_voided && "line-through text-zinc-400"
          )}
        >
          {item.quantity > 1 && `${item.quantity}x `}
          {name}
          {item.is_voided && (
            <span className="text-red-500 ml-1 no-underline">(VOID)</span>
          )}
        </span>
        <span
          className={cn(
            "item-price whitespace-nowrap",
            item.is_voided && "line-through text-zinc-400"
          )}
        >
          {formatCurrency(item.subtotal)}
        </span>
      </div>
      {item.selected_size_name && (
        <div className="item-modifier text-[10px] pl-3 text-zinc-500 dark:text-zinc-400">
          Size: {item.selected_size_name}
        </div>
      )}
      {showMods &&
        grouped.map(({ group, mods }) => (
          <div key={group || "ungrouped"} className="pl-3">
            {group && (
              <div
                className={cn(
                  "text-zinc-500 dark:text-zinc-400 uppercase tracking-wide",
                  modsLarge ? "text-[11px]" : "text-[9px]"
                )}
              >
                {group}
              </div>
            )}
            {mods.map((mod) => (
              <div
                key={mod.id}
                className={cn(
                  "item-modifier pl-2 text-zinc-500 dark:text-zinc-400 flex justify-between",
                  modsLarge ? "text-[12px]" : "text-[10px]"
                )}
              >
                <span>
                  + {mod.modifier_name}
                  {mod.quantity > 1 && ` (×${mod.quantity})`}
                </span>
                {mod.price_modifier !== 0 && (
                  <span>{formatCurrency(mod.price_modifier * mod.quantity)}</span>
                )}
              </div>
            ))}
          </div>
        ))}
      {item.discount_amount != null && item.discount_amount > 0 && (
        <div className="item-modifier text-[10px] pl-3 text-green-600 dark:text-green-400 flex justify-between">
          <span>{item.discount_name || "Discount"}</span>
          <span>-{formatCurrency(item.discount_amount)}</span>
        </div>
      )}
      {item.special_instructions && (
        <div className="item-modifier text-[10px] pl-3 text-zinc-500 dark:text-zinc-400 italic">
          Note: {item.special_instructions}
        </div>
      )}
    </div>
  );
}

// Torn edge SVG for top
function TornEdgeTop() {
  return (
    <svg
      className="absolute -top-2 left-0 w-full h-3 text-[#faf9f6] dark:text-zinc-900"
      viewBox="0 0 400 12"
      preserveAspectRatio="none"
    >
      <path
        d="M0,12 L0,6 Q10,8 20,6 T40,6 T60,6 T80,6 T100,6 T120,6 T140,6 T160,6 T180,6 T200,6 T220,6 T240,6 T260,6 T280,6 T300,6 T320,6 T340,6 T360,6 T380,6 T400,6 L400,12 Z"
        fill="currentColor"
      />
    </svg>
  );
}

// Torn edge SVG for bottom
function TornEdgeBottom() {
  return (
    <svg
      className="absolute -bottom-2 left-0 w-full h-3 text-[#faf9f6] dark:text-zinc-900"
      viewBox="0 0 400 12"
      preserveAspectRatio="none"
    >
      <path
        d="M0,0 L0,6 Q10,4 20,6 T40,6 T60,6 T80,6 T100,6 T120,6 T140,6 T160,6 T180,6 T200,6 T220,6 T240,6 T260,6 T280,6 T300,6 T320,6 T340,6 T360,6 T380,6 T400,6 L400,0 Z"
        fill="currentColor"
      />
    </svg>
  );
}

// Dotted separator line
function DottedLine() {
  return (
    <div className="border-b border-dashed border-zinc-400 dark:border-zinc-600 my-2" />
  );
}

// Double line separator
function DoubleLine() {
  return (
    <div className="my-2">
      <div className="border-b border-zinc-400 dark:border-zinc-600" />
      <div className="border-b border-zinc-400 dark:border-zinc-600 mt-0.5" />
    </div>
  );
}

export function ReceiptModal({
  order,
  location,
  open,
  onOpenChange,
  showAdminActions = false,
  onOrderUpdate,
}: ReceiptModalProps & { showAdminActions?: boolean; onOrderUpdate?: () => void }) {
  // The refund/void requests themselves now live in RefundVoidDialog, which
  // also owns its in-flight state.
  const [confirmRefundOpen, setConfirmRefundOpen] = React.useState(false);
  const [confirmVoidOpen, setConfirmVoidOpen] = React.useState(false);

  const items = (order.order_items || []) as ReceiptItem[];
  const payments = (order.order_payments || []) as OrderPayment[];
  // Store-local order date, one format, used for both the body and footer.
  const orderDateTime = formatReceiptDateTime(order.created_at, location?.timezone);

  const orderAny = order as unknown as Record<string, any>;
  const sessionId: string | undefined = orderAny.session_id ?? undefined;
  const locationId = location?.id ?? order.location_id;
  const isDineIn =
    order.order_type === "dine_in" || order.order_type === "qr_dine_in";

  // ─── Config-driven presentation (receipt_templates → sale template) ───
  const { data: template } = useQuery<ReceiptTemplate | null>({
    queryKey: ["receipt-template", locationId, "sale"],
    queryFn: async () => {
      if (!locationId) return null;
      const res = await getReceiptTemplate(locationId, "sale");
      return (res?.data as ReceiptTemplate | null) ?? null;
    },
    enabled: open && !!locationId,
    staleTime: 60_000,
  });

  const showMods = template ? template.show_item_modifiers : true;
  const showTip = template ? template.show_tip_line : true;
  const showTaxBreakdown = template ? template.show_tax_breakdown : true;
  const showServer = template ? template.show_server_name : true;
  const showOrderType = template ? template.show_order_type : true;
  const modsLarge = template?.show_mods_large ?? false;
  const headerText = template?.header_text || null;
  const footerText = template?.footer_text || null;

  // ─── Merged-table label resolution (one session, many physical tables) ───
  const { data: tableLabelData } = useQuery({
    queryKey: ["session-table-label", sessionId],
    queryFn: () => GetSessionTableLabel(sessionId as string),
    enabled: open && order.order_type === "dine_in" && !!sessionId,
    staleTime: 60_000,
  });

  const tableLabel =
    tableLabelData?.label ??
    (order.table_number ? `Table ${order.table_number}` : null);

  // ─── Header context ───
  const serverName =
    formatStaffName(order.assigned_server) ??
    formatStaffName(order.table_sessions?.[0]?.server);
  const partySize = order.table_sessions?.[0]?.party_size;
  const deliveryAddress = (() => {
    const a = orderAny.delivery_address;
    if (!a) return null;
    if (typeof a === "string") return a;
    return [a.line1, a.line2, a.city, a.state, a.postal_code]
      .filter(Boolean)
      .join(", ");
  })();
  const scheduledTime: string | undefined =
    orderAny.scheduled_at ?? orderAny.scheduled_time ?? undefined;

  // ─── Single-track breakdown (shared helper across all order surfaces) ───
  // Every total line is sourced from one pricing lane so the receipt foots.
  const breakdown = getOrderBreakdown(order, payments);
  const lane = breakdown.primary;
  const laneLabel = breakdown.display === "cash" ? "Cash" : "Card";

  // Get completed payments only
  const completedPayments = payments.filter(
    (p) => p.status === "captured" || p.status === "paid"
  );

  // ─── Single resolved header block (template header_text → else location) ───
  // One block only — never location fields AND header_text together.
  const header = resolveReceiptHeader(location, headerText);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Print isolation: the dialog renders in a portal on top of the page, so
          printing would otherwise emit the dashboard behind it. Collapsing the
          app root and un-clipping the dialog's scroll box leaves just the
          receipt paper on the sheet, at its natural full height. */}
      <style>{`
        @media print {
          body > *:not([data-slot="dialog-portal"]) { display: none !important; }
          [data-slot="dialog-overlay"] { display: none !important; }
          [data-slot="dialog-content"] {
            position: static !important;
            transform: none !important;
            max-height: none !important;
            width: auto !important;
            max-width: none !important;
            /* The panel chrome is screen-only: on paper the receipt must sit
               alone, with no card background, border or rounded corner. */
            display: block !important;
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            overflow: visible !important;
          }
          .no-print { display: none !important; }
          .receipt-scroll {
            overflow: visible !important;
            max-height: none !important;
            padding: 0 !important;
          }
          .receipt-paper {
            box-shadow: none !important;
            max-width: 100% !important;
          }
        }
      `}</style>
      {/* One connected panel: the DialogContent owns the surface and the rounded
          corner, clips, and never scrolls. Header and footer are flex-fixed
          siblings of the single scroll area (see §"Overlay scroll structure" in
          docs/UI-DESIGN-SYSTEM.md). */}
      <DialogContent
        className="sm:max-w-md p-0 gap-0 flex flex-col overflow-hidden max-h-[88vh] bg-[#faf9f6] dark:bg-zinc-900"
        showCloseButton={false}
        elevation="above-sheet"
      >
        <DialogHeader className="no-print shrink-0 flex-row items-baseline gap-2 px-5 py-4">
          <DialogTitle className="text-base">Receipt</DialogTitle>
          <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
            {order.display_number || order.order_number}
          </span>
        </DialogHeader>

        {/* The only scroller. Padding lives on the inner wrapper so the
            scrollbar tracks the panel edge instead of floating in dead space
            beside the paper. */}
        <div className="receipt-scroll thin-scrollbar relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain">
          <div className="px-5 pb-5">

          {/* Receipt Paper */}
          <div
            className={cn(
              "receipt-paper relative mx-auto w-full max-w-[350px]",
              "bg-[#faf9f6] dark:bg-zinc-900",
              "font-mono text-xs leading-relaxed",
              "text-zinc-800 dark:text-zinc-200",
              "px-4 py-6",
              "shadow-lg",
              // Paper texture effect
              "before:absolute before:inset-0 before:bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPjxyZWN0IHdpZHRoPSI0IiBoZWlnaHQ9IjQiIGZpbGw9IiNmYWY5ZjYiLz48cmVjdCB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSJyZ2JhKDAsMCwwLDAuMDIpIi8+PC9zdmc+')] before:opacity-50 before:pointer-events-none"
            )}
          >
            <TornEdgeTop />
            <TornEdgeBottom />

            {/* Business Header — exactly one resolved block */}
            <div className="receipt-header text-center mb-4 relative z-10">
              <h2 className="business-name text-base font-semibold tracking-tight">
                {header.name || "Restaurant Name"}
              </h2>
              {header.source === "template" ? (
                header.rawText && (
                  <p className="business-address text-[10px] text-zinc-600 dark:text-zinc-400 whitespace-pre-line mt-1">
                    {header.rawText}
                  </p>
                )
              ) : (
                <>
                  {header.addressLines.length > 0 && (
                    <p className="business-address text-[10px] text-zinc-600 dark:text-zinc-400 whitespace-pre-line mt-1">
                      {header.addressLines.join("\n")}
                    </p>
                  )}
                  {header.phone && (
                    <p className="text-[10px] text-zinc-600 dark:text-zinc-400">
                      {header.phone}
                    </p>
                  )}
                </>
              )}
            </div>

            <DottedLine />

            {/* Order Info */}
            <div className="order-info space-y-1 relative z-10">
              <div className="order-info-row flex justify-between">
                <span>Order #:</span>
                <span className="font-medium">
                  {order.display_number || order.order_number}
                </span>
              </div>
              <div className="order-info-row flex justify-between">
                <span>Date:</span>
                <span>{orderDateTime}</span>
              </div>
              {showOrderType && (
                <div className="order-info-row flex justify-between">
                  <span>Type:</span>
                  <span className="capitalize">
                    {order.order_type.replace(/_/g, " ")}
                  </span>
                </div>
              )}

              {/* Order-type header matrix */}
              {isDineIn && tableLabel && (
                <div className="order-info-row flex justify-between">
                  <span>{tableLabel.startsWith("Tables") ? "Tables:" : "Table:"}</span>
                  <span>{tableLabel.replace(/^Tables?\s/, "")}</span>
                </div>
              )}
              {order.order_type === "dine_in" && partySize ? (
                <div className="order-info-row flex justify-between">
                  <span>Guests:</span>
                  <span>{partySize}</span>
                </div>
              ) : null}
              {showServer && isDineIn && serverName && (
                <div className="order-info-row flex justify-between">
                  <span>Server:</span>
                  <span>{serverName}</span>
                </div>
              )}
              {order.customer_name && (
                <div className="order-info-row flex justify-between">
                  <span>Customer:</span>
                  <span>{order.customer_name}</span>
                </div>
              )}
              {(order.order_type === "takeout" ||
                order.order_type === "delivery") &&
                order.customer_phone && (
                  <div className="order-info-row flex justify-between">
                    <span>Phone:</span>
                    <span>{order.customer_phone}</span>
                  </div>
                )}
              {order.order_type === "delivery" && deliveryAddress && (
                <div className="order-info-row flex justify-between gap-4">
                  <span className="shrink-0">Deliver to:</span>
                  <span className="text-right">{deliveryAddress}</span>
                </div>
              )}
              {order.order_type === "catering" && scheduledTime && (
                <div className="order-info-row flex justify-between">
                  <span>Scheduled:</span>
                  <span>
                    {new Date(scheduledTime).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              )}
            </div>

            <DoubleLine />

            {/* Items */}
            <div className="items-section relative z-10">
              {(() => {
                // Group dine-in items by seat / course when that context exists.
                const hasSeatCourse =
                  order.order_type === "dine_in" &&
                  items.some(
                    (i) => i.seat_number != null || i.course_number != null
                  );

                if (!hasSeatCourse) {
                  return items.map((item) => (
                    <ReceiptItemRow
                      key={item.id}
                      item={item}
                      showMods={showMods}
                      modsLarge={modsLarge}
                    />
                  ));
                }

                const groupKey = (i: ReceiptItem) => {
                  const seat = i.seat_number != null ? `Seat ${i.seat_number}` : null;
                  const course =
                    i.course_number != null ? `Course ${i.course_number}` : null;
                  return [seat, course].filter(Boolean).join(" · ") || "Other";
                };
                const order_: string[] = [];
                const byGroup = new Map<string, ReceiptItem[]>();
                for (const it of items) {
                  const k = groupKey(it);
                  if (!byGroup.has(k)) {
                    byGroup.set(k, []);
                    order_.push(k);
                  }
                  byGroup.get(k)!.push(it);
                }
                return order_.map((k) => (
                  <div key={k} className="mb-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300 mb-1">
                      {k}
                    </div>
                    {byGroup.get(k)!.map((item) => (
                      <ReceiptItemRow
                        key={item.id}
                        item={item}
                        showMods={showMods}
                        modsLarge={modsLarge}
                      />
                    ))}
                  </div>
                ));
              })()}
            </div>

            <DottedLine />

            {/* Totals — single pricing lane, always foots to the displayed total */}
            <div className="totals-section space-y-1 relative z-10">
              <div className="totals-row flex justify-between">
                <span>Subtotal</span>
                <span>{formatCurrency(lane.subtotal)}</span>
              </div>
              {lane.discount > 0 && (
                <div className="totals-row flex justify-between text-green-600 dark:text-green-400">
                  <span>Discount</span>
                  <span>-{formatCurrency(lane.discount)}</span>
                </div>
              )}
              {lane.serviceCharge > 0 && (
                <div className="totals-row flex justify-between">
                  <span>Service Charge</span>
                  <span>{formatCurrency(lane.serviceCharge)}</span>
                </div>
              )}
              {showTaxBreakdown && lane.tax > 0 && (
                <div className="totals-row flex justify-between">
                  <span>Tax</span>
                  <span>{formatCurrency(lane.tax)}</span>
                </div>
              )}
              {showTip && lane.tip > 0 && (
                <div className="totals-row flex justify-between">
                  <span>Tip</span>
                  <span>{formatCurrency(lane.tip)}</span>
                </div>
              )}
              {breakdown.mixedCashDiscount > 0 && (
                <div className="totals-row flex justify-between text-green-600 dark:text-green-400">
                  <span>Cash Discount</span>
                  <span>-{formatCurrency(breakdown.mixedCashDiscount)}</span>
                </div>
              )}

              {/* Grand total — collected amount for split tenders, else lane total */}
              <div
                className={cn(
                  "totals-row grand-total flex justify-between font-semibold text-sm pt-2 border-t border-zinc-300 dark:border-zinc-700",
                  !breakdown.isMixed && breakdown.display === "card" && "text-[#0C4FD1]"
                )}
              >
                <span>
                  {breakdown.isMixed
                    ? "TOTAL"
                    : breakdown.dual
                    ? `TOTAL (${laneLabel})`
                    : "TOTAL"}
                </span>
                <span>
                  {formatCurrency(
                    breakdown.isMixed && lane.amountPaid > 0
                      ? lane.amountPaid
                      : lane.total + lane.tip
                  )}
                </span>
              </div>
            </div>

            {/* Payments */}
            {completedPayments.length > 0 && (
              <>
                <DottedLine />
                <div className="payment-section relative z-10">
                  <div className="text-center text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
                    Payment
                  </div>
                  {completedPayments.map((payment) => (
                    <div key={payment.id} className="flex justify-between">
                      <span>
                        {getPaymentMethodName(payment.payment_method)}
                        {payment.card_last_four &&
                          ` ****${payment.card_last_four}`}
                      </span>
                      <span>{formatCurrency(payment.total_amount)}</span>
                    </div>
                  ))}
                  {order.amount_paid > 0 && (
                    <div className="flex justify-between mt-1 pt-1 border-t border-dashed border-zinc-300 dark:border-zinc-600">
                      <span>Amount Paid</span>
                      <span>{formatCurrency(order.amount_paid)}</span>
                    </div>
                  )}
                  {order.amount_due > 0 && (
                    <div className="flex justify-between text-amber-600 dark:text-amber-400">
                      <span>Amount Due</span>
                      <span>{formatCurrency(order.amount_due)}</span>
                    </div>
                  )}
                </div>
              </>
            )}

            <DoubleLine />

            {/* Footer */}
            <div className="footer text-center relative z-10">
              {footerText ? (
                <p className="text-[11px] text-zinc-600 dark:text-zinc-300 whitespace-pre-line">
                  {footerText}
                </p>
              ) : (
                <>
                  <p className="footer-thanks font-medium">Thank You!</p>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                    We appreciate your business
                  </p>
                </>
              )}
              <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-2">
                {orderDateTime}
              </p>
            </div>
          </div>
          </div>
        </div>

        {/* Action Buttons — part of the panel, hidden while printing. No
            border-t or tint: the footer shares the panel's paper colour, so a
            divider or a grey band would read as a seam across one surface. */}
        <div className="no-print shrink-0 flex flex-wrap gap-2 justify-end px-5 py-3">
          {showAdminActions && order.status !== 'refunded' && order.status !== 'void' && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="mr-auto text-amber-600 border-amber-200 hover:bg-amber-50 dark:border-amber-900/50 dark:hover:bg-amber-950/40"
                onClick={() => setConfirmRefundOpen(true)}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Refund
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-red-600 border-red-200 hover:bg-red-50 dark:border-red-900/50 dark:hover:bg-red-950/40"
                onClick={() => setConfirmVoidOpen(true)}
              >
                <Ban className="h-4 w-4 mr-2" />
                Void
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4 mr-2" />
            Close
          </Button>
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
        </div>

      </DialogContent>

      {/* Confirmations live OUTSIDE DialogContent. Nested inside, they portal
          beneath this dialog's overlay and render greyed-out and unclickable. */}
      <RefundVoidDialog
        order={order}
        action="refund"
        open={confirmRefundOpen}
        onOpenChange={setConfirmRefundOpen}
        onCompleted={() => {
          onOrderUpdate?.();
          onOpenChange(false);
        }}
      />
      <RefundVoidDialog
        order={order}
        action="void"
        open={confirmVoidOpen}
        onOpenChange={setConfirmVoidOpen}
        onCompleted={() => {
          onOrderUpdate?.();
          onOpenChange(false);
        }}
      />
    </Dialog>
  );
}
