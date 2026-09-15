import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ permission: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }))
vi.mock('@/lib/admin/auth', () => ({ assertHQPermission: mocks.permission }))
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: () => ({ rpc: mocks.rpc }) }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))
import { prepareSubscriptionCutover } from '../app/manage/actions/subscription-cutover'

describe('HQ billing cutover preparation', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.permission.mockResolvedValue(undefined)
    mocks.rpc.mockResolvedValue({ error: null })
  })

  it('requires HQ billing permission before any database call', async () => {
    mocks.permission.mockRejectedValue(new Error('Forbidden'))
    await expect(prepareSubscriptionCutover({ subscriptionId: 's', startDate: '2026-10-01', externalBillingReviewed: true })).rejects.toThrow('Forbidden')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('requires explicit confirmation and a date', async () => {
    for (const params of [{ startDate: '', externalBillingReviewed: true }, { startDate: '2026-10-01', externalBillingReviewed: false }]) {
      expect((await prepareSubscriptionCutover({ subscriptionId: 's', ...params })).success).toBe(false)
    }
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('only prepares through the audited RPC and invalidates both views', async () => {
    expect(await prepareSubscriptionCutover({ subscriptionId: 's', startDate: '2026-10-01', externalBillingReviewed: true })).toEqual({ success: true })
    expect(mocks.permission).toHaveBeenCalledWith('system.billing.manage')
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('prepare_migrated_subscription', {
      p_subscription_id: 's', p_start_date: '2026-10-01', p_external_billing_reviewed: true,
    })
    expect(mocks.revalidate).toHaveBeenCalledWith('/dashboard/subscriptions')
    expect(mocks.revalidate).toHaveBeenCalledWith('/manage/subscriptions', 'layout')
  })

  it('surfaces missing migrations and rejected cards without claiming success', async () => {
    mocks.rpc.mockResolvedValueOnce({ error: { code: 'PGRST202', message: 'missing RPC' } })
    expect((await prepareSubscriptionCutover({ subscriptionId: 's', startDate: '2026-10-01', externalBillingReviewed: true })).error).toContain('migration')
    mocks.rpc.mockResolvedValueOnce({ error: { message: 'No active primary Valor card' } })
    expect((await prepareSubscriptionCutover({ subscriptionId: 's', startDate: '2026-10-01', externalBillingReviewed: true })).error).toContain('No active primary')
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })
})
