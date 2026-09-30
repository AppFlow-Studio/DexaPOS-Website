import type { PlatformPaymentRow } from '@/app/manage/actions/hq-platform/payments'
import type { PlatformTransactionDetails } from '@/app/manage/actions/hq-platform/transactions'

/*
 * Wording for a ledger payment, shared by the Payments ledger tab and the
 * payment detail page so the two say the same thing.
 */

export function formatMoney(n: number) {
    return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

export function formatDateTime(iso?: string | null) {
    if (!iso) return '—'
    const d = new Date(iso)
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}

export function capitalise(value: string): string {
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : value
}

/** "tip_adjusted" → "Tip adjusted". */
export function humanise(value?: string | null): string {
    return value ? capitalise(value.replace(/_/g, ' ').toLowerCase()) : ''
}

/**
 * Prefer the host batch number ("009", optionally prefixed with the acquirer
 * like "TSYS-009"). Fall back to settlement_batch_label only for pre-Wave-A.1
 * rows where batch_number is null.
 */
export function batchLabel(r: PlatformPaymentRow): string | null {
    const hostBatchNumber = r.batch_number ?? r.dejavoo_batch_number ?? null
    return hostBatchNumber
        ? (r.acquirer ? `${r.acquirer}-${hostBatchNumber}` : hostBatchNumber)
        : (r.settlement_batch_label ?? null)
}

export function netFeeLabel(r: PlatformPaymentRow): string {
    // The minus sign says it is a deduction; no colour needed (§3.5).
    return r.net_fee > 0 ? `−${formatMoney(r.net_fee)}` : '—'
}

export function tsysMatchLabel(r: PlatformPaymentRow): string {
    if (!r.luqra_transaction_id) return 'Unmatched'
    return r.luqra_batch_id ? `Matched ${r.luqra_batch_id}` : 'Matched'
}

/** Card payments carry processor references, fees, a terminal and settlement; cash and others do not. */
export function isCardPayment(r: Pick<PlatformPaymentRow, 'payment_method' | 'card_last_four'>): boolean {
    return r.payment_method === 'card' || r.payment_method.startsWith('card_') || !!r.card_last_four
}

/** "Card · Visa •••4242", or just the method when no card was used. */
export function methodLabel(r: PlatformPaymentRow): string {
    const method = capitalise(r.payment_method)
    if (!r.card_type) return method
    return `${method} · ${r.card_type}${r.card_last_four ? ` •••${r.card_last_four}` : ''}`
}

/** "Contactless", "Chip", "Swipe" or "Manual"; null when the processor did not say. */
export function entryModeLabel(raw?: string | null): string | null {
    if (!raw) return null
    const value = raw.toLowerCase()
    if (value.includes('contact') || value.includes('tap')) return 'Contactless'
    if (value.includes('chip') || value.includes('emv') || value.includes('insert')) return 'Chip'
    if (value.includes('swipe') || value.includes('magstripe') || value.includes('mag')) return 'Swipe'
    if (value.includes('manual') || value.includes('keyed') || value.includes('key')) return 'Manual'
    return null
}

/** What `buildPaymentActivity` reads: the detail record, or the ledger row when that is all there is. */
export type PaymentActivitySource = Partial<
    Pick<
        PlatformTransactionDetails,
        | 'initiated_at'
        | 'authorized_at'
        | 'approved_at'
        | 'captured_at'
        | 'failed_at'
        | 'error_message'
        | 'is_voided'
        | 'voided_at'
        | 'void_reason'
        | 'voided_by'
        | 'is_returned'
        | 'returned_at'
        | 'return_amount'
        | 'return_reason'
        | 'returned_by'
        | 'refunded_at'
        | 'refunded_amount'
        | 'refund_reason'
        | 'tip_amount'
        | 'original_tip_amount'
        | 'tip_adjusted_at'
        | 'tip_adjusted_by'
        | 'staff_names'
    >
> & { settled_at?: string | null }

export interface PaymentActivityEntry {
    key: string
    label: string
    /** Null when the event is flagged but its time was not recorded. */
    at: string | null
    amount?: number
    /** A reason, a processor message, or "$2.00 → $3.00". */
    note?: string
    /** Who did it: a staff name when known, otherwise their id. */
    by?: string
    /** Other records this one event also wrote, e.g. a refund's "return" and "void". */
    recordedAs?: string[]
}

/** A refund writes its return and void within moments of it; further apart they are separate events. */
const REFUND_FOLD_WINDOW_MS = 2 * 60 * 1000

/**
 * Every lifecycle step and reversal that actually happened, oldest first.
 * Events flagged without a time sort last, in the order they are listed here.
 */
export function buildPaymentActivity(s: PaymentActivitySource): PaymentActivityEntry[] {
    const entries: PaymentActivityEntry[] = []
    const add = (entry: PaymentActivityEntry) => entries.push(entry)
    const orNull = (v?: string | null) => v || null
    const opt = (v?: string | null) => v || undefined
    const who = (id?: string | null) => (id ? s.staff_names?.[id] ?? id : undefined)

    if (s.initiated_at) add({ key: 'initiated', label: 'Initiated', at: s.initiated_at })
    if (s.authorized_at) add({ key: 'authorized', label: 'Authorized', at: s.authorized_at })
    if (s.approved_at) add({ key: 'approved', label: 'Approved', at: s.approved_at })
    if (s.captured_at) add({ key: 'captured', label: 'Captured', at: s.captured_at })
    if (s.failed_at || s.error_message) {
        add({ key: 'failed', label: 'Failed', at: orNull(s.failed_at), note: opt(s.error_message) })
    }

    const originalTip = s.original_tip_amount
    const tipChanged =
        originalTip !== undefined && originalTip !== null && Math.abs(Number(originalTip) - Number(s.tip_amount ?? 0)) > 0.001
    if (s.tip_adjusted_at || tipChanged) {
        add({
            key: 'tip-adjusted',
            label: 'Tip adjusted',
            at: orNull(s.tip_adjusted_at),
            note: tipChanged ? `${formatMoney(Number(originalTip))} → ${formatMoney(Number(s.tip_amount ?? 0))}` : undefined,
            by: who(s.tip_adjusted_by),
        })
    }

    const voided: PaymentActivityEntry | null =
        s.is_voided || s.voided_at
            ? { key: 'voided', label: 'Voided', at: orNull(s.voided_at), note: opt(s.void_reason), by: who(s.voided_by) }
            : null
    const returned: PaymentActivityEntry | null =
        s.is_returned || s.returned_at || Number(s.return_amount ?? 0) > 0
            ? {
                  key: 'returned',
                  label: 'Returned',
                  at: orNull(s.returned_at),
                  amount: Number(s.return_amount ?? 0) > 0 ? Number(s.return_amount) : undefined,
                  note: opt(s.return_reason),
                  by: who(s.returned_by),
              }
            : null
    const refunded: PaymentActivityEntry | null =
        s.refunded_at || Number(s.refunded_amount ?? 0) > 0
            ? {
                  key: 'refunded',
                  label: 'Refunded',
                  at: orNull(s.refunded_at),
                  amount: Number(s.refunded_amount ?? 0) > 0 ? Number(s.refunded_amount) : undefined,
                  note: opt(s.refund_reason),
              }
            : null

    // One refund on the POS writes a refund, a return and a void moments apart.
    // Say it once: fold the return and void into the refund, keep their reason
    // and who did it, and note what else was recorded.
    const foldable = (entry: PaymentActivityEntry | null): entry is PaymentActivityEntry =>
        !!entry &&
        !!entry.at &&
        !!refunded?.at &&
        Math.abs(new Date(entry.at).getTime() - new Date(refunded.at).getTime()) <= REFUND_FOLD_WINDOW_MS
    const folded = [returned, voided].filter(foldable)
    if (refunded && folded.length > 0) {
        const earliest = [refunded, ...folded].reduce((a, b) => (new Date(b.at!).getTime() < new Date(a.at!).getTime() ? b : a))
        add({
            ...refunded,
            at: earliest.at,
            amount: refunded.amount ?? returned?.amount,
            note: refunded.note ?? returned?.note ?? voided?.note?.replace(/^Refunded:\s*/i, ''),
            by: returned?.by ?? voided?.by,
            recordedAs: folded.map((entry) => (entry.key === 'returned' ? 'a return' : 'a void')),
        })
        for (const entry of [returned, voided]) if (entry && !folded.includes(entry)) add(entry)
    } else {
        for (const entry of [voided, returned, refunded]) if (entry) add(entry)
    }
    if (s.settled_at) add({ key: 'settled', label: 'Settled', at: s.settled_at })

    // Array#sort is stable, so same-time and undated events keep the order above.
    return entries.sort((a, b) => {
        if (a.at && b.at) return new Date(a.at).getTime() - new Date(b.at).getTime()
        if (a.at) return -1
        if (b.at) return 1
        return 0
    })
}
