'use server'

import { assertHQPermission } from '@/lib/admin/auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export type DefaultEntityKind = 'stations' | 'payment_terminals' | 'prep_stations'

export interface DefaultEntitiesReport {
  ok: boolean
  missing: DefaultEntityKind[]
  counts: Record<DefaultEntityKind, number>
}

const KINDS: DefaultEntityKind[] = ['stations', 'payment_terminals', 'prep_stations']

async function countEntity(
  supabase: ReturnType<typeof createServiceRoleClient>,
  table: DefaultEntityKind,
  merchantId: string,
  locationId?: string,
): Promise<number> {
  let query = supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('merchant_id', merchantId)

  if (locationId) {
    query = query.eq('location_id', locationId)
  }

  const { count, error } = await query
  if (error) {
    console.error(`[verifyDefaultEntities] count error for ${table}:`, error)
    return 0
  }
  return count ?? 0
}

export async function verifyDefaultEntitiesForMerchant(
  merchantId: string,
  locationId?: string,
): Promise<DefaultEntitiesReport> {
  const supabase = createServiceRoleClient()

  const results = await Promise.all(
    KINDS.map((kind) => countEntity(supabase, kind, merchantId, locationId)),
  )

  const counts = KINDS.reduce<Record<DefaultEntityKind, number>>(
    (acc, kind, i) => {
      acc[kind] = results[i]
      return acc
    },
    { stations: 0, payment_terminals: 0, prep_stations: 0 },
  )

  const missing = KINDS.filter((kind) => counts[kind] === 0)

  return { ok: missing.length === 0, missing, counts }
}

export async function verifyDefaultEntitiesForMerchantHQ(
  merchantId: string,
  locationId?: string,
): Promise<DefaultEntitiesReport> {
  await assertHQPermission('hq.merchant.view')
  return verifyDefaultEntitiesForMerchant(merchantId, locationId)
}
