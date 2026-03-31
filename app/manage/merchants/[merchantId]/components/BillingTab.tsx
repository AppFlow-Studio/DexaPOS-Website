'use client'

import { MerchantBillingSetupCard } from '@/components/billing/MerchantBillingSetupCard'

interface BillingTabProps {
    merchantId: string
    merchantName: string
    canEdit: boolean
}

export function BillingTab({ merchantId, merchantName, canEdit }: BillingTabProps) {
    return (
        <MerchantBillingSetupCard
            merchantId={merchantId}
            merchantName={merchantName}
            context="admin"
            canEdit={canEdit}
        />
    )
}
