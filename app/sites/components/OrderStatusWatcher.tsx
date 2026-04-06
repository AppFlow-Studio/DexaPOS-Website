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

const DECISION_MESSAGES: Record<string, { title: string; description: string }> = {
  accepted: {
    title: "Order Accepted!",
    description: "The restaurant has accepted your order.",
  },
  sent_to_kitchen: {
    title: "Order Accepted!",
    description: "Your order has been sent to the kitchen.",
  },
  declined: {
    title: "Order Declined",
    description: "The restaurant could not accept your order.",
  },
  cancelled: {
    title: "Order Cancelled",
    description: "Your order has been cancelled.",
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
    const channel = supabase.channel(`order-update:${orderId}`);

    channel
      .on("broadcast", { event: "status_changed" }, (msg) => {
        const status: string = msg.payload?.status;
        if (!status) return;
        if (status === prevStatusRef.current) return;
        prevStatusRef.current = status;

        const isSilent = silentRef.current?.includes(status) ?? false;
        const msgDef = DECISION_MESSAGES[status];
        if (msgDef && !isSilent) {
          if (status === "accepted" || status === "sent_to_kitchen") {
            toast.success(msgDef.title, { description: msgDef.description, duration: 6000 });
          } else {
            toast.error(msgDef.title, { description: msgDef.description, duration: 8000 });
          }
        }
        if (msgDef) {
          onDecisionRef.current?.(status);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  // Only re-subscribe when orderId actually changes — callbacks are via refs
  }, [orderId]);

  return null;
}
