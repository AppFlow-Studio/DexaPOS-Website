"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Receipt, Clock, Package, CheckCircle2, XCircle } from "lucide-react";
import { useSession } from "../hooks/useSession";
import { getOrderHistory, type OrderHistoryEntry } from "../order-actions";
import { useStorefrontPath } from "../lib/use-storefront-path";

interface OrdersPanelProps {
  slug: string;
}

const STATUS_CONFIG: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  pending: { icon: <Clock className="h-4 w-4" />, color: "#f59e0b", label: "Pending" },
  accepted: { icon: <Clock className="h-4 w-4" />, color: "#3b82f6", label: "Accepted" },
  sent_to_kitchen: { icon: <Clock className="h-4 w-4" />, color: "#8b5cf6", label: "In Kitchen" },
  preparing: { icon: <Package className="h-4 w-4" />, color: "#f97316", label: "Preparing" },
  ready: { icon: <CheckCircle2 className="h-4 w-4" />, color: "#22c55e", label: "Ready" },
  completed: { icon: <CheckCircle2 className="h-4 w-4" />, color: "#22c55e", label: "Completed" },
  cancelled: { icon: <XCircle className="h-4 w-4" />, color: "#ef4444", label: "Cancelled" },
  void: { icon: <XCircle className="h-4 w-4" />, color: "#ef4444", label: "Voided" },
};

const ACTIVE_STATUSES = ["pending", "accepted", "sent_to_kitchen", "preparing", "ready"];

export function OrdersPanel({ slug }: OrdersPanelProps) {
  const { isAuthenticated } = useSession();
  const [orders, setOrders] = useState<OrderHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const storePath = useStorefrontPath(slug);

  useEffect(() => {
    if (!isAuthenticated) return;

    const { sessionToken } = useSession.getState();
    if (!sessionToken) return;

    setLoading(true);
    getOrderHistory(sessionToken).then(({ data, error: err }) => {
      setOrders(data);
      if (err) setError(err);
      setLoading(false);
    });
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] px-6 text-center">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
          style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}
        >
          <Receipt className="h-8 w-8" style={{ color: "var(--text-secondary)" }} />
        </div>
        <h2 className="text-lg font-bold mb-1" style={{ color: "var(--text)" }}>
          Sign in to view orders
        </h2>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Your order history will appear here after signing in.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-3 p-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-20 rounded-xl animate-pulse"
            style={{ backgroundColor: "var(--card)" }}
          />
        ))}
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] px-6 text-center">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
          style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}
        >
          <Receipt className="h-8 w-8" style={{ color: "var(--text-secondary)" }} />
        </div>
        <h2 className="text-lg font-bold mb-1" style={{ color: "var(--text)" }}>
          No orders yet
        </h2>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Your orders will appear here once you place one.
        </p>
      </div>
    );
  }

  // Active orders first
  const activeOrders = orders.filter((o) => ACTIVE_STATUSES.includes(o.status));
  const pastOrders = orders.filter((o) => !ACTIVE_STATUSES.includes(o.status));

  return (
    <div className="space-y-4 p-2">
      {activeOrders.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
            Active Orders
          </h3>
          {activeOrders.map((order) => (
            <OrderCard key={order.id} order={order} slug={slug} storePath={storePath} isActive />
          ))}
        </div>
      )}

      {pastOrders.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
            Past Orders
          </h3>
          {pastOrders.map((order) => (
            <OrderCard key={order.id} order={order} slug={slug} storePath={storePath} />
          ))}
        </div>
      )}
    </div>
  );
}

function OrderCard({
  order,
  slug,
  storePath,
  isActive,
}: {
  order: OrderHistoryEntry;
  slug: string;
  storePath: (path?: string) => string;
  isActive?: boolean;
}) {
  const statusInfo = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.pending;
  const date = new Date(order.createdAt);
  const dateStr = date.toLocaleDateString([], { month: "short", day: "numeric" });
  const timeStr = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const itemNames = order.items.map((i) => i.name).join(", ");

  return (
    <Link href={storePath(`/order/${order.id}`)}>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-3 rounded-xl cursor-pointer transition-all hover:scale-[1.01]"
        style={{
          backgroundColor: "var(--card)",
          border: isActive ? `2px solid var(--primary)` : "1px solid var(--border)",
          borderRadius: "var(--radius)",
        }}
      >
        <div className="flex items-start justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm" style={{ color: "var(--text)" }}>
              #{order.displayNumber}
            </span>
            {isActive && (
              <span
                className="w-2 h-2 rounded-full animate-pulse"
                style={{ backgroundColor: "var(--primary)" }}
              />
            )}
          </div>
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
            style={{
              backgroundColor: `color-mix(in srgb, ${statusInfo.color} 15%, var(--bg))`,
              color: statusInfo.color,
            }}
          >
            {statusInfo.icon}
            {statusInfo.label}
          </span>
        </div>
        <p
          className="text-xs truncate mb-1"
          style={{ color: "var(--text-secondary)" }}
        >
          {itemNames}
        </p>
        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
            {dateStr} at {timeStr}
          </span>
          <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>
            ${order.total.toFixed(2)}
          </span>
        </div>
      </motion.div>
    </Link>
  );
}
