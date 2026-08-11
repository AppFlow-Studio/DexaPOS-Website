'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { CreditCard, Store } from 'lucide-react'
import { useMerchantValorBoardingStatus } from '@/lib/queries/use-admin-valor-boarding'
import { EmptySection } from './EmptySection'
import { SectionHead } from './SectionHead'

function statusVariant(boarded: boolean): 'default' | 'secondary' {
  return boarded ? 'default' : 'secondary'
}

export function ValorBoardingSection({ merchantId }: { merchantId: string }) {
  const { data, isLoading, error: queryError } = useMerchantValorBoardingStatus(merchantId)
  const error = queryError
    ? queryError instanceof Error
      ? queryError.message
      : 'Failed to load Valor boarding status.'
    : null

  return (
    <div>
      <SectionHead
        title="Valor Boarding"
        sub="Boards this merchant on Valor once, then provisions a Valor store + EPI per location for online-order checkout. Boarding runs under the DEXAPOS ISV / Mtech ISO."
      />

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : error ? (
        <EmptySection icon={CreditCard} title="Unable to load Valor boarding" body={error} />
      ) : !data || data.locations.length === 0 ? (
        <EmptySection
          icon={Store}
          title="No merchant locations yet"
          body="Create a location first, then board it on Valor for online-order card payments."
        />
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border bg-card p-4">
            <div className="space-y-1">
              <div className="font-medium">Valor merchant</div>
              <div className="text-xs text-muted-foreground">
                {data.valorMerchantId
                  ? `Boarded — Valor merchant ${data.valorMerchantId}. ${data.boardedCount}/${data.locations.length} location(s) provisioned.`
                  : 'Not boarded yet. Boarding creates one Valor merchant, then a store + EPI per location.'}
              </div>
            </div>
            <Button
              size="sm"
              disabled
              title="Enabled once the Valor boarding service is wired (VALOR_ISO_* login + app-key encryption)."
            >
              {data.valorMerchantId ? 'Provision locations' : 'Board on Valor'}
            </Button>
          </div>

          <div className="space-y-3">
            {data.locations.map((row) => (
              <div key={row.locationId} className="rounded-lg border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="font-medium">{row.locationName}</div>
                    <div className="text-xs text-muted-foreground">
                      {row.boarded
                        ? 'Provisioned on Valor with a store + EPI for online-order checkout.'
                        : 'Not provisioned on Valor yet.'}
                    </div>
                  </div>
                  <Badge variant={statusVariant(row.boarded)}>
                    {row.boarded ? 'Boarded' : 'Not boarded'}
                  </Badge>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-px bg-border lg:grid-cols-4">
                  <Cell label="Valor Merchant" value={row.valorMerchantId ?? '-'} />
                  <Cell label="Store" value={row.valorStoreId ?? '-'} />
                  <Cell label="EPI" value={row.valorEpi ?? '-'} />
                  <Cell label="API Keys" value={row.hasApiKeys ? 'Present' : 'Missing'} />
                </div>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <div className="text-xs text-muted-foreground">
                    {row.boarded
                      ? row.isPrimary
                        ? 'Active · primary online-order rail'
                        : 'Active (not primary)'
                      : 'Awaiting boarding'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
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
