'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import { Search } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { MerchantCard } from '@/components/admin/MerchantCard'
import { useDebounce } from '@/lib/hooks/useDebounce'
import { useMerchants } from '@/lib/queries/use-merchants'
import { useAdminAuth } from '@/lib/hooks/useAdminAuth'
import { useAdminMerchantAccess } from '@/app/manage/hooks/useAdminMerchantAccess'
import type { MerchantFilters } from '@/types/merchant'
import { DEFAULT_MERCHANT_FILTERS } from '@/types/merchant'

export default function ManageSubscriptionsIndexPage() {
  const router = useRouter()
  const { userId } = useAuth()
  const { role, isLoading: authLoading } = useAdminAuth()
  const [filters, setFilters] = useState<MerchantFilters>({
    ...DEFAULT_MERCHANT_FILTERS,
    sortBy: 'name',
    sortOrder: 'asc',
  })

  const isManagerScoped = !!role?.role_code && role.role_code !== 'hq.super_admin'
  const scopedAdminUserId = isManagerScoped ? (userId || '') : ''
  const { data: merchantAccess, isLoading: accessLoading } = useAdminMerchantAccess(scopedAdminUserId)

  const debouncedSearch = useDebounce(filters.search, 300)
  const activeFilters = { ...filters, search: debouncedSearch }
  const accessibleMerchantIds =
    isManagerScoped ? merchantAccess?.map((access) => access.merchantId) : undefined

  const { data, isLoading } = useMerchants(activeFilters, 1, accessibleMerchantIds)

  const merchants = data?.merchants || []
  const loading = isLoading || authLoading || (isManagerScoped && accessLoading)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Subscriptions</h1>
        <p className="text-muted-foreground">
          Open a merchant subscription workspace to manage location services, invoices, and subscription charges.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Merchant Access</CardTitle>
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search merchants..."
              value={filters.search}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  search: event.target.value,
                }))
              }
              className="pl-10"
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="space-y-3 rounded-xl border p-5">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-24" />
                  <div className="grid grid-cols-2 gap-3">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : merchants.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              No merchants found for this subscription view.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {merchants.map((merchant) => (
                <MerchantCard
                  key={merchant.id}
                  merchant={merchant}
                  onClick={() => router.push(`/manage/subscriptions/${merchant.clerk_org_id}`)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
