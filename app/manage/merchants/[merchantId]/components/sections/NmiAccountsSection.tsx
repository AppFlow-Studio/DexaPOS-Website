'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { CreditCard, Store } from 'lucide-react'
import {
  getMerchantNmiAccountsSummary,
} from '@/app/manage/actions/admin-merchant/nmi'
import { EmptySection } from './EmptySection'
import { SectionHead } from './SectionHead'

function statusVariant(ready: boolean): 'default' | 'secondary' | 'destructive' {
  return ready ? 'default' : 'secondary'
}

export function NmiAccountsSection({ merchantId }: { merchantId: string }) {
  const [isLoading, setIsLoading] = useState(true)
  const [data, setData] = useState<{ locations: Awaited<ReturnType<typeof getMerchantNmiAccountsSummary>>['locations'] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        const result = await getMerchantNmiAccountsSummary(merchantId)
        if (!cancelled) {
          setData(result)
          setError(null)
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || 'Failed to load NMI accounts.')
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [merchantId])

  return (
    <div>
      <SectionHead
        title="NMI Accounts"
        sub="Shows which merchant locations already have their own saved billing card in the Dexa Billing NMI vault and are eligible for subscription charging."
      />

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : error ? (
        <EmptySection icon={CreditCard} title="Unable to load NMI accounts" body={error} />
      ) : !data || data.locations.length === 0 ? (
        <EmptySection
          icon={Store}
          title="No merchant locations yet"
          body="Create a location first, then add its billing card when that location is ready for subscription billing."
        />
      ) : (
        <div className="space-y-3">
          {data.locations.map((row) => (
            <div key={row.locationId} className="rounded-lg border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="font-medium">{row.locationName}</div>
                  <div className="text-xs text-muted-foreground">
                    {row.vaultReady
                      ? 'Location has a saved billing card in vault and can be used for subscription charging.'
                      : 'No location-specific billing card is saved for subscriptions yet.'}
                  </div>
                </div>
                <Badge variant={statusVariant(row.vaultReady)}>
                  {row.vaultReady ? 'Eligible' : 'Setup needed'}
                </Badge>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-px bg-border lg:grid-cols-4">
                <Cell label="Billing Profile" value={row.billingProfileId ? 'Present' : 'Missing'} />
                <Cell label="Method" value={row.billingMethod ? row.billingMethod.toUpperCase() : '-'} />
                <Cell
                  label="Saved Card"
                  value={row.cardLastFour ? `${row.cardBrand || 'Card'} ****${row.cardLastFour}` : '-'}
                />
                <Cell label="Vault Status" value={row.vaultReady ? 'Ready' : 'Not vaulted'} />
              </div>

              <div className="mt-4 flex items-center justify-between gap-3">
                <div className="text-xs text-muted-foreground">
                  {row.isVerified ? 'Verified billing profile' : 'Not verified yet'}
                </div>
                <Button asChild size="sm">
                  <Link href={`/manage/merchants/${merchantId}?tab=billing&billingScope=${row.locationId}`}>
                    {row.vaultReady ? 'Update Card' : 'Setup'}
                  </Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card px-4 py-3">
      <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 inline-flex items-center gap-1.5 text-[12.5px] text-foreground">
        {value}
      </div>
    </div>
  )
}
