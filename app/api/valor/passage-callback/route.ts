/**
 * [C3] No-op Passage.js form-action sink.
 *
 * Passage.js v2 requires a `formAction` URL, but the storefront consumes the card
 * token via the SDK's `onTokenReceived` callback and charges it through an
 * explicit POST to the create-online-order edge function. This endpoint exists
 * only so Passage has a valid action to post to; it intentionally does nothing
 * with the payload (which is at most a single-use token, never card data) and
 * returns 204 so the browser keeps the checkout document active while the
 * explicit order/payment request completes.
 *
 * If sandbox testing shows Passage does not require a live formAction in
 * token-callback mode, this route can be removed.
 */

export async function POST() {
  // Passage.js submits a hidden native form after emitting onTokenReceived.
  // A 204 completes that required submission without replacing the checkout
  // document while the explicit order/payment request is still in flight.
  return new Response(null, { status: 204 });
}

export async function GET() {
  return new Response(null, { status: 204 });
}
