/**
 * Dexa transactional email design kit — the single visual language for every
 * subscription/billing email (receipt, invoice issued, payment failed,
 * restored, plan approved/denied, renewal reminder) and the hosted invoice page.
 *
 * Visual model: Stripe-style hosted receipt — a neutral canvas, a small logo
 * lockup above, then a stack of clean white cards (a summary card with a big
 * amount + download links + meta rows, then an itemized card). Dexa-themed:
 * white cards, blue accents, modern system-sans.
 *
 * Pure HTML-string builders, no imports, no runtime APIs — so this file is
 * duplicated BYTE-FOR-BYTE into the Deno edge runtime at
 * `supabase/functions/_shared/email-design-kit.ts` (Deno can't import from
 * `lib/`). `tests/email-design-kit-parity.test.ts` pins the two copies equal.
 * If you edit one, edit the other identically.
 *
 * Email-safe: table layout, inline styles on every text element (Outlook resets
 * tables to serif otherwise), no JS, no external CSS, ASCII + HTML entities only.
 * Callers pass an absolute `appUrl` so the logo + links resolve in a client.
 */

export const BRAND = {
  primary: '#0C4FD1',
  primaryDark: '#0A3FA8',
  ink: '#0F1424',
  body: '#3B4252',
  muted: '#64748B',
  faint: '#8A93A6',
  border: '#E6E8EF',
  rule: '#EEF0F5',
  bg: '#F4F6FB',
  card: '#FFFFFF',
  success: '#10A34A',
  successBg: '#E7F7ED',
  alert: '#DC2626',
  alertBg: '#FDECEA',
  warn: '#B45309',
  warnBg: '#FEF3E2',
  neutral: '#475569',
  neutralBg: '#EEF1F6',
} as const

/** Modern system-UI sans stack (San Francisco / Segoe UI / Roboto). */
export const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Helvetica, Arial, sans-serif"

export const COMPANY_NAME = 'Dexa POS'
export const SUPPORT_EMAIL = 'support@dexaposai.com'
export const FALLBACK_APP_URL = 'https://dexaposai.com'

export type BadgeTone = 'success' | 'neutral' | 'alert' | 'warn'

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function normalizeAppUrl(appUrl: string | null | undefined): string {
  const trimmed = (appUrl || '').replace(/\/+$/, '')
  return trimmed || FALLBACK_APP_URL
}

export function heading(text: string): string {
  return `<h1 style="margin:0 0 12px;font-family:${FONT_STACK};font-size:19px;line-height:1.3;font-weight:700;color:${BRAND.ink};">${escapeHtml(text)}</h1>`
}

export function paragraph(html: string): string {
  return `<p style="margin:0 0 14px;font-family:${FONT_STACK};font-size:15px;line-height:1.6;color:${BRAND.body};">${html}</p>`
}

export function divider(): string {
  return `<div style="height:1px;line-height:1px;font-size:1px;background:${BRAND.rule};margin:18px 0;">&nbsp;</div>`
}

/** A white rounded card with a trailing gap, so cards stack like the reference. */
export function card(innerHtml: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:separate;">
    <tr><td style="background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:14px;padding:26px 28px 22px;">${innerHtml}</td></tr>
  </table>
  <div style="height:16px;line-height:16px;font-size:16px;">&nbsp;</div>`
}

/** Big-amount summary block: small label, large amount, muted sub-line. */
export function amountSummary(opts: { label: string; amount: string; sub?: string }): string {
  return `<div style="font-family:${FONT_STACK};font-size:14px;color:${BRAND.muted};margin:0 0 6px;">${escapeHtml(opts.label)}</div>
    <div style="font-family:${FONT_STACK};font-size:34px;font-weight:700;line-height:1.1;color:${BRAND.ink};letter-spacing:-0.02em;">${escapeHtml(opts.amount)}</div>
    ${opts.sub ? `<div style="font-family:${FONT_STACK};font-size:14px;color:${BRAND.muted};margin:8px 0 0;">${escapeHtml(opts.sub)}</div>` : ''}`
}

function downloadIcon(color: string): string {
  return `<span style="display:inline-block;vertical-align:middle;margin-right:6px;"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"></path><polyline points="8 11 12 15 16 11"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg></span>`
}

/** A row of blue action links with a download glyph (degrades to text in Gmail). */
export function linkRow(links: Array<{ href: string; label: string }>): string {
  if (!links.length) return ''
  const cells = links
    .map(
      (l) => `<td style="padding:0 24px 0 0;white-space:nowrap;">
        <a href="${escapeHtml(l.href)}" style="font-family:${FONT_STACK};font-size:14px;font-weight:600;color:${BRAND.primary};text-decoration:none;">${downloadIcon(BRAND.primary)}${escapeHtml(l.label)}</a>
      </td>`,
    )
    .join('')
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0 6px;"><tr>${cells}</tr></table>`
}

export function statusBadge(opts: { label: string; tone: BadgeTone }): string {
  const map: Record<BadgeTone, { fg: string; bg: string }> = {
    success: { fg: BRAND.success, bg: BRAND.successBg },
    neutral: { fg: BRAND.neutral, bg: BRAND.neutralBg },
    alert: { fg: BRAND.alert, bg: BRAND.alertBg },
    warn: { fg: BRAND.warn, bg: BRAND.warnBg },
  }
  const c = map[opts.tone]
  return `<span style="display:inline-block;font-family:${FONT_STACK};padding:5px 12px;border-radius:999px;background:${c.bg};color:${c.fg};font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">${escapeHtml(opts.label)}</span>`
}

export function emailButton(opts: { href: string; label: string; tone?: 'primary' | 'neutral' }): string {
  const bg = opts.tone === 'neutral' ? BRAND.neutralBg : BRAND.primary
  const fg = opts.tone === 'neutral' ? BRAND.ink : '#FFFFFF'
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0 4px;"><tr><td style="border-radius:10px;background:${bg};">
    <a href="${escapeHtml(opts.href)}" style="display:inline-block;font-family:${FONT_STACK};padding:13px 24px;border-radius:10px;background:${bg};color:${fg};font-size:15px;font-weight:600;text-decoration:none;">${escapeHtml(opts.label)}</a>
  </td></tr></table>`
}

export interface DetailsRow {
  label: string
  value: string
  strong?: boolean
}

export function detailsTable(rows: DetailsRow[]): string {
  const body = rows
    .map((r, i) => {
      const border = i < rows.length - 1 ? `border-bottom:1px solid ${BRAND.rule};` : ''
      const weight = r.strong ? '700' : '400'
      const color = r.strong ? BRAND.ink : BRAND.body
      return `<tr>
        <td style="padding:10px 0;${border}font-family:${FONT_STACK};font-size:14px;color:${BRAND.muted};">${escapeHtml(r.label)}</td>
        <td style="padding:10px 0;${border}font-family:${FONT_STACK};font-size:14px;font-weight:${weight};color:${color};text-align:right;">${escapeHtml(r.value)}</td>
      </tr>`
    })
    .join('')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:8px 0 4px;">${body}</table>`
}

export interface ReceiptItem {
  description: string
  qtyLabel?: string | null
  periodLabel?: string | null
  amount: string
}

/** Minimal itemized rows (Stripe-style): description + Qty sub-line, amount right. */
export function receiptItemsTable(items: ReceiptItem[]): string {
  if (!items.length) return ''
  const rows = items
    .map(
      (item) => `<tr>
        <td style="padding:12px 0;border-bottom:1px solid ${BRAND.rule};vertical-align:top;">
          <div style="font-family:${FONT_STACK};font-size:15px;font-weight:600;color:${BRAND.ink};">${escapeHtml(item.description)}</div>
          ${item.periodLabel ? `<div style="font-family:${FONT_STACK};font-size:12px;color:${BRAND.muted};margin-top:2px;">${escapeHtml(item.periodLabel)}</div>` : ''}
          ${item.qtyLabel ? `<div style="font-family:${FONT_STACK};font-size:12px;color:${BRAND.muted};margin-top:2px;">${escapeHtml(item.qtyLabel)}</div>` : ''}
        </td>
        <td style="padding:12px 0;border-bottom:1px solid ${BRAND.rule};font-family:${FONT_STACK};font-size:15px;color:${BRAND.ink};text-align:right;white-space:nowrap;vertical-align:top;">${escapeHtml(item.amount)}</td>
      </tr>`,
    )
    .join('')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:6px 0;">${rows}</table>`
}

export interface TotalsRow {
  label: string
  value: string
  strong?: boolean
}

/** Full-width Total / Amount paid rows (label left, value right) — the receipt footer. */
export function totalsTable(rows: TotalsRow[]): string {
  const body = rows
    .map((r) => {
      const weight = r.strong ? '700' : '600'
      const size = r.strong ? '16px' : '15px'
      return `<tr>
        <td style="padding:12px 0;border-bottom:1px solid ${BRAND.rule};font-family:${FONT_STACK};font-size:${size};font-weight:${weight};color:${BRAND.ink};">${escapeHtml(r.label)}</td>
        <td style="padding:12px 0;border-bottom:1px solid ${BRAND.rule};font-family:${FONT_STACK};font-size:${size};font-weight:${weight};color:${BRAND.ink};text-align:right;white-space:nowrap;">${escapeHtml(r.value)}</td>
      </tr>`
    })
    .join('')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:6px 0 0;">${body}</table>`
}

export function infoCallout(opts: { html: string; tone?: BadgeTone }): string {
  const map: Record<BadgeTone, { bg: string; fg: string }> = {
    success: { bg: BRAND.successBg, fg: '#0B7A38' },
    neutral: { bg: BRAND.neutralBg, fg: BRAND.neutral },
    alert: { bg: BRAND.alertBg, fg: BRAND.alert },
    warn: { bg: BRAND.warnBg, fg: BRAND.warn },
  }
  const c = map[opts.tone ?? 'neutral']
  return `<div style="margin:16px 0;padding:14px 16px;border-radius:10px;font-family:${FONT_STACK};background:${c.bg};color:${c.fg};font-size:14px;line-height:1.55;">${opts.html}</div>`
}

export interface EmailShellOptions {
  appUrl: string
  /** Hidden inbox-preview text. */
  previewText?: string
  /** Composed body HTML — usually one or more card() blocks. */
  bodyHtml: string
}

/** Canvas + logo lockup + card stack + footer. Body supplies its own card()s. */
export function emailShell(opts: EmailShellOptions): string {
  const appUrl = normalizeAppUrl(opts.appUrl)
  const year = String(new Date().getFullYear())
  const preview = opts.previewText
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(opts.previewText)}</div>`
    : ''
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light only" />
  <title>${COMPANY_NAME}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};font-family:${FONT_STACK};-webkit-font-smoothing:antialiased;">
  ${preview}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};padding:28px 12px;font-family:${FONT_STACK};">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;">
        <tr><td style="padding:4px 6px 18px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="vertical-align:middle;padding-right:10px;">
              <img src="${appUrl}/dexalogolight.png" width="30" height="30" alt="${COMPANY_NAME}" style="display:block;border:0;border-radius:7px;" />
            </td>
            <td style="vertical-align:middle;">
              <span style="font-family:${FONT_STACK};font-size:17px;font-weight:700;color:${BRAND.ink};letter-spacing:-0.01em;">Dexa POS</span>
            </td>
          </tr></table>
        </td></tr>
        <tr><td>
          ${opts.bodyHtml}
        </td></tr>
        <tr><td style="padding:8px 8px 8px;font-family:${FONT_STACK};font-size:12px;line-height:1.6;color:${BRAND.faint};">
          <p style="margin:0 0 6px;font-family:${FONT_STACK};">Questions about your bill? Contact us at <a href="mailto:${SUPPORT_EMAIL}" style="color:${BRAND.primary};text-decoration:none;">${SUPPORT_EMAIL}</a>.</p>
          <p style="margin:0;font-family:${FONT_STACK};">&copy; ${year} ${COMPANY_NAME}. This is a billing notification for your Dexa POS account.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}
