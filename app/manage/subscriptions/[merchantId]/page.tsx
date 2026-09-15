'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DataPageSkeleton } from '@/components/dashboard/loading/DataPageSkeleton'
import { HqSubscriptionsWorkspace } from '@/components/billing/HqSubscriptionsWorkspace'
import { useAdminMerchantDetails } from '@/lib/queries/use-admin-merchant'
import { useAdminPermissions } from '@/lib/hooks/useAdminPermissions'

export default function ManageMerchantSubscriptionsPage() {
  const { merchantId } = useParams()
  const { data: merchantDetails, isLoading, isError } = useAdminMerchantDetails(merchantId as string)
  const { hasPermission } = useAdminPermissions()

  if (isLoading) {
    return (
      <DataPageSkeleton
        variant="detail"
        shell="plain"
        label="Loading the subscription workspace"
      />
    )
  }

  if (isError || !merchantDetails) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertTriangle className="mb-2 h-8 w-8 text-destructive" />
        <div className="mb-1 font-semibold text-destructive">Unable to load subscription workspace</div>
        <Button variant="outline" asChild className="mt-4">
          <Link href="/manage/subscriptions">Back to Subscriptions</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
        <Link href="/manage/subscriptions" className="hover:underline">
          Subscriptions
        </Link>
        <span>/</span>
        <span className="text-foreground">{merchantDetails.name}</span>
      </div>

      <HqSubscriptionsWorkspace
        merchant={merchantDetails}
        canManageBilling={hasPermission('system.billing.manage')}
      />
    </div>
  )
}
