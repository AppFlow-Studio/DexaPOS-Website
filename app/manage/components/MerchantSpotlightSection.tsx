'use client'

import Link from 'next/link'
import { Building2, ArrowRight } from 'lucide-react'

import { Panel } from '@/components/dashboard/shell/Panel'
import { PanelSection } from '@/components/dashboard/shell/PanelSection'
import { Button } from '@/components/ui/button'
import { useMerchantSpotlight } from '../hooks/useMerchantSpotlight'
import {
  MerchantSpotlightCard,
  MerchantSpotlightCardSkeleton,
} from './MerchantSpotlightCard'

const SPOTLIGHT_LIMIT = 10

export function MerchantSpotlightSection() {
  const { data, isLoading, error } = useMerchantSpotlight(SPOTLIGHT_LIMIT)

  const merchants = data?.data ?? []
  const total = data?.total ?? 0
  const hasMore = total > merchants.length

  return (
    <Panel>
      <PanelSection
        icon={Building2}
        label="Merchant Spotlight"
        caption={`Top merchants by today's revenue · ${total} total`}
        action={
          <Button asChild variant="ghost" size="sm" className="rounded-full">
            <Link href="/manage/merchants">
              View all
              <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        }
      >
        {isLoading ? (
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <MerchantSpotlightCardSkeleton key={i} />
            ))}
          </div>
        ) : error || data?.error ? (
          // Text-led rather than a tinted icon plate: a failed fetch is a
          // message, not an alarm state that needs its own coloured surface.
          <div className="py-10 text-center">
            <p className="text-sm font-medium">Unable to load merchants</p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
              {data?.error ?? 'An unexpected error occurred. Try refreshing the page.'}
            </p>
          </div>
        ) : merchants.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm font-medium">No merchants yet</p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
              Onboard a merchant to see their daily activity here.
            </p>
          </div>
        ) : (
          <>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {merchants.map((m) => (
                <MerchantSpotlightCard key={m.id} merchant={m} />
              ))}
            </div>
            {hasMore && (
              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">
                  Showing {merchants.length} of {total} merchants
                </p>
                <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
                  <Link href="/manage/merchants">
                    Browse all merchants
                    <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            )}
          </>
        )}
      </PanelSection>
    </Panel>
  )
}
