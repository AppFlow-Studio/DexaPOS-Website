/**
 * Links into /manage/transactions and its record detail pages, written once so
 * the list rows, phone cards and back buttons cannot drift apart.
 */

export const TRANSACTION_TABS = ['settlements', 'disputes', 'audit'] as const
export type TransactionTab = (typeof TRANSACTION_TABS)[number]

export function isTransactionTab(value: string | null | undefined): value is TransactionTab {
    return !!value && (TRANSACTION_TABS as readonly string[]).includes(value)
}

/** The transactions page opened on one tab. */
export function transactionsTabHref(tab: TransactionTab): string {
    return `/manage/transactions?tab=${tab}`
}

/** The All transactions ledger at the top of /manage/transactions (not a tab). */
export const TRANSACTIONS_LEDGER_HREF = '/manage/transactions'

/** A payment's own page — also the transaction page, since every ledger row is an `order_payments` row. */
export function paymentDetailHref(paymentId: string): string {
    return `/manage/transactions/payments/${encodeURIComponent(paymentId)}`
}

export function settlementBatchDetailHref(batchId: string): string {
    return `/manage/transactions/settlements/${encodeURIComponent(batchId)}`
}

/** `from: 'disputes'` sends the detail page's back button to /manage/disputes. */
export function chargebackDetailHref(chargebackId: string, from?: 'disputes'): string {
    const base = `/manage/transactions/disputes/${encodeURIComponent(chargebackId)}`
    return from ? `${base}?from=${from}` : base
}

export function paymentAuditEventDetailHref(eventId: string): string {
    return `/manage/transactions/audit/${encodeURIComponent(eventId)}`
}
