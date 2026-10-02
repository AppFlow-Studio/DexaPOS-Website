import { describe, expect, it } from 'vitest'
import type { PlatformAuditLogRow } from '@/app/manage/actions/hq-platform/analytics'
import {
  auditLogHref,
  auditLogsListHref,
  describeAnomaly,
  detectAnomalies,
  parseAnomaly,
} from '../audit-log-shared'

function row(id: string, action: string, createdAt: string, actor = 'user-1'): PlatformAuditLogRow {
  return { id, action, created_at: createdAt, actor_user_id: actor }
}

describe('auditLogsListHref', () => {
  it('returns the bare list without a saved query', () => {
    expect(auditLogsListHref(null)).toBe('/manage/audit-logs')
    expect(auditLogsListHref('')).toBe('/manage/audit-logs')
  })

  it('restores the saved tab, page and filters', () => {
    expect(auditLogsListHref('tab=flagged&page=3&q=void')).toBe('/manage/audit-logs?tab=flagged&page=3&q=void')
  })

  it('only ever appends to the list path', () => {
    expect(auditLogsListHref('//evil.example/x')).toBe('/manage/audit-logs?//evil.example/x')
    expect(auditLogsListHref('?page=2')).toBe('/manage/audit-logs?page=2')
  })
})

describe('auditLogHref', () => {
  it('links to the entry and carries the list state and anomaly code', () => {
    const href = auditLogHref('abc', { listQuery: 'page=2&q=a b', anomaly: { kind: 'voids', count: 7 } })
    const url = new URL(href, 'http://x')
    expect(url.pathname).toBe('/manage/audit-logs/abc')
    expect(url.searchParams.get('list')).toBe('page=2&q=a b')
    expect(parseAnomaly(url.searchParams.get('anomaly'))).toEqual({ kind: 'voids', count: 7 })
  })

  it('has no query when there is nothing to carry', () => {
    expect(auditLogHref('abc')).toBe('/manage/audit-logs/abc')
  })
})

describe('parseAnomaly', () => {
  it('reads each code', () => {
    expect(parseAnomaly('deletes:6')).toEqual({ kind: 'deletes', count: 6 })
    expect(parseAnomaly('after-hours:23')).toEqual({ kind: 'after-hours', hour: 23 })
  })

  it('rejects free text and impossible values', () => {
    expect(parseAnomaly(null)).toBeNull()
    expect(parseAnomaly('This merchant is committing fraud')).toBeNull()
    expect(parseAnomaly('after-hours:25')).toBeNull()
    expect(parseAnomaly('voids:2')).toBeNull()
  })
})

describe('detectAnomalies', () => {
  it('flags 5+ voids by one actor within an hour', () => {
    const rows = Array.from({ length: 5 }, (_, i) =>
      row(`v${i}`, 'order_voided', new Date(2026, 8, 30, 12, i * 5).toISOString())
    )
    const found = detectAnomalies(rows)
    expect(found.get('v0')).toEqual({ kind: 'voids', count: 5 })
    expect(describeAnomaly(found.get('v0')!)).toBe('5 voids/cancels by same actor within 1 hour')
  })

  it('leaves 4 voids alone', () => {
    const rows = Array.from({ length: 4 }, (_, i) =>
      row(`v${i}`, 'order_voided', new Date(2026, 8, 30, 12, i * 5).toISOString())
    )
    expect(detectAnomalies(rows).size).toBe(0)
  })

  it('flags after-hours actions in local time', () => {
    const found = detectAnomalies([row('n1', 'settings_updated', new Date(2026, 8, 30, 23, 15).toISOString())])
    expect(found.get('n1')).toEqual({ kind: 'after-hours', hour: 23 })
  })
})
