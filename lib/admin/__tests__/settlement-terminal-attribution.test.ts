import { describe, expect, it } from 'vitest'
import { attachBatchTerminalIdentity, resolveAuditSettlementBatches, resolveAuditSettlementTerminals } from '../settlement-terminal-attribution'

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

describe('resolveAuditSettlementTerminals', () => {
  const terminals = [
    { id: 'terminal-1', merchant_id: 'merchant-a', terminal_name: 'Front', serial_number: 'SN-1' },
    { id: 'terminal-x', merchant_id: 'merchant-b', terminal_name: 'Other store', serial_number: 'SN-X' },
  ]
  const links = [
    { id: 'batch-1', merchant_id: 'merchant-a', payment_terminal_id: 'terminal-1' },
    { id: 'batch-2', merchant_id: 'merchant-a', payment_terminal_id: null },
    { id: 'batch-3', merchant_id: 'merchant-a', payment_terminal_id: 'terminal-deleted' },
    { id: 'batch-4', merchant_id: 'merchant-a', payment_terminal_id: 'terminal-x' },
  ]
  const row = (id: string, resource_id: string, overrides: Record<string, string> = {}) => ({
    id,
    merchant_id: 'merchant-a',
    action_category: 'settlement',
    resource_type: 'settlement_batch',
    resource_id,
    ...overrides,
  })

  it('resolves each batch row through its own FK and never guesses', () => {
    const resolved = resolveAuditSettlementTerminals([
      row('a', 'batch-1'),
      row('b', 'batch-2'),
      row('c', 'batch-3'),
      row('d', 'batch-4'),
      row('e', 'batch-gone'),
    ], links, terminals)

    expect(resolved.get('a')).toEqual({ status: 'linked', terminalId: 'terminal-1', name: 'Front', serial: 'SN-1' })
    expect(resolved.get('b')).toEqual({ status: 'not_recorded' })
    expect(resolved.get('c')).toEqual({ status: 'terminal_missing', terminalId: 'terminal-deleted' })
    // A terminal owned by another merchant is treated as missing, not linked.
    expect(resolved.get('d')).toEqual({ status: 'terminal_missing', terminalId: 'terminal-x' })
    expect(resolved.get('e')).toEqual({ status: 'batch_missing' })
  })

  it('does not attribute a batch that belongs to another merchant', () => {
    const resolved = resolveAuditSettlementTerminals([row('a', 'batch-1', { merchant_id: 'merchant-b' })], links, terminals)
    expect(resolved.get('a')).toEqual({ status: 'batch_missing' })
  })

  it('resolves auto-settle watchdog rows straight from the terminal id', () => {
    const resolved = resolveAuditSettlementTerminals(
      [row('w', 'terminal-1', { resource_type: 'payment_terminal' })],
      [],
      terminals,
    )
    expect(resolved.get('w')).toMatchObject({ status: 'linked', serial: 'SN-1' })
  })

  it('ignores rows that are not settlement events', () => {
    const resolved = resolveAuditSettlementTerminals(
      [row('m', 'batch-1', { action_category: 'menu' }), row('t', 'terminal-1', { resource_type: 'payment_terminal', action_category: 'settings' })],
      links,
      terminals,
    )
    expect(resolved.size).toBe(0)
  })
})

describe('resolveAuditSettlementBatches', () => {
  it("returns the batch row's own label fields for same-merchant batches only", () => {
    const resolved = resolveAuditSettlementBatches(
      [
        { id: 'a', merchant_id: 'merchant-a', action_category: 'settlement', resource_type: 'settlement_batch', resource_id: 'batch-1' },
        { id: 'b', merchant_id: 'merchant-b', action_category: 'settlement', resource_type: 'settlement_batch', resource_id: 'batch-1' },
        { id: 'w', merchant_id: 'merchant-a', action_category: 'settlement', resource_type: 'payment_terminal', resource_id: 'terminal-1' },
      ],
      [{ id: 'batch-1', merchant_id: 'merchant-a', payment_terminal_id: null, batch_id: 'LAZY-VALOR-10', batch_number: 10, acquirer: 'VALOR' }],
    )

    expect(resolved.get('a')).toEqual({ batchId: 'LAZY-VALOR-10', batchNumber: '10', acquirer: 'VALOR' })
    expect(resolved.has('b')).toBe(false)
    expect(resolved.has('w')).toBe(false)
  })
})
