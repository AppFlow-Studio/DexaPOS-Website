/**
 * Global storefront delivery kill-switch.
 *
 * Delivery / OrderOut Direct courier ordering is still being integrated, so it is
 * held OFF for every storefront until we deliberately flip it on — regardless of a
 * merchant's per-store `accepts_delivery` toggle or OrderOut entitlement. This
 * lets us ship the delivery code (schema, edge functions, checkout flow) to main
 * and prod while keeping the customer-facing option dark.
 *
 * Default is OFF: with the env var unset, delivery never renders and delivery
 * orders are rejected server-side. To exercise the flow (e.g. on the staging /
 * preview deployment) set `ONLINE_DELIVERY_ENABLED=true`; leave it unset in
 * production until go-live.
 *
 * Server-only: the two choke points that read it — the storefront config resolver
 * (`resolveDeliveryFulfillment` in actions.ts) and the `placeOrder` server action
 * — both run on the server, so this value never needs to reach the client bundle.
 */
export function isOnlineDeliveryEnabled(): boolean {
  return process.env.ONLINE_DELIVERY_ENABLED === "true";
}
