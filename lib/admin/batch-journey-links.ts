type ProcessorTransaction = { batch_id: string; deposit_id: string | null; mid: string }
type ProcessorBatch = { id: string; mid: string; deposit_id: string | null }
type ProcessorDeposit = { id: string; mid: string }

export function relatedProcessorBatches<T extends ProcessorBatch>(
  rows: T[], transactions: ProcessorTransaction[],
): T[] {
  return rows.filter((row) => transactions.some((txn) => txn.batch_id === row.id && txn.mid === row.mid))
}

export function relatedDeposits<T extends ProcessorDeposit>(
  rows: T[], transactions: ProcessorTransaction[], batches: ProcessorBatch[],
): T[] {
  return rows.filter((row) => transactions.some((txn) => txn.deposit_id === row.id && txn.mid === row.mid)
    || batches.some((batch) => batch.deposit_id === row.id && batch.mid === row.mid))
}
