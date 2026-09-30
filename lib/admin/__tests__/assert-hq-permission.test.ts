import { beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * assertHQPermission runs on every HQ server action. Each Supabase RPC is a
 * network round-trip, so its three lookups must go out together — one
 * round-trip of latency, not three in a row.
 */

const mock = vi.hoisted(() => {
    process.env.DEXA_POS_INTERNAL_TEAM_ID = 'org_hq'
    const pending: { name: string; resolve: (value: unknown) => void }[] = []
    const rpc = vi.fn((name: string) => {
        let resolve!: (value: unknown) => void
        const promise = new Promise((r) => (resolve = r))
        pending.push({ name, resolve })
        // get_my_hq_role is chained with .single(); the others are awaited directly.
        return Object.assign(promise, { single: () => promise })
    })
    return { pending, rpc, auth: vi.fn() }
})

vi.mock('@clerk/nextjs/server', () => ({ auth: mock.auth }))
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: () => ({ rpc: mock.rpc }) }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))

import { assertHQPermission, assertSuperAdmin } from '../auth'

const flush = () => new Promise((r) => setTimeout(r, 0))

function answer(values: Record<string, unknown>) {
    for (const call of mock.pending) call.resolve({ data: values[call.name] })
}

describe('assertHQPermission', () => {
    beforeEach(() => {
        mock.pending.length = 0
        mock.rpc.mockClear()
        mock.auth.mockResolvedValue({ userId: 'user_1', orgId: 'org_hq' })
    })

    it('sends all three lookups before any of them answers', async () => {
        const result = assertHQPermission('hq.merchant.transactions')
        await flush()

        expect(mock.pending.map((c) => c.name).sort()).toEqual(
            ['get_my_hq_permissions', 'get_my_hq_role', 'hq_has_permission']
        )

        answer({
            hq_has_permission: true,
            get_my_hq_role: { role_code: 'hq.support' },
            get_my_hq_permissions: ['hq.merchant.transactions'],
        })
        await expect(result).resolves.toMatchObject({ userId: 'user_1', role: { role_code: 'hq.support' } })
    })

    it('still refuses a caller without the permission', async () => {
        const result = assertHQPermission('hq.merchant.transactions')
        await flush()
        answer({ hq_has_permission: false, get_my_hq_role: { role_code: 'hq.support' }, get_my_hq_permissions: [] })
        await expect(result).rejects.toThrow('Missing permission hq.merchant.transactions')
    })

    it('refuses outside the HQ org without touching the database', async () => {
        mock.auth.mockResolvedValue({ userId: 'user_1', orgId: 'org_other' })
        await expect(assertHQPermission('hq.merchant.transactions')).rejects.toThrow('HQ admin access required')
        expect(mock.rpc).not.toHaveBeenCalled()
    })
})

describe('assertSuperAdmin', () => {
    beforeEach(() => {
        mock.pending.length = 0
        mock.rpc.mockClear()
        mock.auth.mockResolvedValue({ userId: 'user_1', orgId: 'org_hq' })
    })

    it('sends both lookups before either answers, and still refuses a non-super-admin', async () => {
        const result = assertSuperAdmin()
        await flush()
        expect(mock.pending.map((c) => c.name).sort()).toEqual(['get_my_hq_permissions', 'get_my_hq_role'])
        answer({ get_my_hq_role: { role_code: 'hq.support' }, get_my_hq_permissions: [] })
        await expect(result).rejects.toThrow('Super admin access required')
    })
})
