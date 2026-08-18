"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Receipt, LogIn, UtensilsCrossed, RotateCcw } from "lucide-react";
import { useSession } from "../hooks/useSession";
import { getOrderHistory, type OrderHistoryEntry } from "../order-actions";
import { useStorefrontPath } from "../lib/use-storefront-path";
import { useCart } from "../hooks/useCart";
import type { StorefrontItem, StorefrontModifierOption } from "@/types/storefront";
import { AuthDialog } from "./AuthDialog";

interface OrdersPanelProps {
  slug: string;
  storeConfigId?: string;
}

// Standardized status pill tokens
const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  pending:         { label: "Pending",     bg: "#fef3c7", text: "#92400e" },
  accepted:        { label: "Accepted",    bg: "#dbeafe", text: "#1e40af" },
  sent_to_kitchen: { label: "In Kitchen",  bg: "#ede9fe", text: "#5b21b6" },
  preparing:       { label: "Preparing",   bg: "#ffedd5", text: "#9a3412" },
  ready:           { label: "Ready",       bg: "#fef3c7", text: "#92400e" },
  completed:       { label: "Completed",   bg: "#dcfce7", text: "#166534" },
  cancelled:       { label: "Cancelled",   bg: "#f3f4f6", text: "#374151" },
  void:            { label: "Voided",      bg: "#f3f4f6", text: "#374151" },
  refunded:        { label: "Refunded",    bg: "#dbeafe", text: "#1e40af" },
};

const ACTIVE_STATUSES = new Set(["pending", "accepted", "sent_to_kitchen", "preparing", "ready"]);
const LIVE_STATUSES   = new Set(["accepted", "sent_to_kitchen", "preparing"]);

function StatusPill({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, bg: "#f3f4f6", text: "#374151" };
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 text-[11px] font-semibold leading-none"
      style={{
        backgroundColor: cfg.bg,
        color: cfg.text,
        borderRadius: "6px",
        height: "22px",
        whiteSpace: "nowrap",
      }}
    >
      {cfg.label}
    </span>
  );
}

function ReorderButton({ order, slug }: { order: OrderHistoryEntry; slug: string }) {
  const { addItem } = useCart();
  const storePath = useStorefrontPath(slug);
  const [added, setAdded] = useState(false);

  const handleReorder = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    let added = 0;
    let skipped = 0;

    for (const item of order.items) {
      // Skip items missing menu_item_id (open items, legacy rows, deleted
      // menu items). Re-adding them would break the cart→server price
      // cascade and dedup, since the checkout RPC needs a real menu_items.id.
      if (!item.menuItemId) {
        skipped++;
        continue;
      }

      // unit_price as stored is the BASE price PLUS modifier total. Strip
      // modifier total so we re-add the bare item; addItem then re-adds the
      // modifier prices so the final cart total recomputes the same value
      // (and stays right even if a modifier was discontinued — see filter
      // below).
      const modifierSum = item.modifiers.reduce(
        (sum, m) => sum + m.price * m.quantity,
        0
      );
      const basePrice = Math.max(0, item.unitPrice - modifierSum);

      // Only re-attach modifiers whose option id still exists — without an
      // id, addItem's dedup signature and the server cascade can't trust the
      // modifier, so drop those silently (they would have come from the
      // original order anyway, with a stable price already baked in if
      // needed for display).
      const modifiers: StorefrontModifierOption[] = item.modifiers
        .filter((m) => m.modifierItemId !== null)
        .map((m) => ({
          id: m.modifierItemId as string,
          name: m.name,
          price: m.price,
          is_active: true,
          display_order: 0,
        }));

      const reorderItem: StorefrontItem = {
        id: item.menuItemId,
        name: item.name,
        description: null,
        price: basePrice,
        cash_price: basePrice,
        delivery_price: basePrice,
        image: null,
        availability: true,
        modifier_groups: [],
      };

      addItem(reorderItem, item.quantity, modifiers);
      added++;
    }

    if (added === 0) {
      return;
    }

    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleReorder}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold transition-opacity hover:opacity-90 active:scale-95 flex-shrink-0"
      style={{
        backgroundColor: added ? "#16a34a" : "var(--primary)",
        color: "#ffffff",
        borderRadius: "6px",
        height: "30px",
      }}
    >
      <RotateCcw className="h-3 w-3" />
      {added ? "Added!" : "Reorder"}
    </button>
  );
}

function OrderRow({
  order,
  storePath,
  isActive,
  slug,
}: {
  order: OrderHistoryEntry;
  storePath: (path?: string) => string;
  isActive?: boolean;
  slug: string;
}) {
  const date = new Date(order.createdAt);
  const dateStr = date.toLocaleDateString([], { month: "short", day: "numeric" });
  const timeStr = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  // Show at most 2 item names, truncated
  const itemPreview = order.items
    .slice(0, 2)
    .map((i) => (i.quantity > 1 ? `${i.quantity}× ${i.name}` : i.name))
    .join(", ")
    + (order.items.length > 2 ? ` +${order.items.length - 2} more` : "");

  const isCompleted = order.status === "completed";
  const isLive = LIVE_STATUSES.has(order.status);

  return (
    <div style={{ borderBottom: "1px solid #f3f4f6" }}>
      <Link href={storePath(`/order/${order.id}`)} className="block">
        <div className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
          {/* Left: order info */}
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold" style={{ color: "#111827" }}>
                #{order.displayNumber}
              </span>
              <StatusPill status={order.status} />
              {isLive && (
                <span
                  className="w-1.5 h-1.5 rounded-full animate-pulse flex-shrink-0"
                  style={{ backgroundColor: "var(--primary)" }}
                />
              )}
            </div>
            <p className="text-xs truncate" style={{ color: "#6b7280", maxWidth: "200px" }}>
              {itemPreview}
            </p>
            <p className="text-xs" style={{ color: "#9ca3af" }}>
              {dateStr} · {timeStr}
            </p>
          </div>

          {/* Right: total + actions */}
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            <span className="text-sm font-semibold" style={{ color: "#111827" }}>
              ${order.total.toFixed(2)}
            </span>
            <ReorderButton order={order} slug={slug} />
          </div>
        </div>
      </Link>

      {isCompleted && (
        <div className="px-4 pb-2.5">
          <button
            type="button"
            className="text-xs font-medium"
            style={{ color: "var(--primary)" }}
          >
            Rate your order
          </button>
        </div>
      )}
    </div>
  );
}

export function OrdersPanel({ slug, storeConfigId }: OrdersPanelProps) {
  const { isAuthenticated } = useSession();
  const [orders, setOrders] = useState<OrderHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const storePath = useStorefrontPath(slug);

  useEffect(() => {
    if (!isAuthenticated) return;
    const { sessionToken } = useSession.getState();
    if (!sessionToken) return;
    setLoading(true);
    getOrderHistory(sessionToken).then(({ data }) => {
      setOrders(data);
      setLoading(false);
    });
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <>
        <div className="flex flex-col items-center justify-center min-h-[50vh] px-6 text-center">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
            style={{ backgroundColor: "#f9fafb", border: "1px solid #e5e7eb" }}
          >
            <Receipt className="h-7 w-7" style={{ color: "#9ca3af" }} />
          </div>
          <h2 className="text-base font-bold mb-1.5" style={{ color: "#111827" }}>
            View your order history
          </h2>
          <p className="text-sm mb-5 max-w-[240px]" style={{ color: "#6b7280" }}>
            Sign in to track past orders and reorder your favorites.
          </p>
          <button
            type="button"
            onClick={() => setShowAuth(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold hover:opacity-90 active:scale-95"
            style={{
              backgroundColor: "var(--primary)",
              color: "#ffffff",
              borderRadius: "8px",
              minHeight: "44px",
            }}
          >
            <LogIn className="h-4 w-4" />
            Sign In / Sign Up
          </button>
        </div>
        {storeConfigId && (
          <AuthDialog isOpen={showAuth} onOpenChange={setShowAuth} storeConfigId={storeConfigId} />
        )}
      </>
    );
  }

  if (loading) {
    return (
      <div className="space-y-px">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse mx-4 my-2 rounded-lg" style={{ backgroundColor: "#f3f4f6" }} />
        ))}
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] px-6 text-center">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
          style={{ backgroundColor: "#f9fafb", border: "1px solid #e5e7eb" }}
        >
          <UtensilsCrossed className="h-7 w-7" style={{ color: "#9ca3af" }} />
        </div>
        <h2 className="text-base font-bold mb-1.5" style={{ color: "#111827" }}>
          No orders yet
        </h2>
        <p className="text-sm mb-5 max-w-[240px]" style={{ color: "#6b7280" }}>
          Once you place an order it'll show up here.
        </p>
      </div>
    );
  }

  const activeOrders = orders.filter((o) => ACTIVE_STATUSES.has(o.status));
  const pastOrders   = orders.filter((o) => !ACTIVE_STATUSES.has(o.status));

  return (
    <div className="bg-white">
      {activeOrders.length > 0 && (
        <section>
          <div className="px-4 py-2.5" style={{ borderBottom: "1px solid #f3f4f6" }}>
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#9ca3af" }}>
              Active Orders
            </span>
          </div>
          {activeOrders.map((order) => (
            <OrderRow key={order.id} order={order} storePath={storePath} isActive slug={slug} />
          ))}
        </section>
      )}

      {pastOrders.length > 0 && (
        <section className={activeOrders.length > 0 ? "mt-4" : ""}>
          <div className="px-4 py-2.5" style={{ borderBottom: "1px solid #f3f4f6" }}>
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#9ca3af" }}>
              Past Orders
            </span>
          </div>
          {pastOrders.map((order) => (
            <OrderRow key={order.id} order={order} storePath={storePath} slug={slug} />
          ))}
        </section>
      )}
    </div>
  );
}
