'use client'

import { useParams } from 'next/navigation'
import { useAdminMerchantDetails } from '@/lib/queries/use-admin-merchant'
import { AdminCreateLocationWizard } from '@/components/admin/locations/AdminCreateLocationWizard'
import { Skeleton } from '@/components/ui/skeleton'

export default function AdminNewLocationPage() {
    const { merchantId } = useParams()
    const { data: merchantDetails, isLoading } = useAdminMerchantDetails(merchantId as string)

    if (isLoading) {
        return (
            <div className="min-h-screen flex">
                <div className="w-72 border-r bg-muted/30 p-6">
                    <Skeleton className="h-12 w-24 mb-8" />
                    <div className="space-y-2">
                        {[1, 2, 3, 4, 5, 6, 7].map(i => (
                            <Skeleton key={i} className="h-10 w-full" />
                        ))}
                    </div>
                </div>
                <div className="flex-1 p-8">
                    <Skeleton className="h-4 w-48 mb-2" />
                    <Skeleton className="h-8 w-64 mb-2" />
                    <Skeleton className="h-4 w-96 mb-8" />
                    <div className="space-y-4 max-w-2xl">
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-2/3" />
                    </div>
                </div>
            </div>
        )
    }

    if (!merchantDetails) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <p className="text-muted-foreground">Merchant not found.</p>
            </div>
        )
    }

    return (
        <AdminCreateLocationWizard
            merchantId={merchantId as string}
            merchantName={merchantDetails.name}
        />
    )
}
