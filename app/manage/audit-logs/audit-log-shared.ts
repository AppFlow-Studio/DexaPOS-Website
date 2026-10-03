import { useSyncExternalStore } from 'react'
import { format, formatDistanceToNow } from 'date-fns'
import type { PlatformAuditLogRow } from '@/app/manage/actions/hq-platform/analytics'
import type { AuditCategory, AuditLogWithLocation } from '@/types/audit-log'
import { CATEGORY_LABELS } from '@/types/audit-log'

/*
 * What the platform audit list (/manage/audit-logs) and one entry's page
 * (/manage/audit-logs/[logId]) share: labels, links, anomaly codes and the
 * localStorage flags. No class names live here (C7).
 */

// ─── Links ────────────────────────────────────────────────────────────────────

export const AUDIT_LOGS_HREF = '/manage/audit-logs'

/**
 * The list, restored to a saved query string (tab, page and filters), so Back
 * from an entry lands on the same page of 10 (§5.9). Only ever appended to the
 * fixed list path, so a crafted value cannot send the user elsewhere.
 */
export function auditLogsListHref(listQuery?: string | null): string {
  const query = (listQuery ?? '').replace(/^\?/, '')
  return query ? `${AUDIT_LOGS_HREF}?${query}` : AUDIT_LOGS_HREF
}

/** One entry's page, carrying the list state back and any anomaly the list found. */
export function auditLogHref(
  logId: string,
  options: { listQuery?: string; anomaly?: AuditAnomaly } = {}
): string {
  const params = new URLSearchParams()
  if (options.listQuery) params.set('list', options.listQuery)
  if (options.anomaly) params.set('anomaly', encodeAnomaly(options.anomaly))
  const query = params.toString()
  return `${AUDIT_LOGS_HREF}/${encodeURIComponent(logId)}${query ? `?${query}` : ''}`
}

// ─── Labels ───────────────────────────────────────────────────────────────────

export function formatActionLabel(value?: string): string {
  if (!value) return '—'
  return value.replace(/\./g, ' ').replace(/_/g, ' ').split(' ').filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

export function categoryLabel(value?: string): string {
  if (!value) return '—'
  return CATEGORY_LABELS[value as AuditCategory] ?? formatActionLabel(value)
}

export function normalizeStatus(value?: string): 'success' | 'failed' | 'unknown' {
  if (!value) return 'success'
  const n = value.toLowerCase()
  if (n === 'failed' || n === 'error') return 'failed'
  if (n === 'success') return 'success'
  return 'unknown'
}

export const STATUS_LABELS: Record<ReturnType<typeof normalizeStatus>, string> = {
  success: 'Success',
  failed: 'Failed',
  unknown: 'Unknown',
}

export function inferOrgType(row: PlatformAuditLogRow): string {
  if (row.organization_type) return row.organization_type
  if (row.merchant_id) return 'Merchant'
  return 'System'
}

export function relativeTime(dateStr: string): string {
  return formatDistanceToNow(new Date(dateStr), { addSuffix: true })
}

/**
 * Compact time for phone cards: "just now", "5m ago", "16h ago", "3d ago",
 * then the date. No "about", which costs a phone line its width.
 */
export function shortRelativeTime(dateStr: string, now: Date = new Date()): string {
  const date = new Date(dateStr)
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return format(date, date.getFullYear() === now.getFullYear() ? 'MMM d' : 'MMM d, yyyy')
}

export function absoluteTime(dateStr: string): string {
  return format(new Date(dateStr), 'MMM d, yyyy h:mm:ss a')
}

/** The platform row in the shape `buildAuditSentence` reads. */
export function rowToFakeLog(row: PlatformAuditLogRow): AuditLogWithLocation {
  return {
    id: row.id,
    action: row.action,
    action_category: row.action_category as AuditLogWithLocation['action_category'],
    severity: row.severity as AuditLogWithLocation['severity'],
    resource_type: row.resource_type,
    resource_name: row.resource_name,
    resource_id: row.resource_id,
    actor_name: row.actor_name,
    actor_user_id: null,
    actor_role: row.actor_role,
    merchant_id: row.merchant_id as unknown as string,
    location_id: row.location_id as unknown as string,
    changes: row.changes as AuditLogWithLocation['changes'],
    metadata: row.metadata as AuditLogWithLocation['metadata'],
    created_at: row.created_at ?? '',
    location: row.location_name
      ? { id: row.location_id ?? '', name: row.location_name }
      : undefined,
    settlement_terminal: row.settlement_terminal,
    settlement_batch: row.settlement_batch,
  } as AuditLogWithLocation
}

// ─── Anomaly detection (client-side) ─────────────────────────────────────────

/**
 * An anomaly found among the events the list has loaded. It is a code, not
 * free text, so the entry page can say it without trusting a sentence taken
 * from its URL.
 */
export type AuditAnomaly =
  | { kind: 'voids'; count: number }
  | { kind: 'deletes'; count: number }
  | { kind: 'after-hours'; hour: number }

export function describeAnomaly(anomaly: AuditAnomaly): string {
  switch (anomaly.kind) {
    case 'voids':
      return `${anomaly.count} voids/cancels by same actor within 1 hour`
    case 'deletes':
      return `${anomaly.count} bulk deletions by same actor within 1 hour`
    case 'after-hours':
      return `After-hours access at ${anomaly.hour}:00`
  }
}

function encodeAnomaly(anomaly: AuditAnomaly): string {
  return anomaly.kind === 'after-hours' ? `after-hours:${anomaly.hour}` : `${anomaly.kind}:${anomaly.count}`
}

export function parseAnomaly(raw: string | null): AuditAnomaly | null {
  const match = /^(voids|deletes|after-hours):(\d{1,4})$/.exec(raw ?? '')
  if (!match) return null
  const value = Number(match[2])
  if (match[1] === 'after-hours') return value < 24 ? { kind: 'after-hours', hour: value } : null
  return value >= 5 ? { kind: match[1] as 'voids' | 'deletes', count: value } : null
}

/** Bursts of 5+ matching actions by one actor within an hour. */
function detectBursts(
  rows: PlatformAuditLogRow[],
  matches: (action: string) => boolean,
  kind: 'voids' | 'deletes',
  result: Map<string, AuditAnomaly>
) {
  const byActor = new Map<string, Array<{ time: number; id: string }>>()
  rows.forEach((row) => {
    if (matches((row.action || '').toLowerCase()) && row.actor_user_id) {
      const bucket = byActor.get(row.actor_user_id) ?? []
      bucket.push({ time: new Date(row.created_at).getTime(), id: row.id })
      byActor.set(row.actor_user_id, bucket)
    }
  })
  byActor.forEach((events) => {
    for (let i = 0; i < events.length; i++) {
      const inWindow = events.filter((e) => Math.abs(e.time - events[i].time) <= 3_600_000)
      if (inWindow.length >= 5) {
        inWindow.forEach((e) => {
          if (!result.has(e.id)) result.set(e.id, { kind, count: inWindow.length })
        })
      }
    }
  })
}

export function detectAnomalies(rows: PlatformAuditLogRow[]): Map<string, AuditAnomaly> {
  const result = new Map<string, AuditAnomaly>()

  // Pattern 1: Same actor voiding/cancelling 5+ orders within 1 hour
  detectBursts(rows, (a) => a.includes('void') || a.includes('cancel'), 'voids', result)
  // Pattern 2: Bulk deletions — 5+ deletes in 1 hour by same actor
  detectBursts(rows, (a) => a.includes('delet'), 'deletes', result)

  // Pattern 3: After-hours access (10pm–5am local time)
  rows.forEach((row) => {
    if (!row.actor_user_id) return
    const hour = new Date(row.created_at).getHours()
    if ((hour >= 22 || hour < 5) && !result.has(row.id)) {
      result.set(row.id, { kind: 'after-hours', hour })
    }
  })

  return result
}

// ─── Flags (localStorage) ────────────────────────────────────────────────────

/*
 * Flags are per browser, not shared between admins. They are read through
 * `useSyncExternalStore` so the server render and the first client render
 * agree (no flags), and the list and an entry's page stay in step.
 */

const FLAG_KEY = 'dexa_admin_flagged_audit_logs'
const NO_FLAGS: ReadonlySet<string> = new Set()
const listeners = new Set<() => void>()
let snapshot: { raw: string | null; ids: ReadonlySet<string> } = { raw: null, ids: NO_FLAGS }

function readFlags(): ReadonlySet<string> {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(FLAG_KEY)
  } catch { /* storage blocked: no flags */ }
  if (raw !== snapshot.raw) {
    let ids: ReadonlySet<string> = NO_FLAGS
    try {
      ids = raw ? new Set<string>(JSON.parse(raw)) : NO_FLAGS
    } catch { /* corrupt value: no flags */ }
    snapshot = { raw, ids }
  }
  return snapshot.ids
}

function subscribeFlags(onChange: () => void) {
  listeners.add(onChange)
  const onStorage = (event: StorageEvent) => {
    if (event.key === FLAG_KEY) onChange()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('storage', onStorage)
  }
}

export function useFlaggedAuditLogIds(): ReadonlySet<string> {
  return useSyncExternalStore(subscribeFlags, readFlags, () => NO_FLAGS)
}

export function toggleAuditLogFlag(id: string): void {
  const next = new Set(readFlags())
  if (next.has(id)) next.delete(id)
  else next.add(id)
  try {
    localStorage.setItem(FLAG_KEY, JSON.stringify([...next]))
  } catch { /* ignore */ }
  listeners.forEach((listener) => listener())
}
