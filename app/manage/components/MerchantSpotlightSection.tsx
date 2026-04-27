'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Building2, ArrowRight, AlertTriangle } from 'lucide-react'
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
    <Card className="border-blue-100/50 bg-white/80 backdrop-blur-sm shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <div className="space-y-0.5">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Building2 className="h-4 w-4 text-blue-600" />
            Merchant Spotlight
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Top merchants by today&apos;s revenue · {total} total
          </p>
        </div>
        <Button asChild variant="ghost" size="sm" className="text-xs">
          <Link href="/manage/merchants">
            View all
            <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Link>
        </Button>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <MerchantSpotlightCardSkeleton key={i} />
            ))}
          </div>
        ) : error || data?.error ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="h-12 w-12 rounded-xl bg-red-50 flex items-center justify-center mb-3">
              <AlertTriangle className="h-6 w-6 text-red-500" />
            </div>
            <p className="text-sm font-medium">Unable to load merchants</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              {data?.error ?? 'An unexpected error occurred. Try refreshing the page.'}
            </p>
          </div>
        ) : merchants.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="h-12 w-12 rounded-xl bg-blue-50 flex items-center justify-center mb-3">
              <Building2 className="h-6 w-6 text-blue-500" />
            </div>
            <p className="text-sm font-medium">No merchants yet</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              Onboard a merchant to see their daily activity here.
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {merchants.map((m) => (
                <MerchantSpotlightCard key={m.id} merchant={m} />
              ))}
            </div>
            {hasMore && (
              <div className="mt-4 pt-4 border-t flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Showing {merchants.length} of {total} merchants
                </p>
                <Button asChild variant="outline" size="sm">
                  <Link href="/manage/merchants">
                    Browse all merchants
                    <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                  </Link>
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
