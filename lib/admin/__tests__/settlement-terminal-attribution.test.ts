import { describe, expect, it } from 'vitest'
import { attachBatchTerminalIdentity } from '../settlement-terminal-attribution'

const batches = [
  { id: 'batch-1', merchant_id: 'merchant-a', batch_number: '009' },
  { id: 'batch-2', merchant_id: 'merchant-a', batch_number: '009' },
]

describe('attachBatchTerminalIdentity', () => {
  it('uses the exact batch UUID rather than a repeated batch number', () => {
    const attributed = attachBatchTerminalIdentity(
      batches,
      [
        { id: 'batch-1', merchant_id: 'merchant-a', payment_terminal_id: 'terminal-1' },
        { id: 'batch-2', merchant_id: 'merchant-a', payment_terminal_id: 'terminal-2' },
      ],
      [
        { id: 'terminal-1', merchant_id: 'merchant-a', terminal_name: 'Front', serial_number: 'SN-1' },
        { id: 'terminal-2', merchant_id: 'merchant-a', terminal_name: 'Drive-through', serial_number: 'SN-2' },
      ],
    )

    expect(attributed.map((batch) => batch.terminal_serial)).toEqual(['SN-1', 'SN-2'])
  })

  it('does not attach a terminal from another merchant', () => {
    const attributed = attachBatchTerminalIdentity(
      [batches[0]],
      [{ id: 'batch-1', merchant_id: 'merchant-a', payment_terminal_id: 'terminal-1' }],
      [{ id: 'terminal-1', merchant_id: 'merchant-b', terminal_name: 'Wrong store', serial_number: 'SN-X' }],
    )

    expect(attributed[0].payment_terminal_id).toBe('terminal-1')
    expect(attributed[0].terminal_serial).toBeUndefined()
  })

  it('leaves unlinked batches unattributed', () => {
    const attributed = attachBatchTerminalIdentity(
      [batches[0]],
      [{ id: 'batch-1', merchant_id: 'merchant-a', payment_terminal_id: null }],
      [],
    )

    expect(attributed[0].payment_terminal_id).toBeUndefined()
  })
})
