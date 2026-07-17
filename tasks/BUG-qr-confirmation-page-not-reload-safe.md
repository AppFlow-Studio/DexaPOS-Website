# BUG: QR dine-in confirmation page loses order on refresh (empty cart)

**Area:** Storefront / QR dine-in (QR-11 / QR-12)
**Severity:** High — guest permanently loses their confirmation + tracking entry point on any reload
**Found:** 2026-07-15, first real end-to-end QR dine-in paid-order test on staging (`dfwqakoyittmrwbqvxgw`)
**Status:** Confirmed, reproducible on video/device

## Symptom

After a guest completes a paid QR dine-in checkout, the confirmation screen renders correctly (order number, ETA, receipt). **Refreshing the page** drops the confirmation and falls through to the checkout view showing an **empty cart**. The guest has no way back to their order number or live tracking from that tab.

Reported by tester (Haidar) on a real phone; reproduced in-browser against the same LAN dev build.

## Root cause

`app/sites/components/checkout/CheckoutPage.tsx` gates the confirmation screen on:

```ts
if (step === "confirmation" && orderResult) { ...render OrderConfirmation... }
```

Both `step` (`useState<"checkout" | "confirmation">`) and `orderResult` (`useState`) are **ephemeral client state**. On reload:
- `step` re-initializes to `"checkout"`
- `orderResult` re-initializes to `null`
- cart was cleared on successful placement (by design)

→ page renders the checkout step with an empty cart. There is **no rehydration from the server** on mount.

## The data IS available server-side (fix is straightforward)

`get_qr_order_status(p_session_token)` already returns the full order for a QR session token — verified live for the exact test order:

```
{ success:true, has_order:true, order_id:"c663678c…", order_number:"ORD-20260715-0002",
  display_number:"#0002", table_label:"New 2-Seater Square", status_label:"Preparing",
  stage:"preparing", estimated_ready_at:"…", poll_interval_seconds:5 }
```

The QR session token persists in client storage (`useSession`/`useSessionInit`), so recovery does not require any new persistence.

## Suggested fix (pick one)

1. **Rehydrate on mount (minimal):** if there's no `orderResult` but the QR session has a bound `order_id` (via `get_qr_order_status` / `online_order_sessions.order_id`), restore `step="confirmation"` and hydrate a confirmation from the server payload.
2. **Redirect to a stable tracking URL (cleaner, also fixes shareability):** on successful placement, navigate to a token/order-keyed tracking route (`OrderTrackingPage` already exists and already polls `get_qr_order_status`). Reload then lands on a server-backed page instead of ephemeral checkout state.

Option 2 also satisfies the acceptance criterion "tracking link … recoverable after browser close."

## Acceptance criterion this blocks

> Tracking link proven: opens live status with no login, updates in real time as POS/KDS advances the order, **recoverable after browser close**, and fails closed on tampered/expired tokens.

Token fail-closed + live update are already proven; **reload/browser-close recovery is not**, because of this bug.

## Evidence
- Order ORD-20260715-0002 (`c663678c-fc3c-4e9f-b283-235a613f4ae4`): `order_type=qr_dine_in`, `table_number="New 2-Seater Square"`, paid, `session_id` NULL.
- `get_qr_order_status` returns full recoverable payload for the same session token.
- Repro: complete QR checkout → refresh confirmation page → empty cart.
