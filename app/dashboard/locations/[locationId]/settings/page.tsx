import { notFound } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { PageHeader, PageShell } from '@/components/dashboard/shell'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getEffectiveClerkOrgId } from '@/lib/admin/merchant-context'
import { LocationTaxComplianceCard } from '@/components/dashboard/locations/LocationTaxComplianceCard'
import { LocationBankingProfileCard } from '@/components/dashboard/locations/LocationBankingProfileCard'
import { LocationBatchEmailCard } from '@/components/dashboard/locations/LocationBatchEmailCard'
import type { Location } from '@/types/merchant_locations'
import type {
  AccountType,
  LocationBankingProfileSummary,
  PayoutFrequency,
} from '@/app/dashboard/actions/location-banking-profiles'

interface LocationSettingsPageProps {
  params: Promise<{ locationId: string }>
}

export default async function LocationSettingsPage({ params }: LocationSettingsPageProps) {
  const { locationId } = await params
  const { orgId } = await auth()

  // Resolve the impersonation-aware org so the merchant-scoped card actions
  // (banking, batch-out email) target the merchant being viewed. During HQ
  // impersonation auth().orgId is the HQ org, which would fail merchant lookups.
  let effectiveOrgId = orgId ?? ''
  try {
    effectiveOrgId = await getEffectiveClerkOrgId(orgId ?? null)
  } catch {
    // Not impersonating / unresolved — fall back to the session org and let the
    // card actions surface any access error.
  }

  const supabase = createServerSupabaseClient()

  const { data: location, error: locationError } = await supabase
    .from('locations')
    .select('*')
    .eq('id', locationId)
    .single()

  if (locationError || !location) {
    notFound()
  }

  const { data: bankingProfile, error: bankingProfileError } = await supabase
    .from('location_banking_profiles')
    .select(
      `
      id,
      bank_name,
      account_holder_name,
      account_number_last_four,
      routing_number_last_four,
      account_type,
      payout_frequency,
      payout_day_of_week,
      payout_day_of_month,
      minimum_payout_amount,
      is_verified,
      is_active,
      updated_at
    `
    )
    .eq('location_id', locationId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (bankingProfileError && bankingProfileError.code !== '42P01') {
    console.error('[LocationSettingsPage] Banking profile read error:', bankingProfileError)
  }

  const initialProfile: LocationBankingProfileSummary | null = bankingProfile
    ? {
        id: bankingProfile.id as string,
        bank_name: (bankingProfile.bank_name ?? '') as string,
        account_holder_name: (bankingProfile.account_holder_name ?? '') as string,
        account_number_last_four: (bankingProfile.account_number_last_four ?? '') as string,
        routing_number_last_four: (bankingProfile.routing_number_last_four ?? '') as string,
        account_type: (bankingProfile.account_type ?? 'checking') as AccountType,
        payout_frequency: (bankingProfile.payout_frequency ?? 'daily') as PayoutFrequency,
        payout_day_of_week: bankingProfile.payout_day_of_week ?? null,
        payout_day_of_month: bankingProfile.payout_day_of_month ?? null,
        minimum_payout_amount: Number(bankingProfile.minimum_payout_amount ?? 0),
        is_verified: Boolean(bankingProfile.is_verified),
        is_active: Boolean(bankingProfile.is_active),
        updated_at: (bankingProfile.updated_at ?? new Date().toISOString()) as string,
      }
    : null

  return (
    <PageShell width="narrow">
      <PageHeader
        title="Location Tax & Banking"
        subtitle={`${location.name}${location.city ? ` · ${location.city}, ${location.state}` : ''}`}
        backHref="/dashboard/locations"
        backLabel="Back to Locations"
      />

      <LocationTaxComplianceCard location={location as Location} />

      <LocationBankingProfileCard
        clerkOrgId={effectiveOrgId}
        locationId={locationId}
        initialProfile={initialProfile}
      />

      <LocationBatchEmailCard
        clerkOrgId={effectiveOrgId}
        locationId={locationId}
        initialEnabled={Boolean(
          (location as { batch_summary_email_enabled?: boolean | null })
            .batch_summary_email_enabled
        )}
        initialRecipient={
          (location as { batch_summary_email_recipient?: string | null })
            .batch_summary_email_recipient ?? null
        }
        locationEmail={(location as { email?: string | null }).email ?? null}
      />
    </PageShell>
  )
}

