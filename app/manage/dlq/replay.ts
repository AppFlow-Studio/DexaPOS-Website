/*
 * What a dead-letter retry can do, in one place. The retry server action
 * (`app/manage/actions/dead-letter-queue.ts`) and the queue UI both read this,
 * so the UI never offers a retry the server will refuse. It lives outside the
 * action because a 'use server' module may export async functions only.
 */

/** The only source with a receiver that accepts a replay today. */
const REPLAYABLE_SOURCE = 'orderout'

/** Which edge function a retry re-POSTs to, or why it cannot. */
export function resolveReplayTarget(
  source: string,
  eventType: string | null
): { path: string | null; reason?: string } {
  if (source !== REPLAYABLE_SOURCE) {
    return { path: null, reason: 'Unknown DLQ source — retry not supported' }
  }
  if (eventType === 'push_menu') {
    return { path: 'orderout-push-menu-webhook' }
  }
  // All other orderout event types are order webhook payloads.
  return { path: 'orderout-orders-webhook' }
}

export function isReplayable(source: string, eventType: string | null): boolean {
  return resolveReplayTarget(source, eventType).path !== null
}

/** Internal enrichment keys Dexa adds to a payload, removed before a replay. */
export function isStrippedOnReplay(key: string): boolean {
  return key.startsWith('_matched_') || key === '_rpc_error' || key === '_error' || key === '_raw'
}

export function stripEnrichmentKeys(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload
  }
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    if (!isStrippedOnReplay(key)) out[key] = value
  }
  return out
}
