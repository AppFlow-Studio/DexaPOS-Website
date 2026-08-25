/**
 * [C3] No-op Passage.js form-action sink.
 *
 * Passage.js v2 requires a `formAction` URL, but the storefront consumes the card
 * token via the SDK's `onTokenReceived` callback and charges it through an
 * explicit POST to the create-online-order edge function. This endpoint exists
 * only so Passage has a valid action to post to; it intentionally does nothing
 * with the payload (which is at most a single-use token, never card data) and
 * returns 200 so the SDK does not surface a submission error.
 *
 * If sandbox testing shows Passage does not require a live formAction in
 * token-callback mode, this route can be removed.
 */

import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true });
}
