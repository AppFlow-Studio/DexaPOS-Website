'use client'

import * as React from 'react'
import { useLocationStore } from '@/stores/location-store'
import { LocationListView } from '@/components/dashboard/tables/LocationListView'
import { RuntimeTablesView } from '@/components/dashboard/tables/RuntimeTablesView'

export default function TablesPage() {
    const { selectedLocationId, setSelectedLocation } = useLocationStore()
    const [tablesLocationId, setTablesLocationId] = React.useState<string | null>(null)

    // Use a separate state for tables page location to allow "back" functionality
    const effectiveLocationId = tablesLocationId || (selectedLocationId !== 'all' ? selectedLocationId : null)

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
            <div className="container mx-auto py-6">
                <LocationListView onLocationSelect={handleLocationSelect} />
            </div>
        )
    }

    return <RuntimeTablesView locationId={effectiveLocationId} onBack={handleBack} />
}
