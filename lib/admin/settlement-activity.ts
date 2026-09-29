import type { AuditLog } from '@/types/audit-log'

export interface TerminalIdentity {
  name: string
  serial: string | null
}

const ACTION_LABELS: Record<string, string> = {
  batch_settled: 'Batch settled',
  batch_settlement_partial: 'Batch partially settled',
  batch_settlement_needs_review: 'Batch needs settlement review',
  batch_settlement_failed: 'Batch settlement failed',
  manual_mark_batch_settled: 'Batch manually reconciled by HQ',
}

function textValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function describeSettlementActivity(
  log: Pick<AuditLog, 'action' | 'resource_type' | 'resource_name' | 'metadata'>,
  terminals: ReadonlyMap<string, TerminalIdentity>,
) {
  if (log.resource_type !== 'settlement_batch' && !ACTION_LABELS[log.action]) return null

  const metadata = log.metadata ?? {}
  const batchStatus = textValue(metadata.batch_status)?.toLowerCase()
  const title = log.action === 'batch_settled'
    ? batchStatus === 'closed' ? 'Batch closed'
      : batchStatus === 'funded' ? 'Batch funded'
        : 'Batch settled'
    : ACTION_LABELS[log.action] ?? log.action.replaceAll('_', ' ')
  const number = textValue(metadata.batch_number)
  const acquirer = textValue(metadata.acquirer)
  const batchLabel = number
    ? `Batch ${acquirer ? `${acquirer}-` : ''}${number}`
    : log.resource_name
      ? `Batch ${log.resource_name}`
      : 'Settlement batch'

  const terminalId = textValue(metadata.payment_terminal_id)
  const terminal = terminalId ? terminals.get(terminalId) : undefined
  const terminalLabel = terminal
    ? terminal.serial
      ? `${terminal.name} (serial ${terminal.serial})`
      : terminal.name
    : terminalId
      ? 'Terminal record unavailable'
      : 'Terminal not recorded'

  return {
    title,
    batchLabel,
    terminalLabel,
    terminalSerial: terminal?.serial ?? null,
  }
}
