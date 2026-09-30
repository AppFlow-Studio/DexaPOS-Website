'use client'

import { format, formatDistanceToNow } from 'date-fns'
import { PanelSection, PanelSubLabel } from '@/components/dashboard/shell'
import { PaginationBar } from '@/components/dashboard/PaginationBar'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type {
    PlatformTransactionDetails,
    PlatformTransactionOrderItem,
} from '@/app/manage/actions/hq-platform/transactions'
import { useClientPagination } from '@/lib/hooks/useClientPagination'
import { cn } from '@/lib/utils'
import { DetailList, DetailRow, Fact, FactGrid } from './detail-primitives'
import { capitalise, formatDateTime, formatMoney, humanise, type PaymentActivityEntry } from './payment-format'

/*
 * The sections of /manage/transactions/payments/[paymentId] that read the full
 * order and processor record (`usePlatformTransactionDetails`). Each fact is
 * stated in exactly one section; the page holds the ledger facts.
 *
 * Every section is a full-width panel laid out in columns inside, so no panel
 * sits beside another of unrelated height and leaves a gap under it.
 *
 * ⚠️ Classes are literal strings in this .tsx on purpose (C7).
 */

/** The record's loading shape, or a worded failure with a retry (§4.9). */
export function RecordPending({ isLoading, onRetry, rows = 4 }: { isLoading: boolean; onRetry: () => void; rows?: number }) {
    if (isLoading) {
        return (
            <div className="space-y-3" aria-busy="true">
                <span className="sr-only">Loading…</span>
                {Array.from({ length: rows }, (_, i) => (
                    <Skeleton key={i} className={cn('h-4', i % 2 ? 'w-2/3' : 'w-full')} />
                ))}
            </div>
        )
    }
    return (
        <div className="rounded-2xl bg-muted/40 px-4 py-6 text-center">
            <p className="text-sm">The order and processor record didn&apos;t load.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
                Retry
            </Button>
        </div>
    )
}

/** "Sep 29, 7:34 PM"; the full date and time is in the tooltip. */
function ActivityTime({ at }: { at: string | null }) {
    if (!at) return <span className="text-xs text-muted-foreground">Time not recorded</span>
    const date = new Date(at)
    return (
        <time dateTime={at} title={format(date, 'PPpp')} className="text-xs text-muted-foreground tabular-nums">
            {format(date, 'MMM d, h:mm a')}
        </time>
    )
}

/** A name reads as-is; an unresolved id is shortened, with the full id in the tooltip. */
function Who({ by }: { by: string }) {
    const isId = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(by)
    return isId ? (
        <span className="font-mono" title={by}>
            {by.slice(0, 8)}…
        </span>
    ) : (
        <span className="text-foreground">{by}</span>
    )
}

// ── Activity ────────────────────────────────────────────────────────────────

/**
 * Every lifecycle step and reversal, oldest first. A horizontal track from
 * `lg`, where a vertical one would leave most of a full-width panel empty;
 * vertical on smaller screens.
 */
export function PaymentActivitySection({
    entries,
    isLoading,
}: {
    entries: PaymentActivityEntry[]
    isLoading: boolean
}) {
    return (
        <PanelSection label="Activity" caption="What happened to this payment, oldest first.">
            {isLoading ? (
                <RecordPending isLoading onRetry={() => undefined} rows={2} />
            ) : entries.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activity was recorded for this payment.</p>
            ) : (
                <ol className="grid min-w-0 grid-cols-1 lg:auto-cols-fr lg:grid-flow-col">
                    {entries.map((entry, index) => (
                        <li key={entry.key} className="relative min-w-0 pb-5 pl-6 last:pb-0 lg:pb-0 lg:pl-0 lg:pr-6 lg:pt-6">
                            {index < entries.length - 1 && (
                                <span
                                    aria-hidden
                                    className="absolute left-[5px] top-4 h-full w-px bg-border lg:left-[11px] lg:top-[5px] lg:h-px lg:w-[calc(100%-11px)]"
                                />
                            )}
                            <span
                                aria-hidden
                                className="absolute left-0 top-1.5 h-[11px] w-[11px] rounded-full border-2 border-muted-foreground/50 bg-card lg:top-0"
                            />
                            <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 lg:block">
                                <p className="text-sm font-medium">
                                    {entry.label}
                                    {entry.amount !== undefined && (
                                        <span className="tabular-nums"> {formatMoney(entry.amount)}</span>
                                    )}
                                </p>
                                <ActivityTime at={entry.at} />
                            </div>
                            {(entry.note || entry.by) && (
                                <p className="mt-1 break-words text-xs text-muted-foreground">
                                    {entry.note}
                                    {entry.note && entry.by && ' · '}
                                    {entry.by && (
                                        <>
                                            by <Who by={entry.by} />
                                        </>
                                    )}
                                </p>
                            )}
                            {entry.recordedAs && (
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                    Also recorded as {entry.recordedAs.join(' and ')}
                                </p>
                            )}
                        </li>
                    ))}
                </ol>
            )}
        </PanelSection>
    )
}

// ── Order ───────────────────────────────────────────────────────────────────

function itemNotes(item: PlatformTransactionOrderItem): string | null {
    const notes = [
        item.is_voided ? `Voided${item.void_reason ? ` — ${item.void_reason}` : ''}` : null,
        item.is_open_item ? 'Open item' : null,
        item.is_tax_exempt ? 'Tax exempt' : null,
    ].filter(Boolean)
    return notes.length ? notes.join(' · ') : null
}

function signedMoney(n: number) {
    return `${n > 0 ? '+' : '−'}${formatMoney(Math.abs(n))}`
}

function OrderItemsTable({ items }: { items: PlatformTransactionOrderItem[] }) {
    const { pageRows, pagination, setPage } = useClientPagination(items, 10)
    const hasDiscount = items.some((item) => Number(item.discount ?? 0) !== 0)

    return (
        <div className="min-w-0 space-y-3">
            <Table variant="data" bounded={false}>
                <TableHeader>
                    <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="hidden text-right sm:table-cell">Price</TableHead>
                        {hasDiscount && <TableHead className="hidden text-right sm:table-cell">Discount</TableHead>}
                        <TableHead className="hidden text-right sm:table-cell">Tax</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {pageRows.map((item) => {
                        const notes = itemNotes(item)
                        return (
                            <TableRow key={item.id}>
                                <TableCell className="min-w-0 whitespace-normal align-top">
                                    <div className={cn('font-medium', item.is_voided && 'text-muted-foreground line-through')}>
                                        {item.item_name}
                                        {item.size_name ? ` · ${item.size_name}` : ''}
                                    </div>
                                    {item.modifiers.map((modifier) => (
                                        <div key={modifier.id} className="text-xs text-muted-foreground tabular-nums">
                                            {modifier.modifier_group_name ? `${modifier.modifier_group_name}: ` : ''}
                                            {modifier.modifier_name || 'Modifier'}
                                            {modifier.quantity > 1 ? ` ×${modifier.quantity}` : ''}
                                            {modifier.price_modifier !== 0 ? ` (${signedMoney(modifier.price_modifier)})` : ''}
                                        </div>
                                    ))}
                                    {notes && <div className="mt-0.5 text-xs text-muted-foreground">{notes}</div>}
                                </TableCell>
                                <TableCell className="text-right align-top tabular-nums">{item.quantity}</TableCell>
                                <TableCell className="hidden text-right align-top tabular-nums sm:table-cell">
                                    {formatMoney(item.unit_price)}
                                </TableCell>
                                {hasDiscount && (
                                    <TableCell className="hidden text-right align-top tabular-nums sm:table-cell">
                                        {Number(item.discount ?? 0) !== 0 ? `−${formatMoney(Math.abs(Number(item.discount)))}` : '—'}
                                    </TableCell>
                                )}
                                <TableCell className="hidden text-right align-top tabular-nums sm:table-cell">
                                    {item.tax !== undefined ? formatMoney(item.tax) : '—'}
                                </TableCell>
                                <TableCell className="text-right align-top font-medium tabular-nums">
                                    {formatMoney(item.subtotal)}
                                </TableCell>
                            </TableRow>
                        )
                    })}
                </TableBody>
            </Table>
            <PaginationBar pagination={pagination} onPageChange={setPage} itemLabel="items" />
        </div>
    )
}

/** What was on the order and how it added up; who served it sits beside the totals. */
export function PaymentOrderSection({
    paymentId,
    detail,
    isLoading,
    onRetry,
}: {
    paymentId: string
    detail: PlatformTransactionDetails | null
    isLoading: boolean
    onRetry: () => void
}) {
    if (!detail) {
        return (
            <PanelSection label="Order">
                <RecordPending isLoading={isLoading} onRetry={onRetry} />
            </PanelSection>
        )
    }

    const segments = detail.payment_segments ?? []
    const isSplit = segments.length > 1
    const discountNames = (detail.order_discounts ?? []).map((discount) => discount.discount_name).filter(Boolean)
    const facts = [
        { label: 'Type', value: detail.order_type ? humanise(detail.order_type) : null },
        { label: 'Table', value: detail.table_number },
        { label: 'Staff', value: detail.staff_name },
        { label: 'Customer', value: detail.customer_name },
    ].filter((fact) => fact.value)

    return (
        <PanelSection label="Order" caption="What was on the order this payment belongs to, and how it added up.">
            {detail.order_items_full.length === 0 ? (
                <p className="text-sm text-muted-foreground">No items were recorded on this order.</p>
            ) : (
                <OrderItemsTable items={detail.order_items_full} />
            )}

            <div className="mt-6 grid min-w-0 grid-cols-1 items-start gap-x-10 gap-y-6 sm:grid-cols-2">
                {facts.length > 0 ? (
                    <FactGrid className="sm:grid-cols-2">
                        {facts.map((fact) => (
                            <Fact key={fact.label} label={fact.label} value={fact.value} />
                        ))}
                    </FactGrid>
                ) : (
                    <div className="max-sm:hidden" />
                )}

                {/* Receipt-style totals, under the Amount column. */}
                <div className="min-w-0 sm:ml-auto sm:w-full sm:max-w-xs">
                    <DetailList>
                        <DetailRow label="Subtotal" value={formatMoney(detail.order_subtotal)} />
                        {detail.order_discount_amount !== 0 && (
                            <DetailRow label="Discount" value={`−${formatMoney(Math.abs(detail.order_discount_amount))}`} />
                        )}
                        {detail.order_service_charge !== 0 && (
                            <DetailRow label="Service charge" value={formatMoney(detail.order_service_charge)} />
                        )}
                        <DetailRow label="Tax" value={formatMoney(detail.order_tax_amount)} />
                        <DetailRow label="Tip" value={formatMoney(detail.order_tip_amount)} />
                        <DetailRow label="Order total" value={formatMoney(detail.order_total_amount)} emphasis />
                    </DetailList>
                    {discountNames.length > 0 && (
                        <p className="mt-2 text-right text-xs text-muted-foreground">
                            Discounts applied: {discountNames.join(', ')}
                        </p>
                    )}
                </div>
            </div>

            {isSplit && (
                <div className="mt-8 grid min-w-0 grid-cols-1 gap-x-10 gap-y-8 sm:grid-cols-2">
                    <div className="min-w-0">
                        <PanelSubLabel>Split across {segments.length} payments</PanelSubLabel>
                        <ul className="space-y-2">
                            {segments.map((segment, index) => (
                                <li key={segment.id} className="flex min-w-0 items-baseline justify-between gap-4 text-sm">
                                    <span className="min-w-0 truncate">
                                        <span className="font-medium">Part {segment.split_sequence ?? index + 1}</span>{' '}
                                        · {humanise(segment.payment_method)}
                                        {segment.card_last_four ? ` •••${segment.card_last_four}` : ''}
                                        {segment.id === paymentId && <span className="text-muted-foreground"> (this payment)</span>}
                                    </span>
                                    <span className="shrink-0 tabular-nums">
                                        {formatMoney(segment.total_amount)}
                                        <span className="text-muted-foreground"> · {humanise(segment.status)}</span>
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                    {detail.paid_items.length > 0 && (
                        <div className="min-w-0">
                            <PanelSubLabel>Items this payment covered</PanelSubLabel>
                            <DetailList>
                                {detail.paid_items.map((item) => (
                                    <DetailRow
                                        key={item.id}
                                        label={`${item.quantity_paid} × ${item.item_name || 'Item'}`}
                                        value={formatMoney(item.subtotal_paid + item.tax_paid)}
                                    />
                                ))}
                            </DetailList>
                        </div>
                    )}
                </div>
            )}
        </PanelSection>
    )
}

// ── Terminal and processor ──────────────────────────────────────────────────

type TechFact = { label: string; value?: string | null; mono?: boolean; wrap?: boolean }

function str(value: unknown): string | null {
    return value === null || value === undefined || value === '' ? null : String(value)
}

/** Where the card was read and what the processor answered, beside its responses. */
export function PaymentTerminalSection({
    detail,
    isLoading,
    onRetry,
}: {
    detail: PlatformTransactionDetails | null
    isLoading: boolean
    onRetry: () => void
}) {
    if (!detail) {
        return (
            <PanelSection label="Terminal and processor">
                <RecordPending isLoading={isLoading} onRetry={onRetry} />
            </PanelSection>
        )
    }

    const processor = detail.processor_response ?? {}
    const emv = (detail.emv_data ??
        (processor.emv_data as Record<string, unknown> | undefined) ??
        (detail.metadata?.emv_data as Record<string, unknown> | undefined) ??
        null) as Record<string, unknown> | null
    const events = detail.payment_events ?? []

    const groups: { title: string; phrase: string; facts: TechFact[] }[] = [
        {
            title: 'Terminal',
            phrase: 'terminal',
            facts: [
                { label: 'Type', value: detail.terminal_type ? capitalise(detail.terminal_type) : null },
                { label: 'Terminal ID', value: detail.terminal_id, mono: true },
                { label: 'Serial #', value: str(processor.serial_number), mono: true },
                { label: 'TPN', value: str(processor.tpn), mono: true },
                { label: 'Device ID', value: detail.device_id, mono: true },
                { label: 'Connection', value: str(processor.connection_type) },
                { label: 'Environment', value: str(processor.api_environment) },
            ],
        },
        {
            title: 'Processor',
            phrase: 'processor',
            facts: [
                { label: 'Processor', value: detail.processor_name },
                { label: 'Response code', value: detail.dejavoo_response_code || detail.error_code, mono: true },
                { label: 'Invoice #', value: detail.invoice_number, mono: true },
                { label: 'Error', value: detail.error_message, wrap: true },
            ],
        },
        {
            title: 'Chip (EMV)',
            phrase: 'chip (EMV)',
            facts: emv
                ? [
                      { label: 'AID', value: str(emv.aid), mono: true },
                      { label: 'Application', value: str(emv.applicationName ?? emv.application_name ?? emv.app_name) },
                      { label: 'TVR', value: str(emv.tvr), mono: true },
                      { label: 'TSI', value: str(emv.tsi), mono: true },
                      { label: 'TC', value: str(emv.tc), mono: true },
                  ]
                : [],
        },
    ].map((group) => ({ ...group, facts: group.facts.filter((fact) => fact.value) }))
    const recorded = groups.filter((group) => group.facts.length > 0)
    const missing = groups.filter((group) => group.facts.length === 0).map((group) => group.phrase)

    return (
        <PanelSection
            label="Terminal and processor"
            caption="Where the card was read and what the processor answered. Only recorded values are shown."
        >
            <div className="grid min-w-0 grid-cols-1 items-start gap-x-10 gap-y-8 lg:grid-cols-2">
                <div className="min-w-0 space-y-6">
                    {recorded.map((group) => (
                        <div key={group.title} className="min-w-0">
                            <PanelSubLabel>{group.title}</PanelSubLabel>
                            <DetailList>
                                {group.facts.map((fact) => (
                                    <DetailRow key={fact.label} label={fact.label} value={fact.value} mono={fact.mono} wrap={fact.wrap} />
                                ))}
                            </DetailList>
                        </div>
                    ))}
                    {missing.length > 0 && (
                        <p className="text-sm text-muted-foreground">
                            No {missing.join(' or ')} data was recorded{recorded.length ? '' : ' for this payment'}.
                        </p>
                    )}
                </div>

                <div className="min-w-0">
                    <PanelSubLabel>Processor responses</PanelSubLabel>
                    {events.length === 0 ? (
                        <p className="text-sm text-muted-foreground">The processor sent no responses for this payment.</p>
                    ) : (
                        <ol className="space-y-2">
                            {events.map((event) => {
                                const label = humanise(event.event_type) || 'Event'
                                const status = event.previous_status
                                    ? `${humanise(event.previous_status)} → ${humanise(event.new_status) || '—'}`
                                    : event.new_status && humanise(event.new_status) !== label
                                        ? humanise(event.new_status)
                                        : null
                                const meta = [
                                    event.result_code && `Code ${event.result_code}`,
                                    status && `Status ${status}`,
                                    event.terminal_id && `Terminal ${event.terminal_id}`,
                                ].filter(Boolean)

                                return (
                                    <li key={event.id} className="min-w-0 rounded-xl bg-muted/50 p-3 text-sm">
                                        <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                                            <span className="font-medium">{label}</span>
                                            <time
                                                className="text-xs text-muted-foreground tabular-nums"
                                                title={
                                                    event.timestamp
                                                        ? formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })
                                                        : undefined
                                                }
                                            >
                                                {event.timestamp ? formatDateTime(event.timestamp) : 'Time not recorded'}
                                            </time>
                                        </div>
                                        {event.response_message && <p className="mt-1 break-words">{event.response_message}</p>}
                                        {meta.length > 0 && (
                                            <p className="mt-1 break-words text-xs text-muted-foreground">{meta.join(' · ')}</p>
                                        )}
                                    </li>
                                )
                            })}
                        </ol>
                    )}
                </div>
            </div>
        </PanelSection>
    )
}
