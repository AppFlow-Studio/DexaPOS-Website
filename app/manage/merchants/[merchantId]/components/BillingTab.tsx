'use client'

import { MerchantBillingSetupCard } from '@/components/billing/MerchantBillingSetupCard'

interface BillingTabProps {
    merchantId: string
    merchantName: string
    canEdit: boolean
    locations: Array<{ id: string; name: string }>
}

export function BillingTab({ merchantId, merchantName, canEdit, locations }: BillingTabProps) {
    return (
        <MerchantBillingSetupCard
            merchantId={merchantId}
            merchantName={merchantName}
            context="admin"
            canEdit={canEdit}
            locations={locations}
        />
    )
}
