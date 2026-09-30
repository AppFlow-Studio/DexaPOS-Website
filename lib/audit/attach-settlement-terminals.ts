import 'server-only'

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
  resolveAuditSettlementBatches,
  resolveAuditSettlementTerminals,
  settlementLookupTarget,
  type AuditSettlementRef,
  type BatchTerminalLink,
  type TerminalRecord,
} from '@/lib/admin/settlement-terminal-attribution'
import type { SettlementBatchIdentity, SettlementTerminalAttribution } from '@/types/audit-log'

// PostgREST puts `.in()` ids in the URL; a 10k-row HQ export would overflow it.
const ID_CHUNK = 200

function chunk<T>(items: T[]): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += ID_CHUNK) chunks.push(items.slice(i, i + ID_CHUNK))
  return chunks
}

/**
 * Attach `settlement_terminal` (and, for batch rows, `settlement_batch`) to each
 * settlement audit row, resolved from the batch's own row. Audit metadata can't
 * be trusted for this: only the POS trigger records `payment_terminal_id`,
 * `LogAuditEvent` strips `*_id` keys, and the webhook omits `acquirer`.
 *
 * Service role, because `payment_terminals` RLS admits merchant admins only —
 * a manager who can read the log would otherwise never see a terminal. The
 * elevation stays narrow: ids come from audit rows the caller already read
 * under their own RLS, `merchantId` (when given) pins every lookup, and only a
 * terminal's name and serial leave this function.
 */
export async function attachSettlementTerminals<T extends AuditSettlementRef>(
  rows: T[],
  options: { merchantId?: string } = {},
): Promise<(T & {
  settlement_terminal?: SettlementTerminalAttribution
  settlement_batch?: SettlementBatchIdentity
})[]> {
  const targets = rows.map(settlementLookupTarget)
  const batchIds = [...new Set(targets.flatMap((t) => (t?.kind === 'batch' ? [t.id] : [])))]
  const directTerminalIds = targets.flatMap((t) => (t?.kind === 'terminal' ? [t.id] : []))
  if (batchIds.length === 0 && directTerminalIds.length === 0) return rows

  try {
    const service = createServiceRoleClient()

    const batchResults = await Promise.all(chunk(batchIds).map((ids) => {
      let query = service
        .from('settlement_batches')
        .select('id, merchant_id, payment_terminal_id, batch_id, batch_number, acquirer')
        .in('id', ids)
      if (options.merchantId) query = query.eq('merchant_id', options.merchantId)
      return query
    }))
    const batchLinks: BatchTerminalLink[] = []
    for (const { data, error } of batchResults) {
      if (error) throw error
      batchLinks.push(...((data ?? []) as BatchTerminalLink[]))
    }

    const terminalIds = [...new Set([
      ...directTerminalIds,
      ...batchLinks.flatMap((link) => (link.payment_terminal_id ? [link.payment_terminal_id] : [])),
    ])]
    const terminalResults = await Promise.all(chunk(terminalIds).map((ids) => {
      let query = service.from('payment_terminals').select('id, merchant_id, terminal_name, serial_number').in('id', ids)
      if (options.merchantId) query = query.eq('merchant_id', options.merchantId)
      return query
    }))
    const terminals: TerminalRecord[] = []
    for (const { data, error } of terminalResults) {
      if (error) throw error
      terminals.push(...((data ?? []) as TerminalRecord[]))
    }

    const resolvedTerminals = resolveAuditSettlementTerminals(rows, batchLinks, terminals)
    const resolvedBatches = resolveAuditSettlementBatches(rows, batchLinks)
    return rows.map((row) => {
      const attribution = resolvedTerminals.get(row.id)
      if (!attribution) return row
      const batch = resolvedBatches.get(row.id)
      return batch
        ? { ...row, settlement_terminal: attribution, settlement_batch: batch }
        : { ...row, settlement_terminal: attribution }
    })
  } catch (error) {
    console.error('[attachSettlementTerminals] lookup failed:', error)
    return rows.map((row, i) =>
      targets[i] ? { ...row, settlement_terminal: { status: 'unavailable' as const } } : row,
    )
  }
}
