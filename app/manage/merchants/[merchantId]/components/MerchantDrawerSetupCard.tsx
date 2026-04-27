'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { Skeleton } from '@/components/ui/skeleton'
import {
  Plus,
  Banknote,
  DoorOpen,
  DoorClosed,
  Edit,
  Lock,
  Loader2,
  AlertTriangle,
} from 'lucide-react'
import {
  useAdminCashDrawers,
  useAdminCreateCashDrawer,
  useAdminUpdateCashDrawer,
  useAdminDeactivateCashDrawer,
  type AdminCashDrawerListItem,
} from '@/lib/queries/use-cash-drawers'
import { useAdminPermissions } from '@/lib/hooks/useAdminPermissions'

interface SimpleLocation {
  id: string
  name: string
}

interface Props {
  merchantId: string
  locations: SimpleLocation[]
}

export function MerchantDrawerSetupCard({ merchantId, locations }: Props) {
  const { hasPermission } = useAdminPermissions()
  const canManage = hasPermission('hq.merchant.update')

  const [locationFilter, setLocationFilter] = useState<string>('all')

  const { data: drawers = [], isLoading } = useAdminCashDrawers(
    merchantId,
    locationFilter
  )

  const [formOpen, setFormOpen] = useState(false)
  const [editingDrawer, setEditingDrawer] =
    useState<AdminCashDrawerListItem | null>(null)
  const [deactivateTarget, setDeactivateTarget] =
    useState<AdminCashDrawerListItem | null>(null)

  const grouped = useMemo(() => {
    const map = new Map<string, AdminCashDrawerListItem[]>()
    for (const d of drawers) {
      const key = d.location_id
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(d)
    }
    return Array.from(map.entries()).map(([locationId, items]) => ({
      locationId,
      locationName: items[0]?.location_name ?? 'Unknown location',
      items,
    }))
  }, [drawers])

  const handleAdd = () => {
    setEditingDrawer(null)
    setFormOpen(true)
  }

  const handleEdit = (d: AdminCashDrawerListItem) => {
    setEditingDrawer(d)
    setFormOpen(true)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Banknote className="h-4 w-4" />
              Cash Drawers
            </CardTitle>
            <CardDescription>
              Create, rename, and deactivate cash drawers on this merchant&apos;s behalf.
              Merchants open and close sessions themselves at /dashboard/cash-drawers.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={locationFilter} onValueChange={setLocationFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="All locations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All locations</SelectItem>
                {locations.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canManage && (
              <Button onClick={handleAdd} disabled={locations.length === 0}>
                <Plus className="mr-2 h-4 w-4" />
                Add Drawer
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : drawers.length === 0 ? (
          <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
            No cash drawers configured for this merchant yet.
          </div>
        ) : (
          <div className="space-y-4">
            {grouped.map((group) => (
              <div key={group.locationId} className="space-y-2">
                <div className="text-sm font-medium text-muted-foreground">
                  {group.locationName}
                </div>
                <div className="divide-y rounded-md border">
                  {group.items.map((d) => (
                    <DrawerRow
                      key={d.id}
                      drawer={d}
                      canManage={canManage}
                      onEdit={handleEdit}
                      onDeactivate={setDeactivateTarget}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <DrawerFormDialog
        open={formOpen}
        onOpenChange={(o) => {
          setFormOpen(o)
          if (!o) setEditingDrawer(null)
        }}
        merchantId={merchantId}
        locations={locations}
        drawerToEdit={editingDrawer}
      />

      <AlertDialog
        open={!!deactivateTarget}
        onOpenChange={(o) => {
          if (!o) setDeactivateTarget(null)
        }}
      >
        <DeactivateConfirm
          target={deactivateTarget}
          merchantId={merchantId}
          onDone={() => setDeactivateTarget(null)}
        />
      </AlertDialog>
    </Card>
  )
}

// ============================================================================

function DrawerRow({
  drawer,
  canManage,
  onEdit,
  onDeactivate,
}: {
  drawer: AdminCashDrawerListItem
  canManage: boolean
  onEdit: (d: AdminCashDrawerListItem) => void
  onDeactivate: (d: AdminCashDrawerListItem) => void
}) {
  return (
    <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{drawer.name}</span>
          {drawer.drawer_number !== null && (
            <Badge variant="outline" className="font-mono text-xs">
              #{drawer.drawer_number}
            </Badge>
          )}
          {drawer.station_name && (
            <Badge variant="secondary" className="text-xs">
              {drawer.station_name}
            </Badge>
          )}
          {!drawer.is_active && (
            <Badge variant="outline" className="text-xs">
              Inactive
            </Badge>
          )}
          {drawer.is_open ? (
            <Badge className="bg-emerald-100 text-emerald-900 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200">
              <DoorOpen className="mr-1 h-3 w-3" />
              Open
            </Badge>
          ) : (
            <Badge variant="outline">
              <DoorClosed className="mr-1 h-3 w-3" />
              Closed
            </Badge>
          )}
        </div>
      </div>
      {canManage && (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => onEdit(drawer)}>
            <Edit className="mr-2 h-4 w-4" />
            Edit
          </Button>
          {drawer.is_active && !drawer.is_open && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => onDeactivate(drawer)}
            >
              <Lock className="mr-2 h-4 w-4" />
              Deactivate
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================================

function DrawerFormDialog({
  open,
  onOpenChange,
  merchantId,
  locations,
  drawerToEdit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  merchantId: string
  locations: SimpleLocation[]
  drawerToEdit: AdminCashDrawerListItem | null
}) {
  const createMutation = useAdminCreateCashDrawer()
  const updateMutation = useAdminUpdateCashDrawer()
  const isPending = createMutation.isPending || updateMutation.isPending

  const isEdit = !!drawerToEdit

  const [name, setName] = useState('')
  const [drawerNumber, setDrawerNumber] = useState('')
  const [locationId, setLocationId] = useState<string>('')

  useEffect(() => {
    if (open) {
      setName(drawerToEdit?.name ?? '')
      setDrawerNumber(
        drawerToEdit?.drawer_number !== null && drawerToEdit?.drawer_number !== undefined
          ? String(drawerToEdit.drawer_number)
          : ''
      )
      setLocationId(drawerToEdit?.location_id ?? locations[0]?.id ?? '')
    }
  }, [open, drawerToEdit, locations])

  const trimmedName = name.trim()
  const drawerNumberValue = drawerNumber.trim()
    ? Number.parseInt(drawerNumber.trim(), 10)
    : null
  const drawerNumberInvalid =
    drawerNumber.trim().length > 0 &&
    (Number.isNaN(drawerNumberValue) || drawerNumberValue! < 0)

  const canSave =
    trimmedName.length > 0 &&
    trimmedName.length <= 100 &&
    !drawerNumberInvalid &&
    !!locationId

  const handleSave = async () => {
    if (!canSave) return
    if (isEdit && drawerToEdit) {
      const result = await updateMutation.mutateAsync({
        merchantId,
        drawerId: drawerToEdit.id,
        input: {
          name: trimmedName,
          drawer_number: drawerNumberValue,
        },
      })
      if (result.success) onOpenChange(false)
    } else {
      const result = await createMutation.mutateAsync({
        merchantId,
        input: {
          locationId,
          name: trimmedName,
          drawer_number: drawerNumberValue,
        },
      })
      if (result.success) onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !isPending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Cash Drawer' : 'Add Cash Drawer'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Rename the drawer or change its drawer number.'
              : 'Create a drawer scoped to one of this merchant\u2019s locations.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!isEdit && (
            <div className="space-y-2">
              <Label htmlFor="adcd-location">Location</Label>
              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger id="adcd-location">
                  <SelectValue placeholder="Pick a location" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="adcd-name">Name</Label>
            <Input
              id="adcd-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Front Counter"
              maxLength={100}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="adcd-number">Drawer Number (optional)</Label>
            <Input
              id="adcd-number"
              value={drawerNumber}
              onChange={(e) => setDrawerNumber(e.target.value)}
              placeholder="1"
              inputMode="numeric"
            />
            {drawerNumberInvalid && (
              <p className="text-xs text-destructive">Must be a positive integer.</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave || isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? 'Save Changes' : 'Create Drawer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================================

function DeactivateConfirm({
  target,
  merchantId,
  onDone,
}: {
  target: AdminCashDrawerListItem | null
  merchantId: string
  onDone: () => void
}) {
  const mutation = useAdminDeactivateCashDrawer()

  const handleConfirm = async () => {
    if (!target) return
    const result = await mutation.mutateAsync({ merchantId, drawerId: target.id })
    if (result.success) onDone()
  }

  return (
    <AlertDialogContent>
      <AlertDialogHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-5 w-5 text-destructive" />
          </div>
          <AlertDialogTitle>
            Deactivate &quot;{target?.name}&quot;?
          </AlertDialogTitle>
        </div>
        <AlertDialogDescription className="pt-3">
          The drawer will no longer be selectable from the POS or web. You can reactivate
          later by editing.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={mutation.isPending}>Cancel</AlertDialogCancel>
        <AlertDialogAction onClick={handleConfirm} disabled={mutation.isPending}>
          {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Deactivate
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  )
}
