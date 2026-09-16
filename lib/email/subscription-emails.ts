import { resolveAppUrl } from '@/lib/messaging/app-url'
import { sendEmail } from '@/lib/messaging/resend'
import {
  card,
  detailsTable,
  emailButton,
  emailShell,
  escapeHtml,
  heading,
  infoCallout,
  paragraph,
  type DetailsRow,
} from './design-kit'

/**
 * Node-side branded subscription emails (sent from HQ server actions, which run
 * in Node — not the Deno billing edge functions). Shares the same design kit as
 * the edge emails so plan-decision mail matches receipts/invoices exactly.
 */

export async function sendSubscriptionPlanDecisionEmail(params: {
  to: string
  merchantName: string
  decision: 'approved' | 'denied'
  /** What was requested, e.g. "Fine Dining add-on" or "Franchise plan". */
  requestLabel: string
  locationName?: string | null
  detailRows?: DetailsRow[]
  /** Optional denial reason / note. */
  reason?: string | null
}): Promise<{ id: string } | { error: string }> {
  const appUrl = await resolveAppUrl()
  const approved = params.decision === 'approved'

  const rows: DetailsRow[] = [
    { label: 'Request', value: params.requestLabel },
    ...(params.locationName ? [{ label: 'Location', value: params.locationName }] : []),
    ...(params.detailRows ?? []),
  ]

  const body = card(
    [
      heading(approved ? 'Your plan change was approved' : 'Update on your plan request'),
      paragraph(
        approved
          ? `Good news &mdash; Dexa HQ approved your request for <strong>${escapeHtml(params.requestLabel)}</strong> on the <strong>${escapeHtml(params.merchantName)}</strong> account. It is now active and will appear on your next invoice.`
          : `Dexa HQ reviewed your request for <strong>${escapeHtml(params.requestLabel)}</strong> on the <strong>${escapeHtml(params.merchantName)}</strong> account and was unable to approve it at this time.`,
      ),
      detailsTable(rows),
      params.reason
        ? infoCallout({ html: `<strong>Note from Dexa HQ:</strong> ${escapeHtml(params.reason)}`, tone: approved ? 'neutral' : 'warn' })
        : '',
      emailButton({ href: `${appUrl || 'https://dexaposai.com'}/dashboard/subscriptions/billing`, label: 'View billing & payments' }),
    ]
      .filter(Boolean)
      .join('\n'),
  )

  const html = emailShell({
    appUrl,
    previewText: approved ? `${params.requestLabel} approved` : `Update on your ${params.requestLabel} request`,
    bodyHtml: body,
  })

  const subject = approved
    ? 'Your Dexa POS plan change was approved'
    : 'Update on your Dexa POS plan request'

  return sendEmail(params.to, subject, html)
}
