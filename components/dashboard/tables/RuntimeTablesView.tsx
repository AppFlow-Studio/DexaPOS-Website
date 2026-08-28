'use client'

import * as React from 'react'
import {
  useFloorPlans,
  useFloorPlanStatus,
  useWaitlist,
  useReservations
} from '@/app/dashboard/hooks/useFloorPlan'
import { GetLocation } from '@/app/dashboard/actions/locations'
import { Location } from '@/types/merchant_locations'
import { TablesTopBar } from './TablesTopBar'
import { TablesSidebar } from './TablesSidebar'
import { RuntimeFloorPlanView } from './RuntimeFloorPlanView'
import { FloorPlanCanvasView } from './FloorPlanCanvasView'
import { EmptyFloorPlanView } from './EmptyFloorPlanView'
import { CreateFloorPlanDialog } from './CreateFloorPlanDialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useUserInfo } from '@/app/manage/hooks/useUserInfo.'
import { Button } from '@/components/ui/button'
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface RuntimeTablesViewProps {
  locationId: string
  onBack?: () => void
}

export function RuntimeTablesView ({
  locationId,
  onBack
}: RuntimeTablesViewProps) {
  const [isDesignMode, setIsDesignMode] = React.useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState('')
  const [selectedTableId, setSelectedTableId] = React.useState<
    string | undefined
  >()
  const [location, setLocation] = React.useState<Location | null>(null)
  const [activeFloorPlanId, setActiveFloorPlanId] = React.useState<
    string | null
  >(null)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = React.useState(false)

  const { data: userInfo } = useUserInfo()
  const {
    data: floorPlans,
    isLoading: isLoadingFloorPlans,
    error: floorPlansError
  } = useFloorPlans(locationId)
  // IMPORTANT: This hook fetches the tables WITH sessions (runtime status)
  // This will automatically refetch when activeFloorPlanId changes
  const {
    data: floorPlanStatus,
    isLoading: isLoadingStatus,
    refetch: refetchFloorPlanStatus
  } = useFloorPlanStatus(activeFloorPlanId)

  const {
    data: waitlistInfo,
    isLoading: isLoadingWaitlistInfo,
    refetch: refetchWaitlist
  } = useWaitlist(locationId)
  const { data: reservations = [] } = useReservations(locationId)

  // Track previous location to detect changes
  const prevLocationIdRef = React.useRef<string | null>(null)

  // Load location details
  React.useEffect(() => {
    if (locationId) {
      GetLocation(locationId).then(setLocation)
    }
  }, [locationId])

  // Reset active floor plan when location changes
  React.useEffect(() => {
    if (
      locationId !== prevLocationIdRef.current &&
      prevLocationIdRef.current !== null
    ) {
      // Location changed - reset active floor plan and selected table
      setActiveFloorPlanId(null)
      setSelectedTableId(undefined)
    }
    prevLocationIdRef.current = locationId
  }, [locationId])

  // Set active floor plan to first created one (or default) when floor plans load
  React.useEffect(() => {
    if (floorPlans && floorPlans.length > 0) {
      // If we don't have an active floor plan, or location changed, set a new one
      if (!activeFloorPlanId) {
        // Sort by display_order (first created typically has lowest display_order)
        // Priority: is_default > display_order (lower = created first)
        const sortedPlans = [...floorPlans].sort((a, b) => {
          // First priority: is_default
          if (a.is_default && !b.is_default) return -1
          if (!a.is_default && b.is_default) return 1
          // Second priority: display_order (lower = created first)
          return (a.display_order || 0) - (b.display_order || 0)
        })

        const defaultFloorPlan = sortedPlans[0]
        if (defaultFloorPlan) {
          setActiveFloorPlanId(defaultFloorPlan.id)
        }
      }
    }
  }, [floorPlans, activeFloorPlanId])

  const activeFloorPlan =
    floorPlans?.find(fp => fp.id === activeFloorPlanId) || null

  // Get all floor plan objects (including walls, plants, etc)
  // For seating display, we also need to merge in session data from floorPlanStatus
  const baseObjects = activeFloorPlan?.objects || []
  const tablesSessions = floorPlanStatus?.tables || []

  // Merge session data into the objects
  const tables = baseObjects.map(obj => {
    // Find matching session data if this is a table
    const session = tablesSessions.find(t => t.id === obj.id)?.session
    return {
      ...obj,
      session: session || null
    }
  })

  const handleEditLayout = () => {
    setIsDesignMode(true)
  }

  const handleBackFromDesign = () => {
    setIsDesignMode(false)
  }

  const handleFloorPlanChange = (floorPlanId: string) => {
    setActiveFloorPlanId(floorPlanId)
  }

  const handleCreateFloorPlanSuccess = (floorPlanId: string) => {
    // Set the newly created floor plan as active
    setActiveFloorPlanId(floorPlanId)
    // Automatically switch to design mode
    setIsDesignMode(true)
  }

  // 1. SWITCH TO EDIT MODE
  if (isDesignMode) {
    return (
      <FloorPlanCanvasView
        locationId={locationId}
        initialFloorPlanId={activeFloorPlanId}
        onBack={handleBackFromDesign}
        refetchFloorPlanStatus={refetchFloorPlanStatus}
      />
    )
  }

  if (isLoadingFloorPlans || isLoadingStatus) {
    return (
      <div className='flex h-screen'>
        <div className='w-80 border-r p-4 space-y-4'>
          <Skeleton className='h-8 w-full' />
          <Skeleton className='h-32 w-full' />
        </div>
        <div className='flex-1 p-4'>
          <Skeleton className='h-full w-full' />
        </div>
      </div>
    )
  }

  if (floorPlansError) {
    return (
      <div className='tables-pill-controls flex h-screen max-h-[90vh] flex-col overflow-hidden rounded-3xl border bg-card'>
        {onBack && (
          <div className='flex items-center gap-3 border-b border-border/60 p-4'>
            <Button
              variant='ghost'
              size='sm'
              onClick={onBack}
              className='-ml-2 h-8 gap-1.5 rounded-full text-muted-foreground'
            >
              <ArrowLeft className='h-4 w-4' />
              Back
            </Button>
            {location && (
              <span className='text-sm font-semibold text-foreground'>
                {location.name}
              </span>
            )}
          </div>
        )}

        <div className='p-6'>
          <Alert variant='destructive'>
            <AlertDescription>
              Problem fetching floor plans. Please refresh and try again.
            </AlertDescription>
          </Alert>
        </div>
      </div>
    )
  }

  // 2. EMPTY STATE - No floor plans exist
  if (!floorPlans || floorPlans.length === 0) {
    return (
      <>
        <div className='tables-pill-controls flex h-screen max-h-[90vh] flex-col overflow-hidden rounded-3xl border bg-card'>
          {onBack && (
            <div className='flex items-center gap-3 border-b border-border/60 p-4'>
              <Button
                variant='ghost'
                size='sm'
                onClick={onBack}
                className='-ml-2 h-8 gap-1.5 rounded-full text-muted-foreground'
              >
                <ArrowLeft className='h-4 w-4' />
                Back
              </Button>
              {location && (
                <span className='text-sm font-semibold text-foreground'>
                  {location.name}
                </span>
              )}
            </div>
          )}
          <EmptyFloorPlanView
            locationName={location?.name}
            onCreateFloorPlan={() => setIsCreateDialogOpen(true)}
          />
        </div>
        <CreateFloorPlanDialog
          open={isCreateDialogOpen}
          onOpenChange={setIsCreateDialogOpen}
          locationId={locationId}
          onSuccess={handleCreateFloorPlanSuccess}
        />
      </>
    )
  }

  // 3. RUNTIME VIEW MODE
  return (
    <>
      <div className='tables-pill-controls flex h-screen max-h-[90vh] flex-col overflow-hidden rounded-3xl border bg-card'>
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
        <div className='flex overflow-hidden relative h-full '>
          <div
            className={cn(
              'shrink-0 overflow-hidden transition-[width] duration-200 ease-out',
              isSidebarCollapsed ? 'w-0' : 'w-full sm:w-80'
            )}
          >
            {!isSidebarCollapsed && (
              <TablesSidebar
                locationId={locationId}
                tables={tables}
                waitlistInfo={waitlistInfo || undefined}
                reservations={reservations || []}
                searchQuery={searchQuery}
                selectedTableId={selectedTableId}
                onTableClick={setSelectedTableId}
              />
            )}
          </div>

          <div className='relative w-0 shrink-0'>
            <Button
              type='button'
              variant='outline'
              size='icon'
              onClick={() => setIsSidebarCollapsed(prev => !prev)}
              className='absolute left-0 top-1/2 z-50 h-8 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border bg-background/95 shadow-sm'
              title={isSidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
              aria-label={isSidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
            >
              {isSidebarCollapsed ? (
                <ChevronRight className='h-3.5 w-3.5' />
              ) : (
                <ChevronLeft className='h-3.5 w-3.5' />
              )}
            </Button>
          </div>

          {/* PASS DATA ONLY. 
                       We don't need drag handlers here because isDesignMode is false.
                       Key prop ensures smooth remount when location/floor plan changes
                    */}
          <div
            className='relative flex-1 transition-opacity duration-300 ease-in-out'
            key={`${locationId}-${activeFloorPlanId}`}
          >
            <RuntimeFloorPlanView
              floorPlan={activeFloorPlan}
              tables={tables}
              selectedTableId={selectedTableId}
              isDesignMode={false} // <--- Explicitly disable editing
              onTableClick={setSelectedTableId}
              onClearSelection={() => setSelectedTableId(undefined)}
            />
          </div>
        </div>
      </div>
      <CreateFloorPlanDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        locationId={locationId}
        onSuccess={handleCreateFloorPlanSuccess}
      />
    </>
  )
}
