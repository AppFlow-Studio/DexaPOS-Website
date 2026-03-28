'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, ArrowRight, Loader2, MapPin, PackageCheck, Warehouse } from 'lucide-react'
import { toast } from 'sonner'

import { useAssignDeviceStatus, useDeviceTransitionTargets } from '@/app/manage/hooks/useDeviceRegistry'
import { Badge } from '@/components/ui/badge'
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
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  formatDeviceStatus,
  getDeviceStatusClasses,
} from '@/lib/device-registry/presentation'
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
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Status transition</DialogTitle>
            <DialogDescription>
              Move {device.serial_number} through the approved lifecycle states. Only valid next states are selectable.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
            <div className="space-y-6">
              <div className="rounded-2xl border bg-muted/20 p-4">
                <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  Current state
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <Badge
                    variant="outline"
                    className={cn(getDeviceStatusClasses(device.status))}
                  >
                    {formatDeviceStatus(device.status)}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    Merchant {device.merchant_name ?? 'DEXA HQ'} | Location {device.location_name ?? 'N/A'}
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <h3 className="font-medium">Select next state</h3>
                  <p className="text-sm text-muted-foreground">
                    Disabled states are not reachable from the current lifecycle step.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {ALL_DEVICE_STATUSES.map((status) => {
                    const isCurrent = status === device.status
                    const isValid = validStatuses.includes(status)
                    const isSelected = status === selectedStatus

                    return (
                      <button
                        key={status}
                        type="button"
                        disabled={!isValid}
                        onClick={() => setSelectedStatus(status)}
                        className={cn(
                          'rounded-2xl border p-4 text-left transition-colors',
                          isSelected && 'border-primary bg-primary/5 shadow-sm',
                          !isSelected && isValid && 'hover:border-primary/40 hover:bg-muted/30',
                          isCurrent && 'border-dashed',
                          !isValid && 'cursor-not-allowed opacity-40'
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{formatDeviceStatus(status)}</span>
                          {isCurrent ? (
                            <Badge variant="secondary">Current</Badge>
                          ) : isValid ? (
                            <ArrowRight className="h-4 w-4 text-muted-foreground" />
                          ) : null}
                        </div>
                        <div className="mt-3">
                          <Badge
                            variant="outline"
                            className={cn(getDeviceStatusClasses(status))}
                          >
                            {isValid ? 'Available' : 'Unavailable'}
                          </Badge>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="space-y-4 rounded-2xl border bg-muted/10 p-4">
              <div>
                <h3 className="font-medium">Transition details</h3>
                <p className="text-sm text-muted-foreground">
                  The backend enforces the actual state machine and assignment rules.
                </p>
              </div>

              {!selectedStatus ? (
                <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                  Pick one of the valid target states to continue.
                </div>
              ) : (
                <>
                  <div className="rounded-xl border bg-background p-4">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <AlertCircle className="h-4 w-4 text-muted-foreground" />
                      Transition requirements
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge variant={requirement?.requiresMerchant ? 'default' : 'secondary'}>
                        Merchant {requirement?.requiresMerchant ? 'required' : 'not required'}
                      </Badge>
                      <Badge variant={requirement?.requiresLocation ? 'default' : 'secondary'}>
                        Location {requirement?.requiresLocation ? 'required' : 'not required'}
                      </Badge>
                      <Badge variant={requirement?.clearsAssignment ? 'destructive' : 'secondary'}>
                        {requirement?.clearsAssignment ? 'Clears assignment' : 'Keeps assignment'}
                      </Badge>
                    </div>
                  </div>

                  {selectedStatus === 'in_warehouse' ? (
                    <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
                      <Warehouse className="mt-0.5 h-4 w-4 shrink-0" />
                      Returning a device to warehouse clears merchant and location ownership.
                    </div>
                  ) : null}

                  {transitionTargetsQuery.isError ? (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                      {transitionTargetsQuery.error?.message ?? 'Failed to load merchant/location targets.'}
                    </div>
                  ) : null}

                  {requirement?.requiresMerchant ? (
                    <div className="space-y-2">
                      <Label htmlFor="transition-merchant">Target merchant</Label>
                      <Select value={merchantId} onValueChange={setMerchantId}>
                        <SelectTrigger id="transition-merchant" className="w-full">
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
                    </div>
                  ) : null}

                  {requirement?.requiresLocation ? (
                    <div className="space-y-2">
                      <Label htmlFor="transition-location">Target location</Label>
                      <Select
                        value={locationId}
                        onValueChange={setLocationId}
                        disabled={!merchantId}
                      >
                        <SelectTrigger id="transition-location" className="w-full">
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
                    <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                      These states require the device to be assigned to a merchant location.
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={assignMutation.isPending}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitDisabled}>
              {assignMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Updating
                </>
              ) : (
                <>
                  <PackageCheck className="h-4 w-4" />
                  Apply transition
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
