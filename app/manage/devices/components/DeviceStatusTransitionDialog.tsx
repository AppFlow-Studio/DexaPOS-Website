'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, ArrowRight, MapPin, PackageCheck, Warehouse } from 'lucide-react'
import { toast } from 'sonner'

import { useAssignDeviceStatus, useDeviceTransitionTargets } from '@/app/manage/hooks/useDeviceRegistry'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { formatDeviceStatus } from '@/lib/device-registry/presentation'
import {
  ALL_DEVICE_STATUSES,
  getTransitionRequirement,
  getValidNextStatuses,
} from '@/lib/device-registry/state-machine'
import type { AdminDeviceInventoryRow, DeviceLifecycleStatus } from '@/types/device-registry'

interface DeviceStatusTransitionDialogProps {
  device: AdminDeviceInventoryRow
}

export function DeviceStatusTransitionDialog({
  device,
}: DeviceStatusTransitionDialogProps) {
  const [open, setOpen] = useState(false)
  const validStatuses = useMemo(() => getValidNextStatuses(device.status), [device.status])

  const [selectedStatus, setSelectedStatus] = useState<DeviceLifecycleStatus | null>(null)
  const [merchantId, setMerchantId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [trackingNumber, setTrackingNumber] = useState('')
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')

  const transitionTargetsQuery = useDeviceTransitionTargets(open)
  const assignMutation = useAssignDeviceStatus()

  useEffect(() => {
    if (!open) return

    setSelectedStatus(validStatuses[0] ?? null)
    setMerchantId(device.merchant_id ?? '')
    setLocationId(device.location_id ?? '')
    setTrackingNumber('')
    setReason('')
    setNotes('')
  }, [device.location_id, device.merchant_id, open, validStatuses])

  const requirement = selectedStatus ? getTransitionRequirement(selectedStatus) : null

  const merchants = transitionTargetsQuery.data?.merchants ?? []
  const filteredLocations = useMemo(() => {
    const locations = transitionTargetsQuery.data?.locations ?? []
    if (!merchantId) return locations
    return locations.filter((location) => location.merchant_id === merchantId)
  }, [merchantId, transitionTargetsQuery.data?.locations])

  useEffect(() => {
    if (!selectedStatus) return
    const nextRequirement = getTransitionRequirement(selectedStatus)

    if (!nextRequirement.requiresMerchant) {
      setMerchantId('')
      setLocationId('')
      return
    }

    if (!nextRequirement.requiresLocation) {
      setLocationId('')
    }
  }, [selectedStatus])

  useEffect(() => {
    if (!locationId) return
    const locationStillVisible = filteredLocations.some((location) => location.id === locationId)
    if (!locationStillVisible) {
      setLocationId('')
    }
  }, [filteredLocations, locationId])

  const submitDisabled =
    !selectedStatus ||
    assignMutation.isPending ||
    (requirement?.requiresMerchant && !merchantId) ||
    (requirement?.requiresLocation && !locationId)

  async function handleSubmit() {
    if (!selectedStatus) {
      toast.error('Select a target status first.')
      return
    }

    if (requirement?.requiresMerchant && !merchantId) {
      toast.error('A merchant is required for that transition.')
      return
    }

    if (requirement?.requiresLocation && !locationId) {
      toast.error('A location is required for that transition.')
      return
    }

    try {
      const result = await assignMutation.mutateAsync({
        deviceId: device.id,
        newStatus: selectedStatus,
        toMerchantId: requirement?.requiresMerchant ? merchantId : null,
        toLocationId: requirement?.requiresLocation ? locationId : null,
        trackingNumber: trackingNumber.trim() || null,
        reason: reason.trim() || null,
        notes: notes.trim() || null,
      })

      toast.success(
        `Device moved from ${formatDeviceStatus(device.status)} to ${formatDeviceStatus(
          result.new_status ?? selectedStatus
        )}.`
      )
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update device status')
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={validStatuses.length === 0}>
        <PackageCheck className="h-4 w-4" />
        {validStatuses.length === 0 ? 'No transitions available' : 'Change status'}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        {/* §12/§13.1: a form, so full-screen below `sm`. The content clips and
            the body scrolls; header and footer carry no rule (§5.5). */}
        <DialogContent className="flex h-dvh max-h-dvh w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-auto sm:max-h-[85vh] sm:w-full sm:max-w-4xl sm:rounded-3xl">
          <DialogHeader className="shrink-0 px-6 pb-2 pr-14 pt-6 text-left">
            <DialogTitle className="text-xl">Status transition</DialogTitle>
            {/* Explanatory lines drop on phones (§13.4); the form says the same by itself. */}
            <DialogDescription className="max-sm:hidden">
              Move {device.serial_number} through the approved lifecycle states. Only valid next states are selectable.
            </DialogDescription>
          </DialogHeader>

          <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-6 py-4">
            <div className="grid gap-6 lg:grid-cols-[1.3fr_0.9fr]">
              <div className="min-w-0 space-y-6">
                <div className="rounded-2xl bg-muted/60 px-4 py-3">
                  <p className="text-sm text-muted-foreground">Current state</p>
                  <p className="mt-1 font-medium">{formatDeviceStatus(device.status)}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {device.merchant_name ?? 'DEXA HQ'} · {device.location_name ?? 'No location'}
                  </p>
                </div>

                <div className="space-y-3">
                  <div>
                    <h3 className="font-medium">Select next state</h3>
                    <p className="text-sm text-muted-foreground max-sm:hidden">
                      Disabled states are not reachable from the current lifecycle step.
                    </p>
                  </div>

                  {/* Columns at least 10rem wide: as many as fit, so the longest state
                      ("Decommissioned") always sits on one line in its card. */}
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3">
                    {ALL_DEVICE_STATUSES.map((status) => {
                      const isCurrent = status === device.status
                      const isValid = validStatuses.includes(status)
                      const isSelected = status === selectedStatus

                      return (
                        <button
                          key={status}
                          type="button"
                          disabled={!isValid}
                          aria-pressed={isSelected}
                          onClick={() => setSelectedStatus(status)}
                          className={cn(
                            // Selection is a ring, not a brand fill (§3.5, §5.3).
                            'min-w-0 rounded-2xl p-4 text-left transition-colors',
                            isSelected ? 'bg-muted ring-1 ring-border' : 'bg-muted/45',
                            !isSelected && isValid && 'hover:bg-muted',
                            !isValid && 'cursor-not-allowed opacity-40'
                          )}
                        >
                          {/* The label takes the card's full width; the arrow sits on the
                              availability line, inside the card. */}
                          <span className="block font-medium">
                            {formatDeviceStatus(status)}
                          </span>
                          <span className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                            {isCurrent ? 'Current' : isValid ? 'Available' : 'Unavailable'}
                            {isValid && !isCurrent ? (
                              <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
                            ) : null}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              <div className="min-w-0 space-y-4">
                <div>
                  <h3 className="font-medium">Transition details</h3>
                  <p className="text-sm text-muted-foreground max-sm:hidden">
                    The backend enforces the actual state machine and assignment rules.
                  </p>
                </div>

                {!selectedStatus ? (
                  <p className="rounded-2xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
                    Pick one of the valid target states to continue.
                  </p>
                ) : (
                  <>
                    <div className="rounded-2xl bg-muted/60 px-4 py-3">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <AlertCircle className="h-4 w-4 text-muted-foreground" />
                        Transition requirements
                      </div>
                      {/* On a muted callout the requirements are words, not pills (§3.5). */}
                      <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                        <li>Merchant {requirement?.requiresMerchant ? 'required' : 'not required'}</li>
                        <li>Location {requirement?.requiresLocation ? 'required' : 'not required'}</li>
                        <li>{requirement?.clearsAssignment ? 'Clears assignment' : 'Keeps assignment'}</li>
                      </ul>
                    </div>

                    {selectedStatus === 'in_warehouse' ? (
                      <div className="flex items-start gap-3 rounded-2xl bg-muted/60 px-4 py-3 text-sm">
                        <Warehouse className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        Returning a device to warehouse clears merchant and location ownership.
                      </div>
                    ) : null}

                    {transitionTargetsQuery.isError ? (
                      <div className="flex flex-col items-start gap-2 rounded-2xl bg-muted/60 px-4 py-3 text-sm">
                        <p>
                          {transitionTargetsQuery.error?.message ?? 'Failed to load merchant and location targets.'}
                        </p>
                        <Button variant="outline" size="sm" onClick={() => void transitionTargetsQuery.refetch()}>
                          Retry
                        </Button>
                      </div>
                    ) : null}

                    {requirement?.requiresMerchant ? (
                      <div className="space-y-2">
                        <Label htmlFor="transition-merchant">Target merchant</Label>
                        {/* The targets load when the dialog opens: a skeleton of the field until then (§4.10). */}
                        {transitionTargetsQuery.isLoading ? (
                          <Skeleton className="h-9 w-full rounded-full" />
                        ) : (
                          <Select value={merchantId} onValueChange={setMerchantId}>
                            <SelectTrigger
                              id="transition-merchant"
                              className="w-full rounded-full border-0 bg-muted/60 shadow-none"
                            >
                              <SelectValue placeholder="Select merchant" />
                            </SelectTrigger>
                            <SelectContent>
                              {merchants.map((merchant) => (
                                <SelectItem key={merchant.id} value={merchant.id}>
                                  {merchant.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    ) : null}

                    {requirement?.requiresLocation ? (
                      <div className="space-y-2">
                        <Label htmlFor="transition-location">Target location</Label>
                        {transitionTargetsQuery.isLoading ? (
                          <Skeleton className="h-9 w-full rounded-full" />
                        ) : (
                          <Select
                            value={locationId}
                            onValueChange={setLocationId}
                            disabled={!merchantId}
                          >
                            <SelectTrigger
                              id="transition-location"
                              className="w-full rounded-full border-0 bg-muted/60 shadow-none"
                            >
                              <SelectValue placeholder="Select location" />
                            </SelectTrigger>
                            <SelectContent>
                              {filteredLocations.map((location) => (
                                <SelectItem key={location.id} value={location.id}>
                                  {location.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Locations are filtered by the selected merchant.
                        </p>
                      </div>
                    ) : null}

                    <div className="space-y-2">
                      <Label htmlFor="transition-tracking">Tracking number</Label>
                      <Input
                        id="transition-tracking"
                        value={trackingNumber}
                        onChange={(event) => setTrackingNumber(event.target.value)}
                        placeholder={selectedStatus === 'shipped' ? 'Enter shipment tracking' : 'Optional'}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="transition-reason">Reason</Label>
                      <Input
                        id="transition-reason"
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        placeholder="Optional transition reason"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="transition-notes">Notes</Label>
                      <Textarea
                        id="transition-notes"
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        placeholder="Operational notes for the assignment log"
                        rows={4}
                      />
                    </div>

                    {selectedStatus === 'provisioning' || selectedStatus === 'deployed' ? (
                      <div className="flex items-start gap-3 rounded-2xl bg-muted/60 px-4 py-3 text-sm">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        These states require the device to be assigned to a merchant location.
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Centred actions, as on the dead-letter dialog: two equal buttons on phones. */}
          <DialogFooter className="grid shrink-0 grid-cols-2 px-6 pb-6 pt-4 sm:flex sm:justify-center">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={assignMutation.isPending}>
              Cancel
            </Button>
            {/* A busy button changes its label, never a spinner (§4.10). */}
            <Button onClick={handleSubmit} disabled={submitDisabled}>
              <PackageCheck className="h-4 w-4" />
              {assignMutation.isPending ? 'Applying…' : 'Apply transition'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
