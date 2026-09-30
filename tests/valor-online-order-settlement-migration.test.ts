import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

const migration = read('supabase/migrations/20260930140000_valor_online_order_settlement.sql')
const rollback = read(
  'supabase/migrations/rollback/20260930140000_valor_online_order_settlement_rollback.sql',
)

function functionBody(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`)
  expect(start, `${name} is defined`).toBeGreaterThan(-1)
  return sql.slice(start, sql.indexOf('$function$;', start))
}

describe('Valor online-order settlement migration', () => {
  const online = functionBody(migration, 'record_valor_online_batch_webhook')
  const terminal = functionBody(migration, 'record_valor_batch_webhook')

  it('hands an EPI no terminal owns to the online path instead of dead-lettering it', () => {
    expect(terminal).toContain('RETURN public.record_valor_online_batch_webhook(p_payload);')
    expect(terminal).not.toContain('Unknown Valor EPI')
  })

  it('leaves the terminal path keyed on the terminal', () => {
    expect(terminal).toContain("WHERE valor_epi = v_epi AND terminal_type = 'valor'")
    expect(terminal).toContain('WHERE terminal_id = v_terminal.id::text')
  })

  it('resolves only an active online-order account', () => {
    expect(online).toContain("AND a.purpose = 'online_order'")
    expect(online).toContain('AND a.is_active')
    expect(online).toContain('AND a.valor_epi = v_epi')
  })

  it('dead-letters what it cannot attribute to one location', () => {
    expect(online).toContain("'reason', 'unknown_epi'")
    expect(online).toContain("'reason', 'ambiguous_epi'")
    expect(online).toContain("'reason', 'account_without_location'")
  })

  it('links only unsettled, unvoided online payments for that location and batch', () => {
    expect(online).toContain('WHERE op.terminal_id IS NULL')
    expect(online).toContain('AND op.location_id = v_account.location_id')
    expect(online).toContain("AND op.processor_response->>'epi' = v_epi")
    expect(online).toContain(
      "AND COALESCE(op.batch_number, op.processor_response->>'batch_no') = v_batch_no",
    )
    expect(online).toContain('AND op.is_settled = false')
    expect(online).toContain('AND op.settlement_batch_id IS NULL')
    expect(online).toContain('AND NOT COALESCE(op.is_voided, false)')
  })

  it('converts Valor cents to dollars like the terminal path', () => {
    expect(online).toContain("v_data->>'purchase_amount', '')::numeric, 0) / 100")
    expect(terminal).toContain("v_data->>'purchase_amount', '')::numeric, 0) / 100")
  })

  it('flags an amount mismatch for review rather than settling', () => {
    expect(online).toContain("v_status := 'needs_review';")
    expect(online).toContain('abs(v_linked_total - (v_gross + v_tip)) > 0.01')
  })

  it('treats a redelivery of the same Valor batch as a replay', () => {
    expect(online).toContain("'idempotent_replay', true")
    expect(online).toContain('v_epoch := v_existing.batch_epoch + 1;')
  })

  it('is callable by the service role only', () => {
    expect(migration).toContain(
      'revoke all on function public.record_valor_online_batch_webhook(jsonb) from public, anon, authenticated;',
    )
    expect(migration).toContain(
      'grant execute on function public.record_valor_online_batch_webhook(jsonb) to service_role;',
    )
  })

  it('rolls back to a terminal-only receiver', () => {
    const restored = functionBody(rollback, 'record_valor_batch_webhook')
    expect(restored).toContain('Unknown Valor EPI')
    expect(restored).not.toContain('record_valor_online_batch_webhook')
    expect(rollback).toContain(
      'drop function if exists public.record_valor_online_batch_webhook(jsonb);',
    )
  })
})
