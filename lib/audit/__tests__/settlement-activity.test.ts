import { describe, expect, it } from 'vitest'
import { describeSettlementActivity } from '../settlement-activity'
import { buildAuditSentence } from '../sentence-templates'
import type { AuditLogWithLocation, SettlementTerminalAttribution } from '@/types/audit-log'

const linked: SettlementTerminalAttribution = {
  status: 'linked',
  terminalId: 'terminal-1',
  name: 'Front Counter',
  serial: 'SN-123',
}

function batchLog(overrides: Partial<Parameters<typeof describeSettlementActivity>[0]> = {}) {
  return {
    action: 'batch_settled',
    resource_type: 'settlement_batch',
    resource_name: 'CDP-20260927-001',
    metadata: { acquirer: 'TSYS', batch_number: '009' },
    ...overrides,
  }
}

describe('describeSettlementActivity', () => {
  it('names the linked terminal without claiming it initiated settlement', () => {
    const result = describeSettlementActivity(batchLog({ settlement_terminal: linked }))

    expect(result).toMatchObject({
      title: 'Batch settled',
      sentence: 'Batch TSYS-009 settled',
      batchLabel: 'Batch TSYS-009',
      terminalLabel: 'Front Counter (serial SN-123)',
      terminalSerial: 'SN-123',
    })
    expect(result?.details).toContainEqual({ label: 'Linked terminal', value: 'Front Counter (serial SN-123)' })
  })

  it('labels closed and funded batches from their recorded status', () => {
    for (const [batchStatus, title] of [['closed', 'Batch closed'], ['funded', 'Batch funded']] as const) {
      const result = describeSettlementActivity(batchLog({ metadata: { batch_status: batchStatus } }))
      expect(result?.title).toBe(title)
    }
  })

  it('reports every unresolved terminal state honestly instead of guessing', () => {
    const cases: [SettlementTerminalAttribution, string][] = [
      [{ status: 'not_recorded' }, 'Terminal not recorded'],
      [{ status: 'terminal_missing', terminalId: 'gone' }, 'Terminal record unavailable'],
      [{ status: 'batch_missing' }, 'Batch record no longer exists'],
      [{ status: 'unavailable' }, 'Terminal details unavailable'],
    ]
    for (const [attribution, label] of cases) {
      const result = describeSettlementActivity(batchLog({ settlement_terminal: attribution }))
      expect(result?.terminalLabel).toBe(label)
      expect(result?.terminalSerial).toBeNull()
    }
  })

  it('says an online-order batch has no terminal rather than that one is missing', () => {
    const result = describeSettlementActivity(batchLog({
      metadata: { channel: 'online_order', source: 'valor_webhook', batch_number: '3' },
      settlement_terminal: { status: 'not_recorded' },
    }))

    expect(result?.terminalLabel).toBe('Online orders — no terminal')
    expect(result?.details).toContainEqual({ label: 'Recorded by', value: 'Online orders (Valor batch webhook)' })
  })

  it("labels a batch from its own row so every writer's rows agree", () => {
    // The Valor webhook omits `acquirer`; older HQ rows carry no batch at all.
    const webhook = describeSettlementActivity(batchLog({
      resource_name: 'LAZY-VALOR-10',
      metadata: { source: 'valor_webhook', batch_number: '10' },
      settlement_batch: { batchId: 'LAZY-VALOR-10', batchNumber: '10', acquirer: 'VALOR' },
    }))
    const legacyManual = describeSettlementActivity(batchLog({
      action: 'manual_mark_batch_settled',
      resource_name: null,
      metadata: { reason: 'Processor confirmed close' },
      settlement_batch: { batchId: 'LAZY-VALOR-10', batchNumber: '10', acquirer: 'VALOR' },
    }))

    expect(webhook?.sentence).toBe('Batch VALOR-10 settled')
    expect(legacyManual?.batchLabel).toBe('Batch VALOR-10')
    expect(legacyManual?.details).toContainEqual({ label: 'Batch', value: 'Batch VALOR-10 · LAZY-VALOR-10' })
  })

  it('omits the terminal when the row was never enriched', () => {
    expect(describeSettlementActivity(batchLog())?.terminalLabel).toBeNull()
  })

  it('reads a POS needs-review row: status change, money, reason', () => {
    const result = describeSettlementActivity(batchLog({
      action: 'batch_settlement_needs_review',
      metadata: {
        source: 'pos_terminal',
        batch_number: '12',
        batch_status: 'needs_review',
        previous_status: 'open',
        transaction_count: 4,
        gross_amount: 17.65,
        tip_amount: '2.5',
        net_deposit: 16.9,
        failure_reason: 'Host totals mismatch',
      },
      settlement_terminal: linked,
    }))

    expect(result?.sentence).toBe('Batch 12 needs settlement review')
    expect(result?.highlight).toBe('Front Counter (serial SN-123) · 4 payments · $17.65 · Reason: Host totals mismatch')
    expect(result?.details).toEqual(expect.arrayContaining([
      { label: 'Recorded by', value: 'POS terminal' },
      { label: 'Status', value: 'Open → Needs review' },
      { label: 'Payments', value: '4' },
      { label: 'Gross', value: '$17.65' },
      { label: 'Tips', value: '$2.50' },
      { label: 'Batch net', value: '$16.90' },
      { label: 'Reason', value: 'Host totals mismatch' },
    ]))
  })

  it('describes an HQ manual reconciliation in terms a merchant understands', () => {
    const result = describeSettlementActivity(batchLog({
      action: 'manual_mark_batch_settled',
      metadata: { reason: 'Processor confirmed close', payments_settled: 1, batch_number: '009', acquirer: 'TSYS' },
    }))

    expect(result?.title).toBe('Batch marked settled by Dexa')
    expect(result?.highlight).toBe('1 payment marked settled · Reason: Processor confirmed close')
    expect(result?.details).toContainEqual({ label: 'Payments marked settled', value: '1' })
    expect(result?.details).toContainEqual({ label: 'Recorded by', value: 'Dexa (manual reconciliation)' })
  })

  it('describes auto-settle watchdog alerts against the terminal', () => {
    const result = describeSettlementActivity({
      action: 'auto_settle_missed',
      resource_type: 'payment_terminal',
      resource_name: 'Old name',
      metadata: { source: 'auto_settle_watchdog', business_date: '2026-09-29', settle_time: '23:00', location_timezone: 'America/New_York', grace_minutes: 30 },
      settlement_terminal: linked,
    })

    expect(result?.title).toBe("Auto-settle didn't run")
    expect(result?.sentence).toBe("Auto-settle didn't run on Front Counter")
    expect(result?.details).toEqual(expect.arrayContaining([
      { label: 'Scheduled settle time', value: '23:00 America/New_York' },
      { label: 'Grace period', value: '30 min' },
    ]))
  })

  it('leaves unrelated audit actions alone', () => {
    expect(describeSettlementActivity({
      action: 'staff_clock_in',
      resource_type: 'staff_member',
      resource_name: 'Cashier',
      metadata: null,
    })).toBeNull()
  })
})

describe('buildAuditSentence for batch events', () => {
  it('uses the settlement description instead of the raw-action fallback', () => {
    const log = {
      ...batchLog({ metadata: { batch_number: '3', batch_status: 'closed' }, settlement_terminal: linked }),
      id: 'log-1',
      action_category: 'settlement',
      actor_name: null,
    } as unknown as AuditLogWithLocation

    expect(buildAuditSentence(log)).toEqual({
      sentence: 'Batch 3 closed',
      highlight: 'Front Counter (serial SN-123)',
      iconName: 'Layers',
    })
  })
})
