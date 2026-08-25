'use client'

import * as React from 'react'
import { useLocationStore, useGatedLocationId } from '@/stores/location-store'
import { LocationListView } from '@/components/dashboard/tables/LocationListView'
import { RuntimeTablesView } from '@/components/dashboard/tables/RuntimeTablesView'
import { PageHeader, PageShell } from '@/components/dashboard/shell'

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

    return <RuntimeTablesView locationId={effectiveLocationId} onBack={handleBack} />
}
