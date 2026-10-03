import { format, isValid, parseISO } from 'date-fns'

/*
 * What an audit entry's `changes` column says changed, as data. Pure, so it is
 * unit-tested on its own; `audit-detail-parts.tsx` renders it. No class names
 * live here (C7).
 *
 * The diff walks into nested objects and lists, so a settings object with one
 * changed value reads as that one value ("Kiosk settings › Seat mode: Ask →
 * Fixed") rather than the whole object twice.
 */

// ─── Labels ───────────────────────────────────────────────────────────────────

/** Words that read wrong in title case ("Ein", "Ip address"). */
const ACRONYMS: Record<string, string> = {
    id: 'ID',
    ids: 'IDs',
    ein: 'EIN',
    ip: 'IP',
    url: 'URL',
    sku: 'SKU',
    pin: 'PIN',
    pos: 'POS',
    mid: 'MID',
    tid: 'TID',
    api: 'API',
}

/** `business_phone` / `businessPhone` → "Business phone". */
export function formatKey(key: string): string {
    const words = key
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .split(/[\s_-]+/)
        .filter(Boolean)
        .map((word) => word.toLowerCase())
    return words
        .map((word, i) => ACRONYMS[word] ?? (i === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word))
        .join(' ')
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/
/** A stored code such as `dine_in_only` or `ask`: lowercase, no spaces. */
const STORED_CODE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/

export const isRecord = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value)

/** No value at all: null, undefined or an empty string. */
export const isEmpty = (value: unknown) => value === null || value === undefined || value === ''

/** One plain value in words: Yes/No, dates, stored codes humanised; free text as written. */
export function formatScalar(value: unknown): string {
    if (isEmpty(value)) return 'Empty'
    if (typeof value === 'boolean') return value ? 'Yes' : 'No'
    if (typeof value !== 'string') return String(value)
    if (ISO_TIMESTAMP.test(value)) {
        const date = parseISO(value)
        if (isValid(date)) return format(date, 'MMM d, yyyy, HH:mm:ss')
    }
    if (STORED_CODE.test(value)) return formatKey(value)
    return value
}

function labelOf(item: Record<string, unknown>): string | null {
    for (const key of ['label', 'name', 'title', 'display_name']) {
        const value = item[key]
        if (typeof value === 'string' && value.trim()) return value
    }
    return null
}

/** How a record in a list is named: its label, name or title, else its position. */
export function itemLabel(item: unknown, index: number): string {
    return (isRecord(item) && labelOf(item)) || `Item ${index + 1}`
}

const SUMMARY_LIMIT = 5

/** A value in one line: a list by its items' names, a record by its name. */
export function summarizeValue(value: unknown): string {
    if (Array.isArray(value)) {
        if (value.length === 0) return 'None'
        let names: string[] | null = null
        if (value.every((v) => !isRecord(v) && !Array.isArray(v))) names = value.map(formatScalar)
        else if (value.every((v) => isRecord(v) && labelOf(v))) names = value.map((v) => labelOf(v as Record<string, unknown>)!)
        if (!names) return `${value.length} items`
        if (names.length <= SUMMARY_LIMIT) return names.join(', ')
        return `${names.slice(0, SUMMARY_LIMIT).join(', ')} and ${names.length - SUMMARY_LIMIT} more`
    }
    if (isRecord(value)) {
        const label = labelOf(value)
        if (label) return label
        const count = Object.values(value).filter((v) => !isEmpty(v)).length
        return count === 1 ? '1 field' : `${count} fields`
    }
    return formatScalar(value)
}

// ─── Reading the column ──────────────────────────────────────────────────────

export type ChangesShape =
    | { kind: 'none' }
    | { kind: 'update'; before: Record<string, unknown>; after: Record<string, unknown> }
    | { kind: 'created' | 'removed' | 'snapshot'; values: Record<string, unknown> }

const isFieldDiff = (value: unknown): value is { old?: unknown; new?: unknown } =>
    isRecord(value) && ('old' in value || 'new' in value)

/**
 * What an entry's `changes` column holds. `buildAuditChanges` writes
 * `{ before, after }` with unchanged fields dropped; a create has `after` only,
 * a delete `before` only. Newer writers use `{ field: { old, new } }`, and
 * older rows may hold a bare snapshot.
 */
export function readChanges(changes: unknown): ChangesShape {
    if (!isRecord(changes) || Object.keys(changes).length === 0) return { kind: 'none' }

    const fieldDiffs = Object.entries(changes).filter(
        ([key, value]) => key !== 'before' && key !== 'after' && isFieldDiff(value)
    )
    if (fieldDiffs.length > 0) {
        const before: Record<string, unknown> = {}
        const after: Record<string, unknown> = {}
        for (const [key, value] of fieldDiffs) {
            const diff = value as { old?: unknown; new?: unknown }
            before[key] = diff.old ?? null
            after[key] = diff.new ?? null
        }
        return { kind: 'update', before, after }
    }

    const before = isRecord(changes.before) ? changes.before : null
    const after = isRecord(changes.after) ? changes.after : null
    if (before && after) return { kind: 'update', before, after }
    if (after) return Object.keys(after).length ? { kind: 'created', values: after } : { kind: 'none' }
    if (before) return Object.keys(before).length ? { kind: 'removed', values: before } : { kind: 'none' }
    return { kind: 'snapshot', values: changes }
}

// ─── The diff ─────────────────────────────────────────────────────────────────

export type DiffRow =
    | { kind: 'changed'; path: string[]; before: unknown; after: unknown }
    /** `item`: an entry added to or removed from a list, rather than a field gaining or losing a value. */
    | { kind: 'added'; path: string[]; after: unknown; item?: true }
    | { kind: 'removed'; path: string[]; before: unknown; item?: true }
    | { kind: 'reordered'; path: string[] }

export interface UnchangedRow {
    path: string[]
    value: unknown
}

export interface AuditDiff {
    changes: DiffRow[]
    /** Values that did not change, next to ones that did — hidden until asked for. */
    unchanged: UnchangedRow[]
}

function deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true
    if (Array.isArray(a) && Array.isArray(b)) {
        return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]))
    }
    if (isRecord(a) && isRecord(b)) {
        const keys = new Set([...Object.keys(a), ...Object.keys(b)])
        for (const key of keys) if (!deepEqual(a[key], b[key])) return false
        return true
    }
    return false
}

type RecordWithId = Record<string, unknown> & { id: string | number }

const hasId = (value: unknown): value is RecordWithId =>
    isRecord(value) && (typeof value.id === 'string' || typeof value.id === 'number')

const isScalar = (value: unknown) => !isRecord(value) && !Array.isArray(value)

/** Compare two values at `path`, appending what changed. */
function diffValue(
    before: unknown,
    after: unknown,
    path: string[],
    out: AuditDiff,
    trackUnchanged: boolean
) {
    if (isEmpty(before) && isEmpty(after)) return
    if (deepEqual(before, after)) {
        if (trackUnchanged) out.unchanged.push({ path, value: after })
        return
    }
    if (isRecord(before) && isRecord(after)) {
        diffRecord(before, after, path, out, trackUnchanged)
        return
    }
    if (Array.isArray(before) && Array.isArray(after)) {
        diffList(before, after, path, out)
        return
    }
    if (isEmpty(before)) out.changes.push({ kind: 'added', path, after })
    else if (isEmpty(after)) out.changes.push({ kind: 'removed', path, before })
    else out.changes.push({ kind: 'changed', path, before, after })
}

function diffRecord(
    before: Record<string, unknown>,
    after: Record<string, unknown>,
    path: string[],
    out: AuditDiff,
    trackUnchanged: boolean
) {
    const keys = [...Object.keys(before), ...Object.keys(after).filter((key) => !(key in before))]
    for (const key of keys) {
        diffValue(before[key], after[key], [...path, formatKey(key)], out, trackUnchanged)
    }
}

/**
 * Records with ids are matched by id, so an edit to one seat reads as that
 * seat, and adding one reads as an addition rather than every later index
 * shifting. Plain values are compared as a set. Anything else falls back to
 * the whole list, before → after.
 */
function diffList(before: unknown[], after: unknown[], path: string[], out: AuditDiff) {
    const all = [...before, ...after]

    if (all.every(hasId)) {
        const afterIds = new Map((after as RecordWithId[]).map((item) => [String(item.id), item]))
        const beforeIds = new Map((before as RecordWithId[]).map((item) => [String(item.id), item]))
        const startCount = out.changes.length

        for (const item of before as RecordWithId[]) {
            if (!afterIds.has(String(item.id))) out.changes.push({ kind: 'removed', path, before: item, item: true })
        }
        ;(after as RecordWithId[]).forEach((item, index) => {
            const previous = beforeIds.get(String(item.id))
            if (!previous) {
                out.changes.push({ kind: 'added', path, after: item, item: true })
                return
            }
            // Unchanged fields inside a list item (its id, mostly) are noise.
            diffValue(previous, item, [...path, itemLabel(item, index)], out, false)
        })

        const kept = (ids: RecordWithId[]) => ids.map((item) => String(item.id)).filter((id) => beforeIds.has(id) && afterIds.has(id))
        const reordered = kept(before as RecordWithId[]).join('\u0000') !== kept(after as RecordWithId[]).join('\u0000')
        if (reordered && out.changes.length === startCount) out.changes.push({ kind: 'reordered', path })
        return
    }

    if (all.every(isScalar)) {
        const remaining = [...after]
        const removed: unknown[] = []
        for (const value of before) {
            const at = remaining.findIndex((candidate) => deepEqual(candidate, value))
            if (at === -1) removed.push(value)
            else remaining.splice(at, 1)
        }
        removed.forEach((value) => out.changes.push({ kind: 'removed', path, before: value, item: true }))
        remaining.forEach((value) => out.changes.push({ kind: 'added', path, after: value, item: true }))
        if (removed.length === 0 && remaining.length === 0) out.changes.push({ kind: 'reordered', path })
        return
    }

    out.changes.push({ kind: 'changed', path, before, after })
}

/** Every changed value between two snapshots, with the unchanged ones beside them. */
export function diffChanges(before: Record<string, unknown>, after: Record<string, unknown>): AuditDiff {
    const out: AuditDiff = { changes: [], unchanged: [] }
    diffRecord(before, after, [], out, true)
    return out
}
