'use client'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { SubscriptionBillingAdminCard } from '@/components/billing/SubscriptionBillingAdminCard'
import { ShieldAlert } from 'lucide-react'

interface SubscriptionTabProps {
  merchantId: string
  merchantName: string
  canManageBilling: boolean
  locations: Array<{ id: string; name: string }>
}

export function SubscriptionTab({
  merchantId,
  merchantName,
  canManageBilling,
  locations,
}: SubscriptionTabProps) {
  if (!canManageBilling) {
    return (
      <Alert>
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Billing Management Restricted</AlertTitle>
        <AlertDescription>
          Subscription billing management requires the `system.billing.manage` HQ permission.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <SubscriptionBillingAdminCard
      merchantId={merchantId}
      merchantName={merchantName}
      locations={locations}
      canManageBilling
    />
  )
}
