'use client'

import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { useLocationStore, useGatedLocationId } from '@/stores/location-store'
import { useClerkOrgId } from '@/app/dashboard/hooks/useLocationScoped'
import { useFloorPlans } from '@/app/dashboard/hooks/useFloorPlan'
import { LocationListView } from '@/components/dashboard/tables/LocationListView'
import { RuntimeTablesView } from '@/components/dashboard/tables/RuntimeTablesView'
import { FeaturePaywall } from '@/components/billing/FeaturePaywall'
import { PageHeader, PageShell } from '@/components/dashboard/shell'

/**
 * Gates the Tables feature behind the Fine Dining add-on. Locations that already
 * have floor plans are grandfathered (never paywalled). Waits for the floor-plan
 * query to settle before deciding so the paywall never flashes for existing users.
 */
function TablesGate({ locationId, onBack }: { locationId: string; onBack: () => void }) {
    const clerkOrgId = useClerkOrgId()
    const { data: floorPlans, isLoading } = useFloorPlans(locationId)

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Loading tables…
            </div>
        )
    }

    return (
        <FeaturePaywall
            serviceCode="fine_dining"
            locationId={locationId}
            clerkOrgId={clerkOrgId}
            title="Fine Dining"
            description="Floor plans, table management, waitlist, and reservations for full-service dining."
            grandfathered={(floorPlans?.length ?? 0) > 0}
        >
            <RuntimeTablesView locationId={locationId} onBack={onBack} />
        </FeaturePaywall>
    )
}

export default function TablesPage() {
    const { selectedLocationId, setSelectedLocation } = useLocationStore()
    const gatedLocationId = useGatedLocationId()
    const [tablesLocationId, setTablesLocationId] = React.useState<string | null>(null)

    // Use a separate state for tables page location to allow "back" functionality.
    // Falls back to the gated location so single-location accounts (locked to 'all')
    // skip the picker and land straight on their one location's tables.
    const effectiveLocationId = tablesLocationId || (selectedLocationId !== 'all' ? selectedLocationId : null) || gatedLocationId

    const handleLocationSelect = (locationId: string) => {
        setTablesLocationId(locationId)
        setSelectedLocation(locationId)
    }

    const handleBack = () => {
        setTablesLocationId(null)
        // Optionally reset to 'all' or keep the selected location
        // setSelectedLocation('all')
    }

    if (!effectiveLocationId) {
        return (
            <PageShell>
                <PageHeader
                    title="Tables"
                    subtitle="Manage floor plans and table layouts for your locations"
                />
                <LocationListView onLocationSelect={handleLocationSelect} />
            </PageShell>
        )
    }

    return <TablesGate locationId={effectiveLocationId} onBack={handleBack} />
}
