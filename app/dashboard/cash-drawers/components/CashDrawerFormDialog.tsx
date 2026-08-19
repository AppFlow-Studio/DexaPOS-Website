'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import {
  useCreateCashDrawer,
  useUpdateCashDrawer,
  type CashDrawerListItem,
} from '@/lib/queries/use-cash-drawers'
import { useLocationStations } from '@/app/dashboard/settings/stations/hooks/useStations'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  clerkOrgId: string
  locationId: string
  drawerToEdit: CashDrawerListItem | null
}

const NO_STATION = '__none__'

export function CashDrawerFormDialog({
  open,
  onOpenChange,
  clerkOrgId,
  locationId,
  drawerToEdit,
}: Props) {
  const createMutation = useCreateCashDrawer()
  const updateMutation = useUpdateCashDrawer()
  const { data: stations = [] } = useLocationStations(locationId)

  const isEdit = !!drawerToEdit
  const isPending = createMutation.isPending || updateMutation.isPending

  const [name, setName] = useState('')
  const [drawerNumber, setDrawerNumber] = useState('')
  const [stationId, setStationId] = useState<string>(NO_STATION)

  useEffect(() => {
    if (open) {
      setName(drawerToEdit?.name ?? '')
      setDrawerNumber(
        drawerToEdit?.drawer_number !== null && drawerToEdit?.drawer_number !== undefined
          ? String(drawerToEdit.drawer_number)
          : ''
      )
      setStationId(drawerToEdit?.station_id ?? NO_STATION)
    }
  }, [open, drawerToEdit])

  const trimmedName = name.trim()
  const drawerNumberValue = drawerNumber.trim()
    ? Number.parseInt(drawerNumber.trim(), 10)
    : null
  const drawerNumberInvalid =
    drawerNumber.trim().length > 0 &&
    (Number.isNaN(drawerNumberValue) || drawerNumberValue! < 0)

  const canSave = trimmedName.length > 0 && trimmedName.length <= 100 && !drawerNumberInvalid

  const handleSave = async () => {
    if (!canSave) return
    const payload = {
      name: trimmedName,
      drawer_number: drawerNumberValue,
      station_id: stationId === NO_STATION ? null : stationId,
    }

    if (isEdit && drawerToEdit) {
      const result = await updateMutation.mutateAsync({
        clerkOrgId,
        drawerId: drawerToEdit.id,
        input: payload,
      })
      if (result.success) onOpenChange(false)
    } else {
      const result = await createMutation.mutateAsync({
        clerkOrgId,
        input: { ...payload, locationId },
      })
      if (result.success) onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !isPending && onOpenChange(o)}>
      {/* The base `DialogContent` already goes edge-to-edge and `h-dvh` below
          `sm`, so the sheet only needs the scroll structure: `flex` instead of
          the base `grid`, and `overflow-hidden` to override the base's
          `max-sm:overflow-y-auto` — a rounded/clipping panel must never be the
          scroller itself, or the footer scrolls away with the content. */}
      <DialogContent className="flex flex-col overflow-hidden max-sm:overflow-hidden sm:max-h-[85dvh] sm:max-w-md p-0">
        <DialogHeader className="shrink-0 px-6 pt-6">
          <DialogTitle>{isEdit ? 'Edit Cash Drawer' : 'Add Cash Drawer'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Rename the drawer or reassign its station.'
              : 'Define a new cash drawer for this location. You can open a session from the drawer card after saving.'}
          </DialogDescription>
        </DialogHeader>

        {/* Horizontal padding lives here (not on the panel) so the input focus
            ring isn't clipped by the scroller's overflow on either side. */}
        <div className="thin-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-6">
          <div className="space-y-2">
            <Label htmlFor="cd-name">Name</Label>
            <Input
              id="cd-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Front Counter"
              maxLength={100}
              autoFocus
            />
          </div>
          {/* One column on a phone: "Drawer Number (optional)" and
              "Station / Register (optional)" both wrap to two lines in a
              160px half-column at 320px. */}
          <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cd-number">Drawer Number (optional)</Label>
              <Input
                id="cd-number"
                value={drawerNumber}
                onChange={(e) => setDrawerNumber(e.target.value)}
                placeholder="1"
                inputMode="numeric"
              />
              {drawerNumberInvalid && (
                <p className="text-xs text-destructive">Must be a positive integer.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="cd-station">Station / Register (optional)</Label>
              <Select
                value={stationId}
                onValueChange={(v) => setStationId(v)}
              >
                <SelectTrigger id="cd-station">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_STATION}>Unassigned</SelectItem>
                  {stations.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.station_name}
                      {s.station_number !== null && s.station_number !== undefined
                        ? ` · #${s.station_number}`
                        : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter className="shrink-0 px-6 pb-6">
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
