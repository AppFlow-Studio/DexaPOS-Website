import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ValorEndpoints } from '@/lib/payments/valor/config'

const mocks = vi.hoisted(() => ({ createServiceRoleClient: vi.fn() }))
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mocks.createServiceRoleClient,
}))

import {
  extractVaultCardMeta,
  healBillingProfileCardMeta,
  resolveVaultCardMeta,
} from '../vault-card-meta'

// Fetch and the database are both stubbed, so nothing leaves the machine. The
// Valor bodies are the shapes the sandbox returned on 2026-09-29, with the card
// token and cardholder replaced.

const ENDPOINTS: ValorEndpoints = {
  environment: 'sandbox',
  clientTokenBaseUrl: 'https://ct.test',
  transactionBaseUrl: 'https://txn.test',
  vaultBaseUrl: 'https://vault.test',
  boardingBaseUrl: 'https://board.test',
  isDemo: true,
}

const CREDS = { epi: '2000000001', appId: 'app-id', appKey: 'app-key' }

function profileEntry(overrides: Record<string, unknown> = {}) {
  return {
    payment_id: 124285,
    masked_pan: 'XXXX5439',
    token: 'tok-not-for-display',
    card_type: 'C',
    card_brand: 'Visa',
    cardholder_name: 'Jane Doe',
    status: 'active',
    ...overrides,
  }
}

function profilesBody(entries: unknown[] = [profileEntry()]) {
  return { code: 200, status: 'OK', message: 'Success', data: entries }
}

const NOT_FOUND = {
  status: 400,
  body: { code: 400, status: 'FAILED', errors: ['Customer not exist'] },
}

function stubFetch(response: { status: number; body: unknown } | Error) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} })
    if (response instanceof Error) throw response
    return new Response(JSON.stringify(response.body), { status: response.status })
  }) as unknown as typeof fetch
  return { fetchImpl, calls }
}

interface StoredProfile {
  id: string
  card_brand: string | null
  customer_vault_id: string | null
  payment_profile_id: string | null
  processor_account_id: string | null
  vaulted_under_epi: string | null
}

function storedProfile(overrides: Partial<StoredProfile> = {}): StoredProfile {
  return {
    id: 'profile-1',
    card_brand: 'credit-card',
    customer_vault_id: '130618',
    payment_profile_id: '124285',
    processor_account_id: 'account-1',
    vaulted_under_epi: CREDS.epi,
    ...overrides,
  }
}

function listedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'profile-1',
    billing_method: 'card',
    card_brand: 'credit-card' as string | null,
    card_last_four: null as string | null,
    ...overrides,
  }
}

// Minimal stand-in for the service-role client: the one select, the one update
// and the credentials RPC the heal path performs.
function fakeDb(config: {
  stored?: StoredProfile[]
  selectError?: { message: string }
  updateError?: { message: string }
  credentials?: Record<string, unknown> | null
}) {
  const updates: Array<{ id: string; payload: Record<string, unknown> }> = []
  const rpc = vi.fn(async () => ({
    data:
      config.credentials === null
        ? null
        : [
            config.credentials ?? {
              valor_appid: CREDS.appId,
              decrypted_appkey: CREDS.appKey,
              valor_epi: CREDS.epi,
            },
          ],
    error: null,
  }))

  const from = vi.fn(() => ({
    select: () => {
      let ids: string[] = []
      const chain = {
        in: (_column: string, values: string[]) => {
          ids = values
          return chain
        },
        eq: () => chain,
        not: () => chain,
        then: (resolve: (value: unknown) => unknown) =>
          resolve(
            config.selectError
              ? { data: null, error: config.selectError }
              : {
                  data: (config.stored ?? []).filter((row) => ids.includes(row.id)),
                  error: null,
                },
          ),
      }
      return chain
    },
    update: (payload: Record<string, unknown>) => ({
      eq: async (_column: string, id: string) => {
        updates.push({ id, payload })
        return { error: config.updateError ?? null }
      },
    }),
  }))

  mocks.createServiceRoleClient.mockReturnValue({ rpc, from })
  return { updates, rpc, from }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('extractVaultCardMeta', () => {
  it('reads masked_pan and card_brand from a payment profile', () => {
    expect(extractVaultCardMeta(profileEntry())).toEqual({
      lastFour: '5439',
      expMonth: null,
      expYear: null,
      brand: 'Visa',
    })
  })

  it('does not treat card_type as the brand', () => {
    // Valor's card_type is "C" / "D" — credit or debit, not the network.
    expect(extractVaultCardMeta({ card_type: 'C', masked_pan: 'XXXX1111' }).brand).toBeNull()
    expect(extractVaultCardMeta({ card_type: 'Visa' }).brand).toBeNull()
  })

  it('drops a generic type found under a brand key', () => {
    expect(extractVaultCardMeta({ card_brand: 'credit-card' }).brand).toBeNull()
  })

  it('reads the webhook shape production returned', () => {
    const meta = extractVaultCardMeta({
      card_scheme: 'Amex',
      masked_card_no: '3782 XXXX XXXX 0005',
    })
    expect(meta.brand).toBe('American Express')
    expect(meta.lastFour).toBe('0005')
  })

  it('reads the masked pan a sale response carries', () => {
    expect(extractVaultCardMeta({ pan: 'XXXX3438', card_brand: 'MASTERCARD' })).toMatchObject({
      lastFour: '3438',
      brand: 'Mastercard',
    })
  })

  it('reads an expiry when a response does carry one', () => {
    expect(extractVaultCardMeta({ exp_month: '4', exp_year: '27' })).toMatchObject({
      expMonth: 4,
      expYear: 2027,
    })
    expect(extractVaultCardMeta({ expiry: '04/27' })).toMatchObject({
      expMonth: 4,
      expYear: 2027,
    })
  })

  it('leaves everything null for a body with no card details', () => {
    const empty = { lastFour: null, expMonth: null, expYear: null, brand: null }
    expect(extractVaultCardMeta({ code: 201, status: 'OK', vault_customer_id: 130618 })).toEqual(empty)
    expect(extractVaultCardMeta(null)).toEqual(empty)
    expect(extractVaultCardMeta('nope')).toEqual(empty)
  })
})

describe('resolveVaultCardMeta', () => {
  it('uses a response already in hand without calling Valor', async () => {
    const { fetchImpl, calls } = stubFetch({ status: 200, body: profilesBody() })

    const meta = await resolveVaultCardMeta(
      { credentials: CREDS, endpoints: ENDPOINTS, fetchImpl },
      {
        vaultCustomerId: '130618',
        paymentProfileId: '124285',
        responses: [{ masked_pan: 'XXXX1111', card_brand: 'Discover' }],
      },
    )

    expect(meta).toMatchObject({ lastFour: '1111', brand: 'Discover' })
    expect(calls).toHaveLength(0)
  })

  it('falls back to Get Payment Profile, matched on payment_id', async () => {
    const { fetchImpl, calls } = stubFetch({
      status: 200,
      body: profilesBody([
        profileEntry({ payment_id: 111, masked_pan: 'XXXX0001', card_brand: 'Mastercard' }),
        profileEntry(),
      ]),
    })

    const meta = await resolveVaultCardMeta(
      { credentials: CREDS, endpoints: ENDPOINTS, fetchImpl },
      {
        vaultCustomerId: '130618',
        paymentProfileId: '124285',
        // What the attach response is documented to be: no card details.
        responses: [{ code: 201, status: 'OK', payment_id: 124285 }],
      },
    )

    expect(meta).toEqual({ lastFour: '5439', expMonth: null, expYear: null, brand: 'Visa' })
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://vault.test/api/valor-vault/getpaymentprofile/130618')
    expect(calls[0].init.method).toBe('GET')
  })

  it('does not guess when the payment id matches no profile', async () => {
    const { fetchImpl } = stubFetch({ status: 200, body: profilesBody() })

    const meta = await resolveVaultCardMeta(
      { credentials: CREDS, endpoints: ENDPOINTS, fetchImpl },
      { vaultCustomerId: '130618', paymentProfileId: '999' },
    )

    expect(meta).toEqual({ lastFour: null, expMonth: null, expYear: null, brand: null })
  })

  it('uses the only card on the customer when no payment id was returned', async () => {
    const { fetchImpl } = stubFetch({ status: 200, body: profilesBody() })

    const meta = await resolveVaultCardMeta(
      { credentials: CREDS, endpoints: ENDPOINTS, fetchImpl },
      { vaultCustomerId: '130618', paymentProfileId: null },
    )

    expect(meta).toMatchObject({ lastFour: '5439', brand: 'Visa' })
  })

  it('does not guess between several cards when no payment id was returned', async () => {
    const { fetchImpl } = stubFetch({
      status: 200,
      body: profilesBody([profileEntry({ payment_id: 1 }), profileEntry({ payment_id: 2 })]),
    })

    const meta = await resolveVaultCardMeta(
      { credentials: CREDS, endpoints: ENDPOINTS, fetchImpl },
      { vaultCustomerId: '130618', paymentProfileId: null },
    )

    expect(meta.lastFour).toBeNull()
    expect(meta.brand).toBeNull()
  })

  it('does not call Valor without a vault customer id', async () => {
    const { fetchImpl, calls } = stubFetch({ status: 200, body: profilesBody() })

    const meta = await resolveVaultCardMeta(
      { credentials: CREDS, endpoints: ENDPOINTS, fetchImpl },
      { vaultCustomerId: null, paymentProfileId: null },
    )

    expect(meta.lastFour).toBeNull()
    expect(calls).toHaveLength(0)
  })

  it('resolves instead of throwing when Valor rejects the lookup', async () => {
    const { fetchImpl } = stubFetch(NOT_FOUND)

    await expect(
      resolveVaultCardMeta(
        { credentials: CREDS, endpoints: ENDPOINTS, fetchImpl },
        { vaultCustomerId: '999999999', paymentProfileId: '1' },
      ),
    ).resolves.toEqual({ lastFour: null, expMonth: null, expYear: null, brand: null })
  })

  it('resolves instead of throwing when the request itself fails', async () => {
    const { fetchImpl } = stubFetch(new Error('network down'))

    await expect(
      resolveVaultCardMeta(
        { credentials: CREDS, endpoints: ENDPOINTS, fetchImpl },
        {
          vaultCustomerId: '130618',
          paymentProfileId: '124285',
          responses: [{ card_brand: 'Visa' }],
        },
      ),
    ).resolves.toMatchObject({ brand: 'Visa', lastFour: null })
  })

  it('never logs credentials when a lookup fails', async () => {
    const { fetchImpl } = stubFetch(NOT_FOUND)

    await resolveVaultCardMeta(
      { credentials: CREDS, endpoints: ENDPOINTS, fetchImpl },
      { vaultCustomerId: '130618', paymentProfileId: '124285' },
    )

    const logged = JSON.stringify(vi.mocked(console.error).mock.calls)
    expect(logged).not.toContain(CREDS.appId)
    expect(logged).not.toContain(CREDS.appKey)
  })
})

describe('healBillingProfileCardMeta', () => {
  it('backfills a card that was saved without its details', async () => {
    const { updates } = fakeDb({ stored: [storedProfile()] })
    const { fetchImpl, calls } = stubFetch({ status: 200, body: profilesBody() })

    const rows = await healBillingProfileCardMeta(
      [listedRow({ location_name: 'Uptown' })],
      { endpoints: ENDPOINTS, fetchImpl },
    )

    expect(rows).toEqual([
      {
        id: 'profile-1',
        billing_method: 'card',
        card_brand: 'Visa',
        card_last_four: '5439',
        location_name: 'Uptown',
      },
    ])
    expect(calls).toHaveLength(1)
    expect(updates).toHaveLength(1)
    expect(updates[0].id).toBe('profile-1')
    expect(updates[0].payload).toMatchObject({ card_brand: 'Visa', card_last_four: '5439' })
    expect(updates[0].payload).not.toHaveProperty('card_exp_month')
  })

  it('leaves rows that already have a last four alone', async () => {
    fakeDb({ stored: [storedProfile()] })
    const { fetchImpl, calls } = stubFetch({ status: 200, body: profilesBody() })
    const rows = [listedRow({ card_brand: 'Visa', card_last_four: '1111' })]

    expect(await healBillingProfileCardMeta(rows, { endpoints: ENDPOINTS, fetchImpl })).toBe(rows)
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled()
    expect(calls).toHaveLength(0)
  })

  it('ignores bank accounts', async () => {
    const { fetchImpl, calls } = stubFetch({ status: 200, body: profilesBody() })
    const rows = [listedRow({ billing_method: 'ach', card_brand: null })]

    expect(await healBillingProfileCardMeta(rows, { endpoints: ENDPOINTS, fetchImpl })).toBe(rows)
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled()
    expect(calls).toHaveLength(0)
  })

  it('only heals the rows that need it', async () => {
    const { updates } = fakeDb({
      stored: [storedProfile(), storedProfile({ id: 'profile-2' })],
    })
    const { fetchImpl, calls } = stubFetch({ status: 200, body: profilesBody() })

    const rows = await healBillingProfileCardMeta(
      [
        listedRow(),
        listedRow({ id: 'profile-2', card_brand: 'Mastercard', card_last_four: '4444' }),
      ],
      { endpoints: ENDPOINTS, fetchImpl },
    )

    expect(rows[0]).toMatchObject({ card_brand: 'Visa', card_last_four: '5439' })
    expect(rows[1]).toMatchObject({ card_brand: 'Mastercard', card_last_four: '4444' })
    expect(calls).toHaveLength(1)
    expect(updates.map((update) => update.id)).toEqual(['profile-1'])
  })

  it('returns the row as-is when Valor cannot find the customer', async () => {
    const { updates } = fakeDb({ stored: [storedProfile()] })
    const { fetchImpl } = stubFetch(NOT_FOUND)
    const rows = [listedRow()]

    expect(await healBillingProfileCardMeta(rows, { endpoints: ENDPOINTS, fetchImpl })).toEqual(rows)
    expect(updates).toHaveLength(0)
  })

  it('returns the row as-is when the request to Valor fails', async () => {
    const { updates } = fakeDb({ stored: [storedProfile()] })
    const { fetchImpl } = stubFetch(new Error('network down'))
    const rows = [listedRow()]

    expect(await healBillingProfileCardMeta(rows, { endpoints: ENDPOINTS, fetchImpl })).toEqual(rows)
    expect(updates).toHaveLength(0)
  })

  it('returns the rows as-is when the profile lookup fails', async () => {
    fakeDb({ selectError: { message: 'permission denied' } })
    const { fetchImpl, calls } = stubFetch({ status: 200, body: profilesBody() })
    const rows = [listedRow()]

    expect(await healBillingProfileCardMeta(rows, { endpoints: ENDPOINTS, fetchImpl })).toBe(rows)
    expect(calls).toHaveLength(0)
  })

  it('returns the rows as-is when the database client cannot be created', async () => {
    mocks.createServiceRoleClient.mockImplementation(() => {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    })
    const { fetchImpl } = stubFetch({ status: 200, body: profilesBody() })
    const rows = [listedRow()]

    expect(await healBillingProfileCardMeta(rows, { endpoints: ENDPOINTS, fetchImpl })).toBe(rows)
  })

  it('skips a row whose credentials are unavailable', async () => {
    const { updates } = fakeDb({ stored: [storedProfile()], credentials: null })
    const { fetchImpl, calls } = stubFetch({ status: 200, body: profilesBody() })
    const rows = [listedRow()]

    expect(await healBillingProfileCardMeta(rows, { endpoints: ENDPOINTS, fetchImpl })).toEqual(rows)
    expect(calls).toHaveLength(0)
    expect(updates).toHaveLength(0)
  })

  it('skips a card vaulted under a different EPI', async () => {
    // Those credentials read a different vault; asking it about this customer
    // id could only be wrong.
    const { updates } = fakeDb({ stored: [storedProfile({ vaulted_under_epi: '2999999999' })] })
    const { fetchImpl, calls } = stubFetch({ status: 200, body: profilesBody() })
    const rows = [listedRow()]

    expect(await healBillingProfileCardMeta(rows, { endpoints: ENDPOINTS, fetchImpl })).toEqual(rows)
    expect(calls).toHaveLength(0)
    expect(updates).toHaveLength(0)
  })

  it('skips a row that has no vault ids to look up', async () => {
    // The stand-in returns whatever is stored; the real query filters these out.
    fakeDb({ stored: [] })
    const { fetchImpl, calls } = stubFetch({ status: 200, body: profilesBody() })
    const rows = [listedRow()]

    expect(await healBillingProfileCardMeta(rows, { endpoints: ENDPOINTS, fetchImpl })).toEqual(rows)
    expect(calls).toHaveLength(0)
  })

  it('clears a generic stored brand when Valor returns no brand', async () => {
    const { updates } = fakeDb({ stored: [storedProfile()] })
    const { fetchImpl } = stubFetch({
      status: 200,
      body: profilesBody([profileEntry({ card_brand: '' })]),
    })

    const rows = await healBillingProfileCardMeta([listedRow()], { endpoints: ENDPOINTS, fetchImpl })

    expect(rows[0]).toMatchObject({ card_brand: null, card_last_four: '5439' })
    expect(updates[0].payload).toMatchObject({ card_brand: null, card_last_four: '5439' })
  })

  it('still returns the corrected values when the write-back fails', async () => {
    fakeDb({ stored: [storedProfile()], updateError: { message: 'write failed' } })
    const { fetchImpl } = stubFetch({ status: 200, body: profilesBody() })

    const rows = await healBillingProfileCardMeta([listedRow()], { endpoints: ENDPOINTS, fetchImpl })

    expect(rows[0]).toMatchObject({ card_brand: 'Visa', card_last_four: '5439' })
  })
})
