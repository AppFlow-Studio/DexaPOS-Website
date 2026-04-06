'use server'

// ============================================================================
// HQ Dead Letter Queue management
// ----------------------------------------------------------------------------
// Read/filter DLQ entries, retry failed webhook payloads, and manually
// resolve/abandon entries. All actions are gated by the HQ permission
// `hq.merchant.update` — the same permission used to register the OrderOut
// push_menu webhook, which is the only source currently writing to the DLQ.
//
// DLQ has RLS enabled with no policies, so every query uses the service-role
// client. The HQ permission check is the app-layer gatekeeper.
// ============================================================================

import { assertHQPermission } from '@/lib/admin/auth'
import { LogAuditEvent } from '@/app/dashboard/actions/audit-logs'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

// ============================================================================
// TYPES
// ============================================================================

export type DlqStatus = 'pending' | 'retrying' | 'resolved' | 'abandoned'

export interface DlqRow {
  id: string
  source: string
  event_type: string | null
  status: string
  error_message: string | null
  retry_count: number
  max_retries: number
  next_retry_at: string | null
  raw_payload: unknown
  created_at: string
  updated_at: string
  resolved_at: string | null
}

export interface DlqFilters {
  source?: string       // 'orderout' | 'all' | ...
  eventType?: string    // 'push_menu' | 'created' | 'cancelled' | 'all' | ...
  status?: DlqStatus | 'all'
  search?: string       // substring match on error_message
}

export interface DlqListResult {
  data: DlqRow[]
  total: number
  facets: { sources: string[]; eventTypes: string[] }
  error: string | null
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

function resolveTargetFunction(
  source: string,
  eventType: string | null
): { path: string | null; reason?: string } {
  if (source !== 'orderout') {
    return { path: null, reason: 'Unknown DLQ source — retry not supported' }
  }
  if (eventType === 'push_menu') {
    return { path: 'orderout-push-menu-webhook' }
  }
  // All other orderout event types are order webhook payloads.
  return { path: 'orderout-orders-webhook' }
}

function stripEnrichmentKeys(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload
  }
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
    if (
      k.startsWith('_matched_') ||
      k === '_rpc_error' ||
      k === '_error' ||
      k === '_raw'
    ) {
      continue
    }
    out[k] = v
  }
  return out
}

function sanitizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '')
}

// ============================================================================
// A.1 — LIST
// ============================================================================

export async function listDeadLetterEntries(
  filters: DlqFilters,
  limit: number = 50,
  offset: number = 0
): Promise<DlqListResult> {
  try {
    await assertHQPermission('hq.merchant.update')

    const supabase = createServiceRoleClient()

    let query = supabase
      .from('webhook_dead_letter_queue')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + Math.max(0, limit - 1))

    if (filters.source && filters.source !== 'all') {
      query = query.eq('source', filters.source)
    }
    if (filters.eventType && filters.eventType !== 'all') {
      query = query.eq('event_type', filters.eventType)
    }
    if (filters.status && filters.status !== 'all') {
      query = query.eq('status', filters.status)
    }
    if (filters.search && filters.search.trim()) {
      // ilike on error_message; escape % and _ to avoid wildcard abuse.
      const escaped = filters.search.trim().replace(/[\\%_]/g, (m) => `\\${m}`)
      query = query.ilike('error_message', `%${escaped}%`)
    }

    const [{ data: rows, error: rowsError, count }, { data: facetRows, error: facetError }] = await Promise.all([
      query,
      supabase
        .from('webhook_dead_letter_queue')
        .select('source, event_type'),
    ])

    if (rowsError) {
      console.error('[listDeadLetterEntries] Query error:', rowsError)
      return { data: [], total: 0, facets: { sources: [], eventTypes: [] }, error: rowsError.message }
    }

    const sources = new Set<string>()
    const eventTypes = new Set<string>()
    if (!facetError && facetRows) {
      for (const r of facetRows as Array<{ source: string | null; event_type: string | null }>) {
        if (r.source) sources.add(r.source)
        if (r.event_type) eventTypes.add(r.event_type)
      }
    }

    return {
      data: (rows ?? []) as DlqRow[],
      total: count ?? 0,
      facets: {
        sources: Array.from(sources).sort(),
        eventTypes: Array.from(eventTypes).sort(),
      },
      error: null,
    }
  } catch (error) {
    console.error('[listDeadLetterEntries] Exception:', error)
    return {
      data: [],
      total: 0,
      facets: { sources: [], eventTypes: [] },
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

// ============================================================================
// A.5 — GET ONE
// ============================================================================

export async function getDeadLetterEntry(
  id: string
): Promise<{ data: DlqRow | null; error: string | null }> {
  try {
    await assertHQPermission('hq.merchant.update')
    const supabase = createServiceRoleClient()

    const { data, error } = await supabase
      .from('webhook_dead_letter_queue')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error) return { data: null, error: error.message }
    return { data: (data as DlqRow | null) ?? null, error: null }
  } catch (error) {
    console.error('[getDeadLetterEntry] Exception:', error)
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

// ============================================================================
// A.2 — RETRY
// ============================================================================

export async function retryDeadLetterEntry(
  id: string
): Promise<{ success: boolean; resolved: boolean; error?: string }> {
  try {
    const { userId } = await assertHQPermission('hq.merchant.update')

    const supabase = createServiceRoleClient()

    // 1. Load entry
    const { data: entry, error: loadError } = await supabase
      .from('webhook_dead_letter_queue')
      .select('id, source, event_type, raw_payload, retry_count, max_retries, status')
      .eq('id', id)
      .maybeSingle()

    if (loadError) {
      return { success: false, resolved: false, error: `Lookup failed: ${loadError.message}` }
    }
    if (!entry) {
      return { success: false, resolved: false, error: 'DLQ entry not found' }
    }

    // 2. Guards
    if (entry.status === 'resolved') {
      return { success: false, resolved: false, error: 'Already resolved' }
    }
    if (entry.status === 'retrying') {
      return { success: false, resolved: false, error: 'Already retrying' }
    }
    if ((entry.retry_count ?? 0) >= (entry.max_retries ?? 0)) {
      return {
        success: false,
        resolved: false,
        error: 'Max retries exceeded — abandon or reset retry_count manually',
      }
    }

    // 3. Route to target edge function
    const target = resolveTargetFunction(entry.source, entry.event_type)
    if (!target.path) {
      return { success: false, resolved: false, error: target.reason || 'Unknown source' }
    }

    // 4. Env / config
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const webhookSecret = process.env.ORDEROUT_WEBHOOK_SECRET
    if (!supabaseUrl) {
      return { success: false, resolved: false, error: 'Supabase URL not configured' }
    }
    if (!webhookSecret) {
      return { success: false, resolved: false, error: 'Webhook secret not configured' }
    }

    // 5. Strip internal enrichment fields from payload
    const payloadToReplay = stripEnrichmentKeys(entry.raw_payload)

    // 6. Flip status to 'retrying' BEFORE firing (prevents double-click races).
    //    Do NOT bump retry_count here — the receiver bumps it on failure (via
    //    touch_dlq_replay_failure) and mark_dlq_replay_success bumps it on
    //    success. Single source of truth.
    const { error: flipError } = await supabase
      .from('webhook_dead_letter_queue')
      .update({ status: 'retrying', updated_at: new Date().toISOString() })
      .eq('id', id)
    if (flipError) {
      return { success: false, resolved: false, error: `Failed to mark retrying: ${flipError.message}` }
    }

    // 7. Fire the webhook
    const url = `${sanitizeBaseUrl(supabaseUrl)}/functions/v1/${target.path}`
    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${webhookSecret}`,
          'Content-Type': 'application/json',
          'x-dlq-replay-id': id,
        },
        body: JSON.stringify(payloadToReplay),
      })
    } catch (networkError) {
      // Network-level failure — the receiver never ran, so no replay-id path
      // executed. Reset status to pending and bump retry_count here so this
      // doesn't get stuck in 'retrying'.
      const msg = networkError instanceof Error ? networkError.message : String(networkError)
      await supabase.rpc('touch_dlq_replay_failure', { p_id: id, p_error_message: `Network error: ${msg}` })
      return { success: false, resolved: false, error: `Network error: ${msg}` }
    }

    const resultJson = await response.json().catch(() => null) as
      | { success?: boolean; error?: string; message?: string }
      | null

    // 8. Evaluate outcome.
    //
    // IMPORTANT: the orders-webhook returns HTTP 200 + success:true even when
    // it stored a payload in DLQ (e.g. "restaurant not accepting orders"),
    // because OrderOut expects 2xx or it'll keep retrying. So the HTTP body
    // alone isn't enough to distinguish real success from a receiver-side DLQ
    // path. We use the row's status as the source of truth instead:
    //
    //   - row.status == 'retrying' → receiver did NOT call
    //     touch_dlq_replay_failure → actual processing success.
    //   - row.status == 'pending'  → receiver called
    //     touch_dlq_replay_failure (status was reset, retry_count bumped,
    //     error_message refreshed) → retry did NOT resolve.
    //   - row.status == anything else → unexpected.
    const { data: afterRow } = await supabase
      .from('webhook_dead_letter_queue')
      .select('status, error_message')
      .eq('id', id)
      .maybeSingle()

    if (response.ok && afterRow?.status === 'retrying') {
      // Receiver succeeded AND did not invoke the DLQ replay path.
      await supabase.rpc('mark_dlq_replay_success', { p_id: id })

      await LogAuditEvent({
        action: 'retried_dlq_entry',
        actionCategory: 'integrations',
        severity: 'info',
        resourceType: 'webhook_dead_letter_queue',
        resourceId: id,
        resourceName: `${entry.source}:${entry.event_type ?? 'unknown'}`,
        metadata: {
          dlq_id: id,
          source: entry.source,
          event_type: entry.event_type,
          retry_count: (entry.retry_count ?? 0) + 1,
          resolved: true,
          retried_by_admin: userId,
          target_function: target.path,
        },
      })

      return { success: true, resolved: true }
    }

    // Failure path. Build a summary from either the receiver's stored
    // error_message (if it took its own DLQ path) or the HTTP response body.
    let summary: string
    if (afterRow?.status === 'pending' && afterRow.error_message) {
      // Receiver already wrote a fresh error_message via the replay path.
      summary = afterRow.error_message
    } else {
      summary = resultJson?.error
        ? resultJson.error
        : resultJson?.message
          ? resultJson.message
          : `Receiver returned HTTP ${response.status}`
    }

    // If the row is still 'retrying' it means the receiver returned non-2xx
    // before reaching its DLQ path (auth failure, parse failure, etc). Reset
    // it to 'pending' so the UI doesn't lock up, and bump retry_count.
    if (afterRow?.status === 'retrying') {
      await supabase.rpc('touch_dlq_replay_failure', {
        p_id: id,
        p_error_message: summary,
      })
    }

    await LogAuditEvent({
      action: 'retried_dlq_entry',
      actionCategory: 'integrations',
      severity: 'warning',
      resourceType: 'webhook_dead_letter_queue',
      resourceId: id,
      resourceName: `${entry.source}:${entry.event_type ?? 'unknown'}`,
      metadata: {
        dlq_id: id,
        source: entry.source,
        event_type: entry.event_type,
        retry_count: (entry.retry_count ?? 0) + 1,
        resolved: false,
        retried_by_admin: userId,
        target_function: target.path,
        receiver_status: response.status,
        receiver_error: summary,
      },
    })

    return { success: true, resolved: false, error: summary }
  } catch (error) {
    console.error('[retryDeadLetterEntry] Exception:', error)
    return {
      success: false,
      resolved: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

// ============================================================================
// A.3 — RESOLVE (manual mark-as-fixed)
// ============================================================================

export async function resolveDeadLetterEntry(
  id: string,
  note?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { userId } = await assertHQPermission('hq.merchant.update')
    const supabase = createServiceRoleClient()

    const { data: entry } = await supabase
      .from('webhook_dead_letter_queue')
      .select('source, event_type, status')
      .eq('id', id)
      .maybeSingle()

    if (!entry) {
      return { success: false, error: 'DLQ entry not found' }
    }
    if (entry.status === 'resolved') {
      return { success: false, error: 'Already resolved' }
    }

    const nowIso = new Date().toISOString()
    const { error } = await supabase
      .from('webhook_dead_letter_queue')
      .update({ status: 'resolved', resolved_at: nowIso, updated_at: nowIso })
      .eq('id', id)
      .neq('status', 'resolved')

    if (error) return { success: false, error: error.message }

    await LogAuditEvent({
      action: 'resolved_dlq_entry',
      actionCategory: 'integrations',
      severity: 'info',
      resourceType: 'webhook_dead_letter_queue',
      resourceId: id,
      resourceName: `${entry.source}:${entry.event_type ?? 'unknown'}`,
      metadata: {
        dlq_id: id,
        source: entry.source,
        event_type: entry.event_type,
        resolved_by_admin: userId,
        note: note || null,
      },
    })

    return { success: true }
  } catch (error) {
    console.error('[resolveDeadLetterEntry] Exception:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

// ============================================================================
// A.4 — ABANDON
// ============================================================================

export async function abandonDeadLetterEntry(
  id: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!reason || !reason.trim()) {
      return { success: false, error: 'Reason is required' }
    }
    const { userId } = await assertHQPermission('hq.merchant.update')
    const supabase = createServiceRoleClient()

    const { data: entry } = await supabase
      .from('webhook_dead_letter_queue')
      .select('source, event_type, status, error_message')
      .eq('id', id)
      .maybeSingle()

    if (!entry) {
      return { success: false, error: 'DLQ entry not found' }
    }

    const nowIso = new Date().toISOString()
    const appended = `${entry.error_message ?? ''}\n[abandoned] ${reason.trim()}`.trim()

    const { error } = await supabase
      .from('webhook_dead_letter_queue')
      .update({
        status: 'abandoned',
        resolved_at: nowIso,
        updated_at: nowIso,
        error_message: appended,
      })
      .eq('id', id)

    if (error) return { success: false, error: error.message }

    await LogAuditEvent({
      action: 'abandoned_dlq_entry',
      actionCategory: 'integrations',
      severity: 'warning',
      resourceType: 'webhook_dead_letter_queue',
      resourceId: id,
      resourceName: `${entry.source}:${entry.event_type ?? 'unknown'}`,
      metadata: {
        dlq_id: id,
        source: entry.source,
        event_type: entry.event_type,
        abandoned_by_admin: userId,
        reason: reason.trim(),
      },
    })

    return { success: true }
  } catch (error) {
    console.error('[abandonDeadLetterEntry] Exception:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}
