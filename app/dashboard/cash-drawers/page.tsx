'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty } from '@/components/ui/empty'
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
import { Plus, AlertTriangle, MapPin, Banknote, Loader2 } from 'lucide-react'
import {
  useGatedLocationId,
  useGatedLocation,
} from '@/stores/location-store'
import { useUserInfo } from '@/app/manage/hooks/useUserInfo.'
import {
  useCashDrawers,
  useUpdateCashDrawer,
  type CashDrawerListItem,
} from '@/lib/queries/use-cash-drawers'
import { CashDrawerCard } from './components/CashDrawerCard'
import { CashDrawerFormDialog } from './components/CashDrawerFormDialog'
import { OpenSessionDialog } from './components/OpenSessionDialog'
import { CloseSessionDialog } from './components/CloseSessionDialog'

export default function CashDrawersPage() {
  // Resolve to the gated location so single-location accounts (locked to 'all')
  // skip the "Select a Location" prompt. Multi-location on 'all' -> null.
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

  useEffect(() => setMounted(true), [])

  const handleEdit = (d: CashDrawerListItem) => {
    setEditingDrawer(d)
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

  if (!mounted) {
    return <PageSkeleton />
  }

  if (isAllLocations) {
    return (
      <PageShell title="Cash Drawers" subtitle="Define and run cash drawer sessions per location.">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <MapPin className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 text-lg font-semibold">Select a Location</h3>
            <p className="max-w-md text-muted-foreground">
              Cash drawers are location-specific. Pick a location from the top bar to manage
              its drawers.
            </p>
          </CardContent>
        </Card>
      </PageShell>
    )
  }

  if (isLoading) return <PageSkeleton title={selectedLocation?.name} />

  if (isError) {
    return (
      <PageShell title="Cash Drawers" subtitle={`for ${selectedLocation?.name ?? ''}`}>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <AlertTriangle className="mb-4 h-12 w-12 text-destructive" />
            <h3 className="mb-2 text-lg font-semibold">Failed to load cash drawers</h3>
            <p className="max-w-md text-muted-foreground">
              {error instanceof Error ? error.message : 'Unknown error'}
            </p>
          </CardContent>
        </Card>
      </PageShell>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Cash Drawers</h2>
          <p className="text-muted-foreground">
            Manage drawers for{' '}
            <span className="font-medium">{selectedLocation?.name}</span> — open and close
            sessions from the web while operations stay on the POS tablet.
          </p>
        </div>
        <Button onClick={handleAdd} disabled={!clerkOrgId}>
          <Plus className="mr-2 h-4 w-4" />
          Add Cash Drawer
        </Button>
      </div>

      <div className="rounded-lg border bg-muted/50 p-3 text-sm text-muted-foreground">
        Cash drawers are paired to a location and (optionally) a prep station. Sessions
        opened here are visible to the POS tablet, which records sales and cash events
        against the open session. Close from either side at end of day.
      </div>

      {drawers.length === 0 ? (
        <Empty
          icon={Banknote}
          title="No cash drawers yet"
          description="Add your first cash drawer to start tracking cash sessions."
          action={
            <Button onClick={handleAdd} disabled={!clerkOrgId}>
              <Plus className="mr-2 h-4 w-4" />
              Add Cash Drawer
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {drawers.map((d) => (
            <CashDrawerCard
              key={d.id}
              drawer={d}
              onEdit={handleEdit}
              onDeactivate={setDeactivateTarget}
              onOpenSession={setOpenSessionTarget}
              onCloseSession={setCloseSessionTarget}
            />
          ))}
        </div>
      )}

      {clerkOrgId && (
        <>
          <CashDrawerFormDialog
            open={formOpen}
            onOpenChange={(o) => {
              setFormOpen(o)
              if (!o) setEditingDrawer(null)
            }}
            clerkOrgId={clerkOrgId}
            locationId={selectedLocationId}
            drawerToEdit={editingDrawer}
          />
          <OpenSessionDialog
            open={!!openSessionTarget}
            onOpenChange={(o) => {
              if (!o) setOpenSessionTarget(null)
            }}
            clerkOrgId={clerkOrgId}
            drawer={openSessionTarget}
          />
          <CloseSessionDialog
            open={!!closeSessionTarget}
            onOpenChange={(o) => {
              if (!o) setCloseSessionTarget(null)
            }}
            clerkOrgId={clerkOrgId}
            drawer={closeSessionTarget}
          />
        </>
      )}

      <AlertDialog
        open={!!deactivateTarget}
        onOpenChange={(o) => {
          if (!updateMutation.isPending && !o) setDeactivateTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate &quot;{deactivateTarget?.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              Inactive drawers can&apos;t be opened from the POS or web. You can reactivate
              later by editing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updateMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeactivateConfirm}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function PageShell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
        <p className="text-muted-foreground">{subtitle}</p>
      </div>
      {children}
    </div>
  )
}

function PageSkeleton({ title }: { title?: string } = {}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Cash Drawers</h2>
          <p className="text-muted-foreground">
            {title ? `Manage drawers for ${title}` : 'Manage cash drawers per location.'}
          </p>
        </div>
        <Skeleton className="h-10 w-40" />
      </div>
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    </div>
  )
}
