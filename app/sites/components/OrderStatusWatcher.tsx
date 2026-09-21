"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { createClient } from "@supabase/supabase-js";

interface OrderStatusWatcherProps {
  orderId: string | null;
  sessionToken?: string | null;
  /** Called when a decision (accepted/declined/cancelled) arrives, so the caller can refresh. */
  onDecision?: (status: string) => void;
  /** Statuses to refresh on without showing a toast. */
  silentStatuses?: string[];
  /** Delivery orders: swaps the "ready" copy from pickup to courier wording. */
  orderType?: "pickup" | "delivery" | string;
  /** OrderOut Direct: a courier status event arrived (delivery_status_changed). */
  onDelivery?: (payload: DeliveryStatusEvent) => void;
}

export interface DeliveryStatusEvent {
  orderId: string;
  deliveryStatus: string;
  deliveryRank: number;
  dispatchState: string;
  courierName: string | null;
  eta: string | null;
  trackingUrl: string | null;
}

const DELIVERY_MESSAGES: Record<string, { title: string; description: string; tone: "success" | "info" | "error" }> = {
  runner_assigned: { title: "Driver assigned", description: "A courier has picked up your delivery.", tone: "info" },
  picked_up: { title: "Picked up", description: "Your order is on its way.", tone: "info" },
  en_route_dropoff: { title: "On the way", description: "Your courier is heading to you.", tone: "info" },
  arrived_dropoff: { title: "Driver arrived", description: "Your courier is at your door.", tone: "success" },
  completed: { title: "Delivered", description: "Enjoy your meal!", tone: "success" },
  cancelled: { title: "Delivery issue", description: "The courier cancelled. The restaurant has been notified.", tone: "error" },
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

const DECISION_MESSAGES: Record<
  string,
  { title: string; description: string; tone: "success" | "info" | "error" }
> = {
  accepted: {
    title: "Order Accepted!",
    description: "The restaurant has accepted your order.",
    tone: "success",
  },
  sent_to_kitchen: {
    title: "Sent to the kitchen",
    description: "Your order is queued up for the chefs.",
    tone: "info",
  },
  preparing: {
    title: "Cooking now",
    description: "The kitchen has started preparing your order.",
    tone: "info",
  },
  ready: {
    title: "Ready for pickup!",
    description: "Your order is ready — head over when you can.",
    tone: "success",
  },
  completed: {
    title: "Order completed",
    description: "Thanks for stopping by. Enjoy!",
    tone: "success",
  },
  declined: {
    title: "Order Declined",
    description: "The restaurant could not accept your order.",
    tone: "error",
  },
  cancelled: {
    title: "Order Cancelled",
    description: "Your order has been cancelled.",
    tone: "error",
  },
};

export function OrderStatusWatcher({
  orderId,
  sessionToken,
  onDecision,
  silentStatuses,
  orderType,
  onDelivery,
}: OrderStatusWatcherProps) {
  const prevStatusRef = useRef<string | null>(null);
  const prevDeliveryRankRef = useRef<number>(0);
  // Keep a stable ref to callbacks so the effect doesn't re-subscribe on every render
  const onDecisionRef = useRef(onDecision);
  const onDeliveryRef = useRef(onDelivery);
  const silentRef = useRef(silentStatuses);
  const orderTypeRef = useRef(orderType);
  useEffect(() => { onDecisionRef.current = onDecision; }, [onDecision]);
  useEffect(() => { onDeliveryRef.current = onDelivery; }, [onDelivery]);
  useEffect(() => { silentRef.current = silentStatuses; }, [silentStatuses]);
  useEffect(() => { orderTypeRef.current = orderType; }, [orderType]);

  useEffect(() => {
    if (!orderId && !sessionToken) return;

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const channels: ReturnType<typeof supabase.channel>[] = [];

    const handleStatus = (status: string | undefined) => {
      if (!status) return;
      if (status === prevStatusRef.current) return;
      prevStatusRef.current = status;

      const isSilent = silentRef.current?.includes(status) ?? false;
      const msgDef =
        status === "ready" && orderTypeRef.current === "delivery"
          ? { title: "Waiting for your driver", description: "Your order is packed and ready for the courier.", tone: "info" as const }
          : DECISION_MESSAGES[status];
      if (msgDef && !isSilent) {
        const opts = { description: msgDef.description, duration: msgDef.tone === "error" ? 8000 : 6000 };
        if (msgDef.tone === "success") toast.success(msgDef.title, opts);
        else if (msgDef.tone === "error") toast.error(msgDef.title, opts);
        else toast.info(msgDef.title, opts);
      }
      if (msgDef) onDecisionRef.current?.(status);
    };

    if (orderId) {
      const orderChannel = supabase
        .channel(`order-update:${orderId}`)
        .on("broadcast", { event: "status_changed" }, (msg) => handleStatus(msg.payload?.status))
        .on("broadcast", { event: "delivery_status_changed" }, (msg) => {
          const payload = msg.payload as DeliveryStatusEvent | undefined;
          if (!payload) return;
          // Rank only ever increases server-side; ignore anything stale or repeated.
          if (payload.deliveryRank <= prevDeliveryRankRef.current && payload.deliveryStatus !== "cancelled") return;
          prevDeliveryRankRef.current = payload.deliveryRank;
          const def = DELIVERY_MESSAGES[payload.deliveryStatus];
          if (def) {
            const opts = { description: def.description, duration: def.tone === "error" ? 8000 : 6000 };
            if (def.tone === "success") toast.success(def.title, opts);
            else if (def.tone === "error") toast.error(def.title, opts);
            else toast.info(def.title, opts);
          }
          onDeliveryRef.current?.(payload);
        })
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "orders",
            filter: `id=eq.${orderId}`,
          },
          (payload) => handleStatus((payload.new as { status?: string })?.status)
        )
        .subscribe();

      channels.push(orderChannel);
    }

    if (sessionToken) {
      const qrSessionChannel = supabase
        .channel(`qr-session:${sessionToken}`)
        .on("broadcast", { event: "qr_order_changed" }, (msg) =>
          handleStatus(msg.payload?.status)
        )
        .subscribe();

      channels.push(qrSessionChannel);
    }

    return () => {
      channels.forEach((channel) => {
        void supabase.removeChannel(channel);
      });
    };
  // Only re-subscribe when orderId actually changes — callbacks are via refs
  }, [orderId, sessionToken]);

  return null;
}
