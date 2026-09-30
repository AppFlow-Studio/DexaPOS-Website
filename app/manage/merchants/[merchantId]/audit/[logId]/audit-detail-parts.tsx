'use client'

import { useState } from 'react'
import { format, isValid, parseISO } from 'date-fns'
import { cn } from '@/lib/utils'

/*
 * The body of an audit entry's page: the before/after diff and the request
 * context. These lived inline in the merchant audit tab's expandable row until
 * each entry got its own page.
 *
 * ⚠️ Classes are literal strings in this .tsx on purpose (C7).
 */

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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/

const isEmpty = (value: unknown) => value === null || value === undefined || value === ''

const isRecord = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value)

/** One recorded value in words: booleans as Yes/No, timestamps as dates. */
function Value({ value, muted = false }: { value: unknown; muted?: boolean }) {
    if (isEmpty(value)) {
        return <span className="text-sm italic text-muted-foreground">Empty</span>
    }

    if (Array.isArray(value)) {
        if (value.length === 0) return <span className="text-sm italic text-muted-foreground">None</span>
        if (value.every((v) => !isRecord(v) && !Array.isArray(v))) {
            return <Value value={value.map(String).join(', ')} muted={muted} />
        }
        return <NestedList data={Object.fromEntries(value.map((v, i) => [`${i + 1}`, v]))} />
    }

    if (isRecord(value)) return <NestedList data={value} />

    let text = String(value)
    if (typeof value === 'boolean') text = value ? 'Yes' : 'No'
    else if (typeof value === 'string' && ISO_TIMESTAMP.test(value)) {
        const date = parseISO(value)
        if (isValid(date)) text = format(date, 'MMM d, yyyy, HH:mm:ss')
    }

    return (
        <span
            className={cn(
                // `break-words`, not `break-all`: long text wraps at spaces.
                'min-w-0 break-words',
                typeof value === 'string' && UUID.test(value) ? 'font-mono text-xs' : 'text-sm',
                muted ? 'text-muted-foreground' : 'font-medium text-foreground'
            )}
            title={text !== String(value) ? String(value) : undefined}
        >
            {text}
        </span>
    )
}

/** A nested object as an indented label/value list. */
function NestedList({ data }: { data: Record<string, unknown> }) {
    const entries = Object.entries(data).filter(([, v]) => !isEmpty(v))
    if (entries.length === 0) return <span className="text-sm italic text-muted-foreground">Empty</span>
    return (
        <dl className="min-w-0 space-y-1.5 border-l border-border/70 pl-3">
            {entries.map(([key, value]) => (
                <div key={key} className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                    <dt className="text-xs text-muted-foreground">{formatKey(key)}</dt>
                    <dd className="min-w-0">
                        <Value value={value} />
                    </dd>
                </div>
            ))}
        </dl>
    )
}

/**
 * A field/value list: label over value on phones, side by side from `sm`.
 * `stacked` keeps label over value at every width, for a narrow column.
 */
function FieldList({ entries, stacked = false }: { entries: [string, React.ReactNode][]; stacked?: boolean }) {
    return (
        <dl className="min-w-0 divide-y divide-border/60">
            {entries.map(([key, node]) => (
                <div
                    key={key}
                    className={cn(
                        'grid min-w-0 grid-cols-1 gap-1 py-3 first:pt-0 last:pb-0',
                        !stacked && 'sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] sm:gap-4'
                    )}
                >
                    <dt className={cn('text-xs text-muted-foreground', !stacked && 'sm:pt-0.5 sm:text-sm')}>
                        {formatKey(key)}
                    </dt>
                    <dd className="flex min-w-0 flex-col">{node}</dd>
                </div>
            ))}
        </dl>
    )
}

type Changes = { before?: unknown; after?: unknown } & Record<string, unknown>

export type ChangesShape =
    | { kind: 'none' }
    | { kind: 'update'; before: Record<string, unknown>; after: Record<string, unknown> }
    | { kind: 'created' | 'removed' | 'snapshot'; values: Record<string, unknown> }

/**
 * What an entry's `changes` column holds. `buildAuditChanges` writes
 * `{ before, after }` with unchanged fields dropped; a create has `after` only,
 * a delete `before` only, and older rows may hold a bare snapshot.
 */
export function readChanges(changes: unknown): ChangesShape {
    if (!isRecord(changes) || Object.keys(changes).length === 0) return { kind: 'none' }
    const c = changes as Changes
    const before = isRecord(c.before) ? c.before : null
    const after = isRecord(c.after) ? c.after : null
    if (before && after) return { kind: 'update', before, after }
    if (after) return Object.keys(after).length ? { kind: 'created', values: after } : { kind: 'none' }
    if (before) return Object.keys(before).length ? { kind: 'removed', values: before } : { kind: 'none' }
    return { kind: 'snapshot', values: changes }
}

/** The caption under the Changes heading, in words. */
export function describeChanges(shape: ChangesShape, resource: string): string {
    switch (shape.kind) {
        case 'none':
            return 'Nothing was recorded as changed.'
        case 'update': {
            const n = changedKeys(shape.before, shape.after).length
            return n === 1 ? '1 field changed.' : `${n} fields changed.`
        }
        case 'created':
            return `The values this ${resource} was created with.`
        case 'removed':
            return `The values this ${resource} had when it was removed.`
        case 'snapshot':
            return 'The data recorded with this action.'
    }
}

function allKeys(before: Record<string, unknown>, after: Record<string, unknown>) {
    return Array.from(new Set([...Object.keys(before), ...Object.keys(after)]))
}

function changedKeys(before: Record<string, unknown>, after: Record<string, unknown>) {
    return allKeys(before, after).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]))
}

/** The Changes section body for any `ChangesShape`. */
export function AuditChanges({ shape }: { shape: ChangesShape }) {
    if (shape.kind === 'none') {
        return (
            <p className="rounded-2xl bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
                This action didn&apos;t change any data.
            </p>
        )
    }
    if (shape.kind === 'update') return <UpdateDiff before={shape.before} after={shape.after} />
    return <FieldList entries={Object.entries(shape.values).map(([k, v]) => [k, <Value key={k} value={v} />])} />
}

/**
 * Before → after, one row per field. Three columns from `sm`; on phones each
 * field stacks its Before and After lines so nothing scrolls sideways. Fields
 * that did not change (rows written before diffing existed carry full
 * snapshots) fold away behind a toggle.
 */
function UpdateDiff({ before, after }: { before: Record<string, unknown>; after: Record<string, unknown> }) {
    const [showUnchanged, setShowUnchanged] = useState(false)
    const changed = changedKeys(before, after)
    const unchanged = allKeys(before, after).filter((k) => !changed.includes(k))
    const rows = showUnchanged ? [...changed, ...unchanged] : changed

    return (
        <div className="min-w-0">
            <div className="hidden grid-cols-[minmax(0,12rem)_minmax(0,1fr)_minmax(0,1fr)] gap-4 pb-2 text-xs text-muted-foreground sm:grid">
                <span>Field</span>
                <span>Before</span>
                <span>After</span>
            </div>
            <div className="min-w-0 divide-y divide-border/60 sm:border-t sm:border-border/60">
                {rows.map((key) => {
                    const isChanged = changed.includes(key)
                    return (
                        <div
                            key={key}
                            className="grid min-w-0 grid-cols-1 gap-1.5 py-3 first:pt-0 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_minmax(0,1fr)] sm:gap-4 sm:first:pt-3"
                        >
                            <span className="text-sm font-medium sm:pt-0.5 sm:font-normal sm:text-muted-foreground">
                                {formatKey(key)}
                            </span>
                            <div className="flex min-w-0 items-baseline gap-3">
                                <span className="w-12 shrink-0 text-xs text-muted-foreground sm:hidden">Before</span>
                                <Value value={before[key]} muted />
                            </div>
                            <div className="flex min-w-0 items-baseline gap-3">
                                <span className="w-12 shrink-0 text-xs text-muted-foreground sm:hidden">After</span>
                                {isChanged ? (
                                    <Value value={after[key]} />
                                ) : (
                                    <span className="text-sm text-muted-foreground">No change</span>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>
            {unchanged.length > 0 && (
                <button
                    type="button"
                    onClick={() => setShowUnchanged((v) => !v)}
                    className="mt-3 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                    {showUnchanged
                        ? 'Hide unchanged fields'
                        : `Show ${unchanged.length} unchanged field${unchanged.length === 1 ? '' : 's'}`}
                </button>
            )}
        </div>
    )
}

/**
 * Turn a raw user agent into something a reviewer can read at a glance —
 * "Chrome 152 on Windows" rather than 120 characters of tokens. Deliberately
 * approximate: the raw string stays underneath, so a wrong guess costs nothing.
 */
function describeUserAgent(ua: string): string | null {
    const os = /Windows/.test(ua)
        ? 'Windows'
        : /iPhone|iPad/.test(ua)
          ? 'iOS'
          : /Android/.test(ua)
            ? 'Android'
            : /Mac OS X/.test(ua)
              ? 'macOS'
              : /Linux/.test(ua)
                ? 'Linux'
                : null

    // Order matters: Edge and Opera both carry "Chrome" in their UA string, and
    // Chrome carries "Safari", so the more specific brands are tested first.
    const brands: [RegExp, string][] = [
        [/Edg\/(\d+)/, 'Edge'],
        [/OPR\/(\d+)/, 'Opera'],
        [/Firefox\/(\d+)/, 'Firefox'],
        [/Chrome\/(\d+)/, 'Chrome'],
        [/Version\/(\d+).*Safari/, 'Safari'],
    ]
    let browser: string | null = null
    for (const [pattern, name] of brands) {
        const match = pattern.exec(ua)
        if (match) {
            browser = `${name} ${match[1]}`
            break
        }
    }

    if (!browser) return os
    return os ? `${browser} on ${os}` : browser
}

/** Loopback and private ranges mean "this server" / "internal network". */
function describeIpAddress(ip: string): string | null {
    if (ip === '::1' || ip === '127.0.0.1') return 'Local machine'
    if (/^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return 'Internal network'
    return null
}

const FRIENDLY_METADATA: Record<string, (v: string) => string | null> = {
    ip_address: describeIpAddress,
    user_agent: describeUserAgent,
}

/**
 * Metadata rendered for people rather than machines: a plain-language label,
 * with the raw value kept underneath so nothing is lost.
 */
export function AuditMetadata({ data }: { data: Record<string, unknown> }) {
    const entries = Object.entries(data).filter(([, v]) => !isEmpty(v))
    return (
        <FieldList
            stacked
            entries={entries.map(([key, value]) => {
                const friendly = typeof value === 'string' ? (FRIENDLY_METADATA[key]?.(value) ?? null) : null
                return [
                    key,
                    friendly ? (
                        <>
                            <span className="text-sm font-medium">{friendly}</span>
                            <span className="mt-0.5 break-words font-mono text-xs text-muted-foreground">
                                {String(value)}
                            </span>
                        </>
                    ) : (
                        <Value value={value} />
                    ),
                ]
            })}
        />
    )
}
