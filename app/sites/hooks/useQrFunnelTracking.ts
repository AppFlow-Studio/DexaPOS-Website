"use client";

import { useEffect, useRef } from "react";
import { trackQrFunnelEvent, type QrFunnelStage } from "../funnel-actions";
import { useCart } from "./useCart";
import { useSession } from "./useSession";

interface UseQrFunnelTrackingOptions {
  trackMenuViewed?: boolean;
  trackCartStarted?: boolean;
  trackCheckout?: boolean;
}

async function sendQrFunnelEvent(
  sessionToken: string,
  stage: QrFunnelStage
): Promise<void> {
  const userAgent =
    typeof navigator !== "undefined" ? navigator.userAgent : null;

  try {
    await trackQrFunnelEvent(sessionToken, stage, userAgent);
  } catch (error) {
    console.error(`Failed to track QR funnel stage "${stage}"`, error);
  }
}

export function useQrFunnelTracking({
  trackMenuViewed = false,
  trackCartStarted = false,
  trackCheckout = false,
}: UseQrFunnelTrackingOptions): void {
  const sessionToken = useSession((state) => state.sessionToken);
  const cartItemCount = useCart((state) =>
    state.items.reduce((total, item) => total + item.quantity, 0)
  );

  const menuTrackedRef = useRef(false);
  const cartTrackedRef = useRef(false);
  const checkoutTrackedRef = useRef(false);

  useEffect(() => {
    if (!trackMenuViewed || !sessionToken || menuTrackedRef.current) return;
    menuTrackedRef.current = true;
    void sendQrFunnelEvent(sessionToken, "menu_viewed");
  }, [trackMenuViewed, sessionToken]);

  useEffect(() => {
    if (
      !trackCartStarted ||
      !sessionToken ||
      cartItemCount <= 0 ||
      cartTrackedRef.current
    ) {
      return;
    }

    cartTrackedRef.current = true;
    void sendQrFunnelEvent(sessionToken, "cart_started");
  }, [trackCartStarted, sessionToken, cartItemCount]);

  useEffect(() => {
    if (!trackCheckout || !sessionToken || checkoutTrackedRef.current) return;
    checkoutTrackedRef.current = true;
    void sendQrFunnelEvent(sessionToken, "checkout");
  }, [trackCheckout, sessionToken]);
}
