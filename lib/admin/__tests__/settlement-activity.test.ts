import { describe, expect, it } from 'vitest'
import { describeSettlementActivity, type TerminalIdentity } from '../settlement-activity'

const terminals = new Map<string, TerminalIdentity>([
  ['terminal-1', { name: 'Front Counter', serial: 'SN-123' }],
])

describe('describeSettlementActivity', () => {
  it('shows the recorded batch terminal without claiming it initiated settlement', () => {
    const result = describeSettlementActivity({
      action: 'batch_settled',
      resource_type: 'settlement_batch',
      resource_name: 'CDP-20260927-001',
      metadata: {
        acquirer: 'TSYS',
        batch_number: '009',
        payment_terminal_id: 'terminal-1',
      },
    }, terminals)

    expect(result).toEqual({
      title: 'Batch settled',
      batchLabel: 'Batch TSYS-009',
      terminalLabel: 'Front Counter (serial SN-123)',
      terminalSerial: 'SN-123',
    })
  })

  it('does not infer a terminal for historical audit rows without an ID', () => {
    const result = describeSettlementActivity({
      action: 'manual_mark_batch_settled',
      resource_type: 'settlement_batch',
      resource_name: 'CDP-20260927-001',
      metadata: { reason: 'Processor confirmed close' },
    }, terminals)

    expect(result?.terminalLabel).toBe('Terminal not recorded')
    expect(result?.terminalSerial).toBeNull()
  })

  it('labels closed and funded batches from their recorded status', () => {
    for (const [batchStatus, title] of [['closed', 'Batch closed'], ['funded', 'Batch funded']] as const) {
      const result = describeSettlementActivity({
        action: 'batch_settled',
        resource_type: 'settlement_batch',
        resource_name: 'CDP-20260927-001',
        metadata: { batch_status: batchStatus },
      }, terminals)

      expect(result?.title).toBe(title)
    }
  })

  it('distinguishes a missing terminal record from an absent batch link', () => {
    const result = describeSettlementActivity({
      action: 'batch_settlement_needs_review',
      resource_type: 'settlement_batch',
      resource_name: null,
      metadata: { payment_terminal_id: 'deleted-terminal' },
    }, terminals)

    expect(result?.title).toBe('Batch needs settlement review')
    expect(result?.terminalLabel).toBe('Terminal record unavailable')
  })

  it('leaves unrelated audit actions alone', () => {
    expect(describeSettlementActivity({
      action: 'staff_clock_in',
      resource_type: 'staff_member',
      resource_name: 'Cashier',
      metadata: null,
    }, terminals)).toBeNull()
  })
})
