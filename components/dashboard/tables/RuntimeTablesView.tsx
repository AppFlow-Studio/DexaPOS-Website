'use client'

import * as React from 'react'
import { useFloorPlans, useFloorPlanStatus, useWaitlist, useReservations } from '@/app/dashboard/hooks/useFloorPlan'
import { GetLocation } from '@/app/dashboard/actions/locations'
import { Location } from '@/types/merchant_locations'
import { TablesTopBar } from './TablesTopBar'
import { TablesSidebar } from './TablesSidebar'
import { RuntimeFloorPlanView } from './RuntimeFloorPlanView'
import { FloorPlanCanvasView } from './FloorPlanCanvasView'
import { Skeleton } from '@/components/ui/skeleton'
import { useUserInfo } from '@/app/manage/hooks/useUserInfo.'

interface RuntimeTablesViewProps {
    locationId: string
    onBack?: () => void
}

export function RuntimeTablesView({ locationId, onBack }: RuntimeTablesViewProps) {
    const [isDesignMode, setIsDesignMode] = React.useState(false)
    const [searchQuery, setSearchQuery] = React.useState('')
    const [selectedTableId, setSelectedTableId] = React.useState<string | undefined>()
    const [location, setLocation] = React.useState<Location | null>(null)
    const [activeFloorPlanId, setActiveFloorPlanId] = React.useState<string | null>(null)

    const { data: userInfo } = useUserInfo()
    const { data: floorPlans, isLoading: isLoadingFloorPlans } = useFloorPlans(locationId)
    // IMPORTANT: This hook fetches the tables WITH sessions (runtime status)
    const { data: floorPlanStatus, isLoading: isLoadingStatus, refetch: refetchFloorPlanStatus } = useFloorPlanStatus(activeFloorPlanId)

    const { data: waitlistInfo, isLoading: isLoadingWaitlistInfo, refetch: refetchWaitlist } = useWaitlist(locationId)
    const { data: reservations = [] } = useReservations(locationId)

    // Load location details
    React.useEffect(() => {
        if (locationId) {
            GetLocation(locationId).then(setLocation)
        }
    }, [locationId])

    // Set active floor plan to default or first one
    React.useEffect(() => {
        if (floorPlans && floorPlans.length > 0 && !activeFloorPlanId) {
            const defaultFloorPlan = floorPlans.find((fp) => fp.is_default) || floorPlans[0]
            setActiveFloorPlanId(defaultFloorPlan.id)
        }
    }, [floorPlans, activeFloorPlanId])

    const activeFloorPlan = floorPlans?.find((fp) => fp.id === activeFloorPlanId) || null

    // These tables contain the 'session' data needed for status colors
    const tables = floorPlanStatus?.tables || []

    const handleEditLayout = () => {
        setIsDesignMode(true)
    }

    const handleBackFromDesign = () => {
        setIsDesignMode(false)
    }

    const handleFloorPlanChange = (floorPlanId: string) => {
        setActiveFloorPlanId(floorPlanId)
    }

    // 1. SWITCH TO EDIT MODE
    if (isDesignMode) {
        return <FloorPlanCanvasView locationId={locationId} onBack={handleBackFromDesign} refetchFloorPlanStatus={refetchFloorPlanStatus} />
    }

    if (isLoadingFloorPlans || isLoadingStatus) {
        return (
            <div className="flex h-screen">
                <div className="w-80 border-r p-4 space-y-4">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-32 w-full" />
                </div>
                <div className="flex-1 p-4">
                    <Skeleton className="h-full w-full" />
                </div>
            </div>
        )
    }

    // 2. RUNTIME VIEW MODE
    return (
        <div className="flex flex-col h-screen max-h-[90vh] rounded-lg shadow-xl  overflow-hidden bg-background">
            <TablesTopBar
                location={location}
                floorPlans={floorPlans}
                activeFloorPlanId={activeFloorPlanId}
                onFloorPlanChange={handleFloorPlanChange}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                onBack={onBack}
                onEditLayout={handleEditLayout}
            />
            <div className="flex overflow-hidden relative h-full ">
                <TablesSidebar
                    locationId={locationId}
                    tables={tables}
                    waitlistInfo={waitlistInfo || undefined}
                    reservations={reservations || []}
                    searchQuery={searchQuery}
                    selectedTableId={selectedTableId}
                    onTableClick={setSelectedTableId}
                />

                {/* PASS DATA ONLY. 
                   We don't need drag handlers here because isDesignMode is false.
                */}
                <RuntimeFloorPlanView
                    floorPlan={activeFloorPlan}
                    tables={tables}
                    selectedTableId={selectedTableId}
                    isDesignMode={false} // <--- Explicitly disable editing
                    onTableClick={setSelectedTableId}
                />
            </div>
        </div>
    )
}