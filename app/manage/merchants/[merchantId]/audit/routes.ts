/**
 * Links between a merchant's audit tab and its entry pages, written once so
 * the table rows, phone cards and back button cannot drift apart.
 */

/** The merchant detail page opened on its Audit tab. */
export function merchantAuditTabHref(merchantId: string): string {
    return `/manage/merchants/${encodeURIComponent(merchantId)}?tab=audit`
}

/** One audit entry's own page. */
export function merchantAuditLogHref(merchantId: string, logId: string): string {
    return `/manage/merchants/${encodeURIComponent(merchantId)}/audit/${encodeURIComponent(logId)}`
}
