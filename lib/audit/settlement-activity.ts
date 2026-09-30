import type { AuditLog, SettlementBatchIdentity, SettlementTerminalAttribution } from '@/types/audit-log'

/**
 * Plain-language description of a settlement/batch audit row, shared by every
 * audit surface (merchant Activity Log, HQ Audit Logs, HQ merchant tab, HQ
 * terminal page) so a batch event reads the same everywhere.
 *
 * The terminal comes from `settlement_terminal`, resolved server-side from the
 * batch's FK. It is the reader the batch belongs to, not necessarily the device
 * that initiated settlement — labels say "linked terminal" for that reason.
 */

type SettlementLog = Pick<AuditLog, 'action' | 'resource_type' | 'resource_name' | 'metadata'> & {
  settlement_terminal?: SettlementTerminalAttribution
  settlement_batch?: SettlementBatchIdentity
}

export interface SettlementDetail {
  label: string
  value: string
}

export interface SettlementActivity {
  /** Short event name, e.g. "Batch closed". */
  title: string
  /** Full sentence naming the batch or terminal, e.g. "Batch TSYS-009 closed". */
  sentence: string
  batchLabel: string
  terminalLabel: string | null
  terminalSerial: string | null
  /** One line of context: terminal · payments · gross, plus any reason. */
  highlight: string | null
  details: SettlementDetail[]
}

// title + the verb that follows the batch label in the sentence
const BATCH_EVENTS: Record<string, { title: string; verb: string }> = {
  batch_settlement_partial: { title: 'Batch partially settled', verb: 'partially settled' },
  batch_settlement_needs_review: { title: 'Batch needs settlement review', verb: 'needs settlement review' },
  batch_settlement_failed: { title: 'Batch settlement failed', verb: 'failed to settle' },
  manual_mark_batch_settled: { title: 'Batch marked settled by Dexa', verb: 'marked settled by Dexa (manual reconciliation)' },
}

// Watchdog events are about a terminal, not a batch.
const TERMINAL_EVENTS: Record<string, { title: string; verb: string }> = {
  auto_settle_missed: { title: "Auto-settle didn't run", verb: "Auto-settle didn't run on" },
  auto_settle_stuck: { title: 'Auto-settle left a batch open', verb: 'Auto-settle left a batch open on' },
}

function textValue(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function moneyValue(value: unknown): string | null {
  const amount = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN
  if (!Number.isFinite(amount)) return null
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function countValue(value: unknown): number | null {
  const count = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN
  return Number.isInteger(count) && count >= 0 ? count : null
}

function statusWord(value: string): string {
  const word = value.replaceAll('_', ' ').toLowerCase()
  return word.charAt(0).toUpperCase() + word.slice(1)
}

function batchEvent(action: string, batchStatus: string | null): { title: string; verb: string } {
  if (action === 'batch_settled') {
    if (batchStatus === 'closed') return { title: 'Batch closed', verb: 'closed' }
    if (batchStatus === 'funded') return { title: 'Batch funded', verb: 'funded' }
    return { title: 'Batch settled', verb: 'settled' }
  }
  const known = BATCH_EVENTS[action]
  if (known) return known
  const words = action.replaceAll('_', ' ')
  return { title: statusWord(words), verb: words }
}

function terminalLabelFor(
  attribution: SettlementTerminalAttribution | undefined,
  metadata: Record<string, unknown>,
): string | null {
  if (!attribution) return null
  switch (attribution.status) {
    case 'linked': {
      const name = attribution.name || 'Payment terminal'
      return attribution.serial ? `${name} (serial ${attribution.serial})` : name
    }
    case 'not_recorded':
      return metadata.channel === 'online_order' ? 'Online orders — no terminal' : 'Terminal not recorded'
    case 'terminal_missing':
      return 'Terminal record unavailable'
    case 'batch_missing':
      return 'Batch record no longer exists'
    case 'unavailable':
      return 'Terminal details unavailable'
  }
}

function recordedBy(action: string, metadata: Record<string, unknown>): string | null {
  if (action === 'manual_mark_batch_settled') return 'Dexa (manual reconciliation)'
  if (metadata.channel === 'online_order') return 'Online orders (Valor batch webhook)'
  const source = textValue(metadata.source) ?? textValue(metadata.origin)
  if (source === 'pos_terminal') return 'POS terminal'
  if (source === 'valor_webhook') return 'Valor batch webhook'
  if (source === 'auto_settle_watchdog') return 'Auto-settle watchdog'
  return source ? statusWord(source) : null
}

export function describeSettlementActivity(log: SettlementLog): SettlementActivity | null {
  const terminalEvent = TERMINAL_EVENTS[log.action]
  if (log.resource_type !== 'settlement_batch' && !terminalEvent && !BATCH_EVENTS[log.action]) return null

  const metadata = log.metadata ?? {}
  const terminalLabel = terminalLabelFor(log.settlement_terminal, metadata)
  const terminalSerial = log.settlement_terminal?.status === 'linked' ? log.settlement_terminal.serial : null
  const reason = textValue(metadata.failure_reason) ?? textValue(metadata.reason)
  const source = recordedBy(log.action, metadata)
  const details: SettlementDetail[] = []
  const push = (label: string, value: string | null) => {
    if (value) details.push({ label, value })
  }

  if (terminalEvent) {
    const terminalName = log.settlement_terminal?.status === 'linked'
      ? log.settlement_terminal.name || log.resource_name
      : log.resource_name
    const businessDate = textValue(metadata.business_date)
    const settleTime = textValue(metadata.settle_time)
    const timezone = textValue(metadata.location_timezone)
    const grace = countValue(metadata.grace_minutes)

    push('Terminal', terminalLabel ?? log.resource_name)
    push('Business date', businessDate)
    push('Scheduled settle time', settleTime ? [settleTime, timezone].filter(Boolean).join(' ') : null)
    push('Grace period', grace != null ? `${grace} min` : null)
    push('Recorded by', source)
    push('Reason', reason)

    return {
      title: terminalEvent.title,
      sentence: `${terminalEvent.verb} ${terminalName || 'a payment terminal'}`,
      batchLabel: businessDate ? `Business date ${businessDate}` : 'Open batch',
      terminalLabel,
      terminalSerial,
      highlight: [businessDate && `Business date ${businessDate}`, reason].filter(Boolean).join(' · ') || null,
      details,
    }
  }

  const batchStatus = textValue(metadata.batch_status)?.toLowerCase() ?? null
  const previousStatus = textValue(metadata.previous_status)?.toLowerCase() ?? null
  const event = batchEvent(log.action, batchStatus)
  // The batch row, when it still exists, is the one label source every writer
  // agrees with; metadata only fills in for batches that are gone.
  const batch = log.settlement_batch
  const number = batch ? textValue(batch.batchNumber) : textValue(metadata.batch_number)
  const acquirer = batch ? textValue(batch.acquirer) : textValue(metadata.acquirer)
  const batchId = textValue(batch?.batchId) ?? log.resource_name
  // Same rule as the Batches views: acquirer-number, then number, then batch id.
  const batchRef = number ? (acquirer ? `${acquirer}-${number}` : number) : batchId
  const batchLabel = batchRef ? `Batch ${batchRef}` : 'Settlement batch'

  const isManual = log.action === 'manual_mark_batch_settled'
  const payments = countValue(isManual ? metadata.payments_settled : metadata.transaction_count)
  const gross = moneyValue(metadata.gross_amount)
  const paymentsText = payments != null
    ? `${payments.toLocaleString('en-US')} ${payments === 1 ? 'payment' : 'payments'}${isManual ? ' marked settled' : ''}`
    : null

  push('Batch', batchId && batchId !== batchRef ? `${batchLabel} · ${batchId}` : batchLabel)
  push('Settlement date', textValue(metadata.settlement_date))
  push('Linked terminal', terminalLabel)
  push('Recorded by', source)
  push('Status', batchStatus
    ? previousStatus && previousStatus !== batchStatus
      ? `${statusWord(previousStatus)} → ${statusWord(batchStatus)}`
      : statusWord(batchStatus)
    : null)
  push(isManual ? 'Payments marked settled' : 'Payments', payments != null ? payments.toLocaleString('en-US') : null)
  push('Gross', gross)
  push('Tips', moneyValue(metadata.tip_amount))
  // Same wording as Batches & Deposits: a batch's net is not money in the bank.
  push('Batch net', moneyValue(metadata.net_deposit))
  const retries = countValue(metadata.retry_count)
  push('Retries', retries ? retries.toLocaleString('en-US') : null)
  push('Reason', reason)

  return {
    title: event.title,
    sentence: `${batchLabel} ${event.verb}`,
    batchLabel,
    terminalLabel,
    terminalSerial,
    highlight: [terminalLabel, paymentsText, gross, reason && `Reason: ${reason}`].filter(Boolean).join(' · ') || null,
    details,
  }
}
