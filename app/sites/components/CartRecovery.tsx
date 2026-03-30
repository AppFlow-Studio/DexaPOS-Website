"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useCart } from "../hooks/useCart";
import { useSession } from "../hooks/useSession";
import { markRecoveryClicked } from "../recovery-actions";

interface CartRecoveryProps {
  cartData: any[];
  sessionToken: string;
  notificationId: string;
  storeConfigId: string;
}

export function CartRecovery({
  cartData,
  sessionToken,
  notificationId,
  storeConfigId,
}: CartRecoveryProps) {
  const restoredRef = useRef(false);

  useEffect(() => {
    if (restoredRef.current || !cartData?.length) return;
    restoredRef.current = true;

    // Restore session
    const state = useSession.getState();
    if (!state.sessionToken) {
      state.initSessionToken(sessionToken, storeConfigId);
    }

    // Restore cart items
    const cart = useCart.getState();
    cart.clearCart();

    for (const item of cartData) {
      cart.addItem(
        {
          id: item.id,
          name: item.name,
          price: item.price || item.totalPrice || 0,
          delivery_price: item.price || item.totalPrice || 0,
          description: null,
          image: null,
          availability: true,
          modifier_groups: [],
        },
        item.quantity || 1,
        item.selectedModifiers || [],
        item.notes || ""
      );
    }

    // Mark notification as clicked
    markRecoveryClicked(notificationId).catch(() => {});

    toast.success("Your cart has been restored!");
  }, [cartData, sessionToken, notificationId, storeConfigId]);

  return null;
}
