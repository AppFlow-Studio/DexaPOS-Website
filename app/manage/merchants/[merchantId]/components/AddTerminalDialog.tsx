'use client'

import { useState, useEffect } from 'react'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import { useAdminCreateTerminal } from '@/lib/queries/use-admin-stations'
import type { CreatePaymentTerminalInput, TerminalType } from '@/app/manage/actions/admin-merchant/payment-terminals'
import type { Station } from '@/app/manage/actions/admin-merchant/stations'
import { toast } from 'sonner'

interface AddTerminalDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    merchantId: string
    locations: Array<{ id: string; name: string }>
    stations: Array<Station & { location_name: string }>
}

const UNASSIGNED_STATION = '__unassigned__'

const terminalTypeLabel = (type: TerminalType): string =>
    type === 'valor' ? 'Valor' : 'Castles'

export function AddTerminalDialog({ open, onOpenChange, merchantId, locations, stations }: AddTerminalDialogProps) {
    // Form state
    const [selectedLocationId, setSelectedLocationId] = useState<string>('')
    const [selectedStationId, setSelectedStationId] = useState<string>(UNASSIGNED_STATION)
    const [terminalName, setTerminalName] = useState('')
    const [terminalType, setTerminalType] = useState<TerminalType>('castles')
    const [serialNumber, setSerialNumber] = useState('')
    const [valorEpi, setValorEpi] = useState('')

    // Mutations
    const createTerminalMutation = useAdminCreateTerminal()

    // Filter stations by selected location
    const filteredStations = stations.filter((s) =>
        selectedLocationId === '' || s.location_id === selectedLocationId
    )

    // Reset form when dialog closes
    useEffect(() => {
        if (!open) {
            setSelectedLocationId('')
            setSelectedStationId(UNASSIGNED_STATION)
            setTerminalName('')
            setTerminalType('castles')
            setSerialNumber('')
            setValorEpi('')
        }
    }, [open])

    // Reset station selection when location changes
    useEffect(() => {
        setSelectedStationId(UNASSIGNED_STATION)
    }, [selectedLocationId])

    const handleSubmit = async () => {
        if (!selectedLocationId || !terminalName.trim()) {
            toast.error('Please choose a location and enter a terminal name')
            return
        }

        const input: CreatePaymentTerminalInput = {
            location_id: selectedLocationId,
            station_id: selectedStationId === UNASSIGNED_STATION ? null : selectedStationId,
            terminal_name: terminalName.trim(),
            terminal_type: terminalType,
            serial_number: serialNumber.trim() || null,
            ...(terminalType === 'valor' ? { valor_epi: valorEpi.trim() || null } : {}),
        }

        try {
            const result = await createTerminalMutation.mutateAsync({ merchantId, input })

            if (result.success) {
                toast.success('Payment terminal created successfully')
                onOpenChange(false)
            } else {
                toast.error(result.error || 'Failed to create terminal')
            }
        } catch {
            toast.error('Failed to create terminal')
        }
    }

    const canSubmit = Boolean(selectedLocationId && terminalName.trim())

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[calc(100%-1rem)] sm:max-w-[560px] max-h-[92vh] overflow-hidden gap-0 p-0">
                <DialogHeader className="border-b bg-gradient-to-br from-slate-50 via-white to-amber-50/60 px-6 pt-6 pb-4">
                    <DialogTitle className="text-xl">Add Payment Terminal</DialogTitle>
                    <DialogDescription className="mt-1">
                        Connect a card terminal to a location and optionally link it to a station.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-5 overflow-y-auto px-6 py-5 max-h-[calc(92vh-176px)]">
                    <div className="rounded-2xl border bg-slate-50/80 p-4">
                        <div className="grid gap-1 sm:grid-cols-3 sm:gap-4">
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                    Scope
                                </p>
                                <p className="text-sm font-medium text-slate-900">
                                    {selectedLocationId
                                        ? locations.find((location) => location.id === selectedLocationId)?.name || 'Selected location'
                                        : 'Choose a location'}
                                </p>
                            </div>
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                    Assignment
                                </p>
                                <p className="text-sm font-medium text-slate-900">
                                    {selectedStationId === UNASSIGNED_STATION
                                        ? 'Unassigned'
                                        : filteredStations.find((station) => station.id === selectedStationId)?.station_name || 'Linked to station'}
                                </p>
                            </div>
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                    Type
                                </p>
                                <p className="text-sm font-medium text-slate-900">
                                    {terminalTypeLabel(terminalType)}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                    {/* Location & Station */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Location *</Label>
                            <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select location" />
                                </SelectTrigger>
                                <SelectContent>
                                    {locations.map((location) => (
                                        <SelectItem key={location.id} value={location.id}>
                                            {location.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Assign to Station</Label>
                            <Select value={selectedStationId} onValueChange={setSelectedStationId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Unassigned" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={UNASSIGNED_STATION}>Unassigned</SelectItem>
                                    {filteredStations.map((station) => (
                                        <SelectItem key={station.id} value={station.id}>
                                            {station.station_name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Terminal Name & Type */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="terminal-name">Terminal Name *</Label>
                            <Input
                                id="terminal-name"
                                placeholder="e.g., Front Counter"
                                value={terminalName}
                                onChange={(e) => setTerminalName(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Terminal Type *</Label>
                            <Select value={terminalType} onValueChange={(v) => setTerminalType(v as TerminalType)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="castles">Castles</SelectItem>
                                    <SelectItem value="valor">Valor</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Serial Number */}
                    <div className="space-y-2">
                        <Label htmlFor="serial-number">Serial Number</Label>
                        <Input
                            id="serial-number"
                            placeholder="Printed on the terminal (e.g., NCC804380219)"
                            value={serialNumber}
                            onChange={(e) => setSerialNumber(e.target.value)}
                            className="font-mono"
                        />
                        <p className="text-xs text-muted-foreground">
                            Uniquely identifies this physical terminal. Used to track connected devices and reconcile settlements.
                        </p>
                    </div>

                    {/* Valor EPI (Valor only) */}
                    {terminalType === 'valor' && (
                        <div className="space-y-2">
                            <Label htmlFor="valor-epi">Valor EPI</Label>
                            <Input
                                id="valor-epi"
                                placeholder="Electronic Payment Interface id"
                                value={valorEpi}
                                onChange={(e) => setValorEpi(e.target.value)}
                                className="font-mono"
                            />
                            <p className="text-xs text-muted-foreground">
                                The device EPI Valor sends on its auto-batch webhook. Required to record this terminal&apos;s settlements automatically.
                            </p>
                        </div>
                    )}
                </div>
                </div>

                <DialogFooter className="border-t bg-slate-50/80 px-6 py-4">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={!canSubmit || createTerminalMutation.isPending}
                    >
                        {createTerminalMutation.isPending && (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        )}
                        Add Terminal
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
