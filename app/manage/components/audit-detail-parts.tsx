'use client'

import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import {
    UUID,
    diffChanges,
    formatKey,
    formatScalar,
    isEmpty,
    isRecord,
    readChanges,
    summarizeValue,
    type ChangesShape,
    type DiffRow,
} from './audit-diff'

export { formatKey, readChanges }
export type { ChangesShape }

/*
 * The body of an audit entry's page: what changed and the request context.
 * Shared by the merchant audit entry page (merchants/[merchantId]/audit/[logId])
 * and the platform one (audit-logs/[logId]). The diff itself is computed in
 * `audit-diff.ts`; this file only renders it. Rows are separated by spacing,
 * never rules (§5.5), and change is said in words, never colour (§3.5).
 *
 * ⚠️ Classes are literal strings in this .tsx on purpose (C7).
 */

/** One recorded value in words: booleans as Yes/No, timestamps as dates, codes humanised. */
function Value({ value, muted = false }: { value: unknown; muted?: boolean }) {
    if (isEmpty(value)) {
        return <span className="text-sm italic text-muted-foreground">Empty</span>
    }

    if (Array.isArray(value)) {
        if (value.length === 0) return <span className="text-sm italic text-muted-foreground">None</span>
        // A list reads as one line — its items' names, or a count — never a tree of ids.
        return <Value value={summarizeValue(value)} muted={muted} />
    }

    if (isRecord(value)) return <NestedList data={value} />

    const text = formatScalar(value)
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
        <dl className="min-w-0">
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

/**
 * The caption under the Changes heading, in words. None when nothing changed:
 * `AuditChanges` already says so in the body, and a caption repeating it
 * reads twice.
 */
export function describeChanges(shape: ChangesShape, resource: string): string | undefined {
    switch (shape.kind) {
        case 'none':
            return undefined
        case 'update': {
            const n = diffChanges(shape.before, shape.after).changes.length
            if (n === 0) return undefined
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

function NoChange() {
    return (
        <p className="rounded-2xl bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
            This action didn&apos;t change any data.
        </p>
    )
}

/** The Changes section body for any `ChangesShape`. */
export function AuditChanges({ shape }: { shape: ChangesShape }) {
    if (shape.kind === 'none') return <NoChange />
    if (shape.kind === 'update') return <UpdateDiff before={shape.before} after={shape.after} />
    return <FieldList entries={Object.entries(shape.values).map(([k, v]) => [k, <Value key={k} value={v} />])} />
}

// ─── The diff ─────────────────────────────────────────────────────────────────

/** A value inside a change row: plain values in words, lists and records by name. */
function InlineValue({ value, previous = false }: { value: unknown; previous?: boolean }) {
    const scalar = !isRecord(value) && !Array.isArray(value)
    const text = scalar ? formatScalar(value) : summarizeValue(value)
    const raw = scalar && !isEmpty(value) && text !== String(value) ? String(value) : undefined
    return (
        <span
            title={raw}
            className={cn(
                'min-w-0 break-words',
                typeof value === 'string' && UUID.test(value) ? 'font-mono text-xs' : 'text-sm',
                // Before is quieter than after; no strike-through, which made short values unreadable.
                previous ? 'text-muted-foreground' : 'font-medium text-foreground'
            )}
        >
            {text}
        </span>
    )
}

function NotSet() {
    return <span className="text-sm italic text-muted-foreground">Not set</span>
}

function Arrow() {
    return (
        <>
            <span aria-hidden className="text-sm text-muted-foreground">→</span>
            <span className="sr-only"> to </span>
        </>
    )
}

/**
 * What happened to one value, always read left to right as before → after.
 * A field that gained or lost a value reads "Not set → Seat 7" / "1 → Not set";
 * an entry added to or removed from a list says so in words.
 */
function ChangeValue({ row }: { row: DiffRow }) {
    switch (row.kind) {
        case 'changed':
            return (
                <>
                    <span className="sr-only">Changed from </span>
                    <InlineValue value={row.before} previous />
                    <Arrow />
                    <InlineValue value={row.after} />
                </>
            )
        case 'added':
            return row.item ? (
                <>
                    <span className="text-sm text-muted-foreground">Added</span>
                    <InlineValue value={row.after} />
                </>
            ) : (
                <>
                    <NotSet />
                    <Arrow />
                    <InlineValue value={row.after} />
                </>
            )
        case 'removed':
            return row.item ? (
                <>
                    <span className="text-sm text-muted-foreground">Removed</span>
                    <InlineValue value={row.before} />
                </>
            ) : (
                <>
                    <InlineValue value={row.before} previous />
                    <Arrow />
                    <NotSet />
                </>
            )
        case 'reordered':
            return <span className="text-sm text-muted-foreground">Same items, in a new order</span>
    }
}

/** Rows that share a parent ("Kiosk settings") sit under it once, in first-seen order. */
function groupByParent(rows: DiffRow[]) {
    const groups: { parent: string; rows: DiffRow[] }[] = []
    for (const row of rows) {
        const parent = row.path.slice(0, -1).join(' › ')
        const group = groups.find((g) => g.parent === parent)
        if (group) group.rows.push(row)
        else groups.push({ parent, rows: [row] })
    }
    return groups
}

/**
 * The values that changed, grouped under their parent setting. Each change is
 * its own inset well (§3.1 tier 3): the field on the left and before → after on
 * the right from `sm`, stacked on phones, so rows separate by surface, not
 * rules (§5.5). Unchanged values are one tap away on tablet and up; phones get
 * only what changed (§13.4).
 */
function UpdateDiff({ before, after }: { before: Record<string, unknown>; after: Record<string, unknown> }) {
    const [showUnchanged, setShowUnchanged] = useState(false)
    const { changes, unchanged } = useMemo(() => diffChanges(before, after), [before, after])

    if (changes.length === 0) return <NoChange />

    return (
        <div className="min-w-0 space-y-5">
            {groupByParent(changes).map((group) => (
                <section key={group.parent || 'top'} className="min-w-0">
                    {group.parent && <p className="mb-2 text-sm text-muted-foreground">{group.parent}</p>}
                    <ul className="min-w-0 space-y-2">
                        {group.rows.map((row, i) => (
                            <li
                                key={i}
                                className="grid min-w-0 gap-1 rounded-2xl bg-muted/40 px-4 py-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] sm:items-baseline sm:gap-4"
                            >
                                <p className="min-w-0 break-words text-sm font-medium">
                                    {row.path[row.path.length - 1] ?? 'Value'}
                                </p>
                                <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                                    <ChangeValue row={row} />
                                </div>
                            </li>
                        ))}
                    </ul>
                </section>
            ))}

            {unchanged.length > 0 && (
                <div className="min-w-0 max-sm:hidden">
                    {showUnchanged && (
                        <div className="mb-3 min-w-0 rounded-2xl bg-muted/20 px-4 py-3">
                            <p className="mb-2 text-xs text-muted-foreground">Unchanged</p>
                            <ul className="min-w-0 space-y-2">
                                {unchanged.map((row, i) => (
                                    <li
                                        key={i}
                                        className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5"
                                    >
                                        <span className="min-w-0 break-words text-sm text-muted-foreground">
                                            {row.path.join(' › ')}
                                        </span>
                                        <span className="min-w-0 break-words text-sm">
                                            {Array.isArray(row.value) || isRecord(row.value)
                                                ? summarizeValue(row.value)
                                                : formatScalar(row.value)}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    <button
                        type="button"
                        aria-expanded={showUnchanged}
                        onClick={() => setShowUnchanged((v) => !v)}
                        className="text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
                    >
                        {showUnchanged
                            ? 'Hide unchanged fields'
                            : `Show ${unchanged.length} unchanged field${unchanged.length === 1 ? '' : 's'}`}
                    </button>
                </div>
            )}
        </div>
    )
}

// ─── Request context ─────────────────────────────────────────────────────────

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
