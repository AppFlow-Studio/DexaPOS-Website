'use client'

import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  Banknote,
  DoorClosed,
  DoorOpen,
  Info,
  Loader2,
  MapPin,
  Plus,
} from 'lucide-react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Empty } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import {
  LocationIndicator,
  PageHeader,
  PageShell,
  Panel,
  StatRow,
  StatTile,
} from '@/components/dashboard/shell'
import { useUserInfo } from '@/app/manage/hooks/useUserInfo.'
import {
  useCashDrawers,
  useUpdateCashDrawer,
  type CashDrawerListItem,
} from '@/lib/queries/use-cash-drawers'
import { useGatedLocation, useGatedLocationId } from '@/stores/location-store'

import { CashDrawerCard } from './components/CashDrawerCard'
import { CashDrawerFormDialog } from './components/CashDrawerFormDialog'
import { CloseSessionDialog } from './components/CloseSessionDialog'
import { OpenSessionDialog } from './components/OpenSessionDialog'

export default function CashDrawersPage() {
  // Single-location accounts resolve their hidden "all" state to the only store.
  const gatedLocationId = useGatedLocationId()
  const selectedLocationId = gatedLocationId ?? 'all'
  const isAllLocations = !gatedLocationId
  const selectedLocation = useGatedLocation()
  const { data: userInfo } = useUserInfo()
  const clerkOrgId: string | undefined = userInfo?.members?.[0]?.organizations?.id

  const {
    data: drawers = [],
    isLoading,
    isError,
    error,
  } = useCashDrawers(clerkOrgId, selectedLocationId)
  const updateMutation = useUpdateCashDrawer()

  const [formOpen, setFormOpen] = useState(false)
  const [editingDrawer, setEditingDrawer] = useState<CashDrawerListItem | null>(null)
  const [deactivateTarget, setDeactivateTarget] = useState<CashDrawerListItem | null>(null)
  const [openSessionTarget, setOpenSessionTarget] = useState<CashDrawerListItem | null>(null)
  const [closeSessionTarget, setCloseSessionTarget] = useState<CashDrawerListItem | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => setMounted(true))
    return () => window.cancelAnimationFrame(frameId)
  }, [])

  const handleEdit = (drawer: CashDrawerListItem) => {
    setEditingDrawer(drawer)
    setFormOpen(true)
  }

  const handleAdd = () => {
    setEditingDrawer(null)
    setFormOpen(true)
  }

  const handleDeactivateConfirm = async () => {
    if (!deactivateTarget || !clerkOrgId) return

    const result = await updateMutation.mutateAsync({
      clerkOrgId,
      drawerId: deactivateTarget.id,
      input: { is_active: false },
    })

    if (result.success) setDeactivateTarget(null)
  }

  if (!mounted) return <PageSkeleton />

  if (isAllLocations) {
    return (
      <PageShell>
        <PageHeader
          title="Cash Drawers"
          subtitle="Define and run drawer sessions for each location."
          indicator={<LocationIndicator isAllLocations />}
        />
        <Panel padded>
          <div className="flex min-h-52 flex-col items-center justify-center text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <MapPin className="h-5 w-5" />
            </span>
            <h2 className="mt-4 text-base font-semibold">Select a location</h2>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Cash drawers are location-specific. Choose a location from the top bar to manage its drawers.
            </p>
          </div>
        </Panel>
      </PageShell>
    )
  }

  if (isLoading) return <PageSkeleton title={selectedLocation?.name} />

  if (isError) {
    return (
      <PageShell>
        <PageHeader
          title="Cash Drawers"
          subtitle="Drawer sessions could not be loaded."
          indicator={
            <LocationIndicator
              isAllLocations={false}
              locationName={selectedLocation?.name}
            />
          }
        />
        <Panel padded>
          <div className="flex min-h-52 flex-col items-center justify-center text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <h2 className="mt-4 text-base font-semibold">Failed to load cash drawers</h2>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              {error instanceof Error ? error.message : 'Unknown error'}
            </p>
          </div>
        </Panel>
      </PageShell>
    )
  }

  const activeDrawers = drawers.filter((drawer) => drawer.is_active).length
  const openDrawers = drawers.filter((drawer) => drawer.is_active && drawer.is_open).length
  const availableDrawers = activeDrawers - openDrawers

  const drawerActions = {
    onEdit: handleEdit,
    onDeactivate: setDeactivateTarget,
    onOpenSession: setOpenSessionTarget,
    onCloseSession: setCloseSessionTarget,
  }

  return (
    <PageShell>
      <PageHeader
        title="Cash Drawers"
        subtitle="Monitor drawer assignments and open sessions from one workspace."
        indicator={
          <LocationIndicator
            isAllLocations={false}
            locationName={selectedLocation?.name}
          />
        }
        actions={
          <Button className="h-9 rounded-full px-4" onClick={handleAdd} disabled={!clerkOrgId}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add Cash Drawer
          </Button>
        }
      />

      <Panel className="overflow-hidden">
        <div className="px-4 py-6 sm:px-6">
          <StatRow columns={3}>
            <StatTile
              label="Configured drawers"
              value={drawers.length}
              meta={`${activeDrawers} active`}
              icon={<Banknote />}
            />
            <StatTile
              label="Open sessions"
              value={openDrawers}
              meta="Currently accepting cash"
              icon={<DoorOpen />}
            />
            <StatTile
              label="Ready to open"
              value={availableDrawers}
              meta="Active without a session"
              icon={<DoorClosed />}
            />
          </StatRow>
        </div>

        <div className="border-t border-border/60 px-4 pb-6 pt-5 sm:px-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[#0C4FD1] dark:text-[#9DBDF5]">
                Drawer registry
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Drawer sessions opened here stay synchronized with the POS tablet.
              </p>
            </div>
            <p className="flex max-w-xl items-start gap-2 text-xs text-muted-foreground sm:text-right">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Close sessions from either surface at the end of the business day.
            </p>
          </div>

          {drawers.length === 0 ? (
            <div className="mt-5">
              <Empty
                icon={Banknote}
                title="No cash drawers yet"
                description="Add your first cash drawer to start tracking cash sessions."
                action={
                  <Button className="rounded-full" onClick={handleAdd} disabled={!clerkOrgId}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Cash Drawer
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="mt-5 min-w-0">
              <div className="hidden overflow-x-auto rounded-2xl bg-muted/20 xl:block">
                <div className="grid min-w-[900px] grid-cols-[minmax(170px,1.2fr)_minmax(130px,1fr)_minmax(170px,1.2fr)_105px_180px] gap-4 bg-muted/50 px-5 py-3 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  <div>Drawer</div>
                  <div>Assignment</div>
                  <div>Current session</div>
                  <div>Status</div>
                  <div className="text-right">Actions</div>
                </div>
                {drawers.map((drawer) => (
                  <CashDrawerCard
                    key={`drawer-row-${drawer.id}`}
                    drawer={drawer}
                    layout="row"
                    {...drawerActions}
                  />
                ))}
              </div>

              <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:hidden">
                {drawers.map((drawer) => (
                  <CashDrawerCard
                    key={`drawer-card-${drawer.id}`}
                    drawer={drawer}
                    layout="card"
                    {...drawerActions}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </Panel>

      {clerkOrgId ? (
        <>
          <CashDrawerFormDialog
            open={formOpen}
            onOpenChange={(open) => {
              setFormOpen(open)
              if (!open) setEditingDrawer(null)
            }}
            clerkOrgId={clerkOrgId}
            locationId={selectedLocationId}
            drawerToEdit={editingDrawer}
          />
          <OpenSessionDialog
            open={Boolean(openSessionTarget)}
            onOpenChange={(open) => {
              if (!open) setOpenSessionTarget(null)
            }}
            clerkOrgId={clerkOrgId}
            drawer={openSessionTarget}
          />
          <CloseSessionDialog
            open={Boolean(closeSessionTarget)}
            onOpenChange={(open) => {
              if (!open) setCloseSessionTarget(null)
            }}
            clerkOrgId={clerkOrgId}
            drawer={closeSessionTarget}
          />
        </>
      ) : null}

      <AlertDialog
        open={Boolean(deactivateTarget)}
        onOpenChange={(open) => {
          if (!updateMutation.isPending && !open) setDeactivateTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate &quot;{deactivateTarget?.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              Inactive drawers cannot be opened from the POS or web. You can reactivate one later by editing it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updateMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeactivateConfirm}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  )
}

function PageSkeleton({ title }: { title?: string } = {}) {
  return (
    <PageShell>
      <PageHeader
        title="Cash Drawers"
        subtitle={title ? `Loading drawers for ${title}.` : 'Loading cash drawer sessions.'}
        actions={<Skeleton className="h-9 w-40 rounded-full" />}
      />
      <Panel className="overflow-hidden">
        <div className="px-4 py-6 sm:px-6">
          <StatRow columns={3}>
            {[0, 1, 2].map((index) => (
              <StatTile key={index} label="Loading" value="" isLoading />
            ))}
          </StatRow>
        </div>
        <div className="grid gap-3 border-t border-border/60 px-4 py-6 sm:grid-cols-2 sm:px-6">
          {[0, 1].map((index) => (
            <Skeleton key={index} className="h-56 rounded-2xl" />
          ))}
        </div>
      </Panel>
    </PageShell>
  )
}
