"use client";

import { useEffect, useRef } from "react";
import { useCart } from "./useCart";
import { useSession } from "./useSession";
import { updateSession } from "../session-actions";

/**
 * Syncs cart data to the server session (debounced).
 * Enables abandoned cart recovery by persisting cart state server-side.
 */
export function useCartSync() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSyncRef = useRef<string>("");

  useEffect(() => {
    const unsubscribe = useCart.subscribe((state) => {
      const { sessionToken } = useSession.getState();
      if (!sessionToken) return;

      const cartSnapshot = JSON.stringify(
        state.items.map((item) => ({
          id: item.id,
          cartItemId: item.cartItemId,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          totalPrice: item.totalPrice,
          notes: item.notes,
          selectedModifiers: item.selectedModifiers,
        }))
      );

      // Skip if nothing changed
      if (cartSnapshot === lastSyncRef.current) return;

      // Debounce 3 seconds
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        lastSyncRef.current = cartSnapshot;
        const cartData = JSON.parse(cartSnapshot);
        updateSession(sessionToken, { cartData }).catch(() => {
          // Silent fail — non-critical
        });
      }, 3000);
    });

    return () => {
      unsubscribe();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);
}
