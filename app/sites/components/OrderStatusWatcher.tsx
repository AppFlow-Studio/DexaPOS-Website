"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { createClient } from "@supabase/supabase-js";

interface OrderStatusWatcherProps {
  orderId: string | null;
  /** Called when a decision (accepted/declined/cancelled) arrives, so the caller can refresh. */
  onDecision?: (status: string) => void;
  /** Statuses for which the watcher should NOT show a toast (caller handles it directly). */
  silentStatuses?: string[];
}

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

export function OrderStatusWatcher({ orderId, onDecision, silentStatuses }: OrderStatusWatcherProps) {
  const prevStatusRef = useRef<string | null>(null);
  // Keep a stable ref to callbacks so the effect doesn't re-subscribe on every render
  const onDecisionRef = useRef(onDecision);
  const silentRef = useRef(silentStatuses);
  useEffect(() => { onDecisionRef.current = onDecision; }, [onDecision]);
  useEffect(() => { silentRef.current = silentStatuses; }, [silentStatuses]);

  useEffect(() => {
    if (!orderId) return;

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const handleStatus = (status: string | undefined) => {
      if (!status) return;
      if (status === prevStatusRef.current) return;
      prevStatusRef.current = status;

      const isSilent = silentRef.current?.includes(status) ?? false;
      const msgDef = DECISION_MESSAGES[status];
      if (msgDef && !isSilent) {
        const opts = { description: msgDef.description, duration: msgDef.tone === "error" ? 8000 : 6000 };
        if (msgDef.tone === "success") toast.success(msgDef.title, opts);
        else if (msgDef.tone === "error") toast.error(msgDef.title, opts);
        else toast.info(msgDef.title, opts);
      }
      if (msgDef) onDecisionRef.current?.(status);
    };

    const channel = supabase
      .channel(`order-update:${orderId}`)
      .on("broadcast", { event: "status_changed" }, (msg) => handleStatus(msg.payload?.status))
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

    return () => {
      supabase.removeChannel(channel);
    };
  // Only re-subscribe when orderId actually changes — callbacks are via refs
  }, [orderId]);

  return null;
}
