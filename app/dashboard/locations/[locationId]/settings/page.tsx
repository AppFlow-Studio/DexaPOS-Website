import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Landmark, ShieldCheck } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { LocationTaxComplianceCard } from '@/components/dashboard/locations/LocationTaxComplianceCard'
import type { Location } from '@/types/merchant_locations'

interface LocationSettingsPageProps {
  params: Promise<{ locationId: string }>
}

interface LocationBankingProfileSummary {
  bank_name: string | null
  account_holder_name: string | null
  account_number_last_four: string | null
  routing_number_last_four: string | null
  account_type: string | null
  payout_frequency: string | null
  payout_day_of_week: number | null
  payout_day_of_month: number | null
  minimum_payout_amount: number | null
  is_verified: boolean | null
  updated_at: string | null
}

export default async function LocationSettingsPage({ params }: LocationSettingsPageProps) {
  const { locationId } = await params
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

  const profile = (bankingProfile || null) as LocationBankingProfileSummary | null

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

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Landmark className="h-4 w-4" />
            Banking & Payouts
          </CardTitle>
          <CardDescription>
            Read-only visibility for payout profile. Edit actions remain paused pending banking approval.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Badge variant="outline">[BANK-RELATED: HOLD]</Badge>
            <p className="text-sm text-muted-foreground">
              Banking edits are intentionally disabled in this phase.
            </p>
          </div>

          {profile ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Bank</p>
                <p className="font-medium">{profile.bank_name || 'Not set'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Account Holder</p>
                <p className="font-medium">{profile.account_holder_name || 'Not set'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Account</p>
                <p className="font-medium">
                  {profile.account_type || 'account'}{' '}
                  {profile.account_number_last_four ? `****${profile.account_number_last_four}` : 'Not set'}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Routing</p>
                <p className="font-medium">
                  {profile.routing_number_last_four ? `****${profile.routing_number_last_four}` : 'Not set'}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Payout Frequency</p>
                <p className="font-medium">{profile.payout_frequency || 'Not set'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Verification</p>
                <p className="font-medium inline-flex items-center gap-1">
                  <ShieldCheck className="h-4 w-4" />
                  {profile.is_verified ? 'Verified' : 'Pending'}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No active location banking profile found.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

