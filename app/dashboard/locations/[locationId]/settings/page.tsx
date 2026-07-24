import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { auth } from '@clerk/nextjs/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
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
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Location Tax & Banking</h1>
          <p className="text-muted-foreground">
            {location.name} {location.city ? `- ${location.city}, ${location.state}` : ''}
          </p>
        </div>
        <Link
          href="/dashboard/locations"
          className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Locations
        </Link>
      </div>

      <LocationTaxComplianceCard location={location as Location} />

      <LocationBankingProfileCard
        clerkOrgId={orgId ?? ''}
        locationId={locationId}
        initialProfile={initialProfile}
      />

      <LocationBatchEmailCard
        clerkOrgId={orgId ?? ''}
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
    </div>
  )
}

