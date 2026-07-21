'use client'

import { useUserInfo } from '@/app/manage/hooks/useUserInfo.'
import { CreateLocationWizard } from '@/components/dashboard/locations/CreateLocationWizard'
import { AddLocationUpsellGate } from '@/components/dashboard/locations/AddLocationUpsellGate'
import { useLocationGateStatus } from '@/app/dashboard/hooks/useLocationGateStatus'
import { Skeleton } from '@/components/ui/skeleton'

export default function NewLocationPage() {
    const { data: userInfo, isLoading } = useUserInfo()
    const clerkOrgId = userInfo?.members?.[0]?.organizations?.id
    const actorUserId = userInfo?.id

    // Add Location is the single chokepoint for the multi-location paywall: a
    // tier without location headroom (Basic, or no tier row => Basic) sees the
    // upsell gate here instead of the creation wizard.
    const { data: gate, isLoading: gateLoading } = useLocationGateStatus(clerkOrgId || '')

    if (isLoading || (clerkOrgId && gateLoading)) {
        return (
            <div className="min-h-screen flex">
                <div className="w-72 border-r bg-muted/30 p-6">
                    <Skeleton className="h-12 w-24 mb-8" />
                    <div className="space-y-2">
                        {[1, 2, 3, 4, 5].map(i => (
                            <Skeleton key={i} className="h-10 w-full" />
                        ))}
                    </div>
                </div>
                <div className="flex-1 p-8">
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

    if (!clerkOrgId) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <p className="text-muted-foreground">Unable to load organization information.</p>
            </div>
        )
    }

    if (gate && !gate.canAddLocation) {
        return (
            <AddLocationUpsellGate
                resolvedTier={gate.resolvedTier}
                upgradeTarget={gate.upgradeTarget}
            />
        )
    }

    return <CreateLocationWizard clerkOrgId={clerkOrgId} actorUserId={actorUserId} />
}

