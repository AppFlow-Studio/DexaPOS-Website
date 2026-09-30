import type { SettlementBatchIdentity, SettlementTerminalAttribution } from '@/types/audit-log'

interface BatchRef {
  id: string
  merchant_id: string
}

export interface BatchTerminalLink extends BatchRef {
  payment_terminal_id: string | null
  /** Label fields — selected by the audit lookup, not by batch attribution. */
  batch_id?: string | null
  batch_number?: string | number | null
  acquirer?: string | null
}

export interface TerminalRecord {
  id: string
  merchant_id: string
  terminal_name: string | null
  serial_number: string | null
}

export function attachBatchTerminalIdentity<T extends BatchRef>(
  batches: readonly T[],
  links: readonly BatchTerminalLink[],
  terminals: readonly TerminalRecord[],
): (T & { payment_terminal_id?: string; terminal_name?: string; terminal_serial?: string })[] {
  const linksById = new Map(links.map((link) => [link.id, link]))
  const terminalsById = new Map(terminals.map((terminal) => [terminal.id, terminal]))

  return batches.map((batch) => {
    const link = linksById.get(batch.id)
    if (!link || link.merchant_id !== batch.merchant_id || !link.payment_terminal_id) return batch

    const terminal = terminalsById.get(link.payment_terminal_id)
    if (!terminal || terminal.merchant_id !== batch.merchant_id) {
      return { ...batch, payment_terminal_id: link.payment_terminal_id }
    }

    return {
      ...batch,
      payment_terminal_id: terminal.id,
      terminal_name: terminal.terminal_name || undefined,
      terminal_serial: terminal.serial_number || undefined,
    }
  })
}

export interface AuditSettlementRef {
  id: string
  merchant_id?: string | null
  action_category?: string | null
  resource_type?: string | null
  resource_id?: string | null
}

/**
 * Which record a settlement audit row points at: batch events carry the batch
 * UUID, auto-settle watchdog events carry the terminal UUID directly.
 */
export function settlementLookupTarget(
  row: AuditSettlementRef,
): { kind: 'batch' | 'terminal'; id: string } | null {
  if (row.action_category !== 'settlement' || !row.resource_id) return null
  if (row.resource_type === 'settlement_batch') return { kind: 'batch', id: row.resource_id }
  if (row.resource_type === 'payment_terminal') return { kind: 'terminal', id: row.resource_id }
  return null
}

/**
 * Resolve the terminal behind each settlement audit row from the batch's own
 * FK. Keyed by audit row id; rows that are not settlement events are absent.
 * Anything that does not resolve to a same-merchant record is reported as
 * missing rather than guessed.
 */
export function resolveAuditSettlementTerminals(
  rows: readonly AuditSettlementRef[],
  batchLinks: readonly BatchTerminalLink[],
  terminals: readonly TerminalRecord[],
): Map<string, SettlementTerminalAttribution> {
  const linksById = new Map(batchLinks.map((link) => [link.id, link]))
  const terminalsById = new Map(terminals.map((terminal) => [terminal.id, terminal]))
  const resolved = new Map<string, SettlementTerminalAttribution>()

  const terminalAttribution = (terminalId: string, merchantId: string | null | undefined): SettlementTerminalAttribution => {
    const terminal = terminalsById.get(terminalId)
    if (!terminal || terminal.merchant_id !== merchantId) return { status: 'terminal_missing', terminalId }
    return {
      status: 'linked',
      terminalId: terminal.id,
      name: terminal.terminal_name || null,
      serial: terminal.serial_number || null,
    }
  }

  for (const row of rows) {
    const target = settlementLookupTarget(row)
    if (!target) continue

    if (target.kind === 'terminal') {
      resolved.set(row.id, terminalAttribution(target.id, row.merchant_id))
      continue
    }

    const link = linksById.get(target.id)
    if (!link || link.merchant_id !== row.merchant_id) {
      resolved.set(row.id, { status: 'batch_missing' })
    } else if (!link.payment_terminal_id) {
      resolved.set(row.id, { status: 'not_recorded' })
    } else {
      resolved.set(row.id, terminalAttribution(link.payment_terminal_id, row.merchant_id))
    }
  }

  return resolved
}

/**
 * The audited batch's label fields from its own row, keyed by audit row id —
 * so every writer's rows for one batch read "Batch VALOR-10", not "Batch 10"
 * from the webhook and nothing at all from older HQ rows.
 */
export function resolveAuditSettlementBatches(
  rows: readonly AuditSettlementRef[],
  batchLinks: readonly BatchTerminalLink[],
): Map<string, SettlementBatchIdentity> {
  const linksById = new Map(batchLinks.map((link) => [link.id, link]))
  const resolved = new Map<string, SettlementBatchIdentity>()

  for (const row of rows) {
    const target = settlementLookupTarget(row)
    if (target?.kind !== 'batch') continue
    const link = linksById.get(target.id)
    if (!link || link.merchant_id !== row.merchant_id) continue
    resolved.set(row.id, {
      batchId: link.batch_id ?? null,
      batchNumber: link.batch_number != null ? String(link.batch_number) : null,
      acquirer: link.acquirer ?? null,
    })
  }

  return resolved
}
