import { describe, expect, it } from 'vitest'
import { relatedDeposits, relatedProcessorBatches } from '../batch-journey-links'

describe('batch journey links', () => {
  const transactions = [{ batch_id: '123', deposit_id: 'dep-1', mid: 'MID-A' }]

  it('requires both processor batch ID and MID', () => {
    const rows = [
      { id: '123', mid: 'MID-A', deposit_id: 'dep-1' },
      { id: '123', mid: 'MID-B', deposit_id: 'dep-2' },
      { id: '456', mid: 'MID-A', deposit_id: 'dep-3' },
    ]
    expect(relatedProcessorBatches(rows, transactions)).toEqual([rows[0]])
  })

  it('never attaches a same-ID deposit from another MID', () => {
    const deposits = [{ id: 'dep-1', mid: 'MID-B' }, { id: 'dep-1', mid: 'MID-A' }]
    expect(relatedDeposits(deposits, transactions, [])).toEqual([deposits[1]])
  })

  it('accepts a recorded processor-batch deposit link for the same MID', () => {
    const deposits = [{ id: 'dep-2', mid: 'MID-A' }]
    const batches = [{ id: '123', mid: 'MID-A', deposit_id: 'dep-2' }]
    expect(relatedDeposits(deposits, transactions, batches)).toEqual(deposits)
  })
})
