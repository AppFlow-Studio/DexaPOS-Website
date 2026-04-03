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
import { Loader2, CreditCard, Eye, EyeOff } from 'lucide-react'
import { useAdminCreateTerminal } from '@/lib/queries/use-admin-stations'
import type { CreatePaymentTerminalInput, TerminalType, ApiEnvironment } from '@/app/manage/actions/admin-merchant/payment-terminals'
import type { Station } from '@/app/manage/actions/admin-merchant/stations'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface AddTerminalDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    merchantId: string
    locations: Array<{ id: string; name: string }>
    stations: Array<Station & { location_name: string }>
}

const UNASSIGNED_STATION = '__unassigned__'

export function AddTerminalDialog({ open, onOpenChange, merchantId, locations, stations }: AddTerminalDialogProps) {
    // Form state
    const [selectedLocationId, setSelectedLocationId] = useState<string>('')
    const [selectedStationId, setSelectedStationId] = useState<string>(UNASSIGNED_STATION)
    const [terminalName, setTerminalName] = useState('')
    const [terminalType, setTerminalType] = useState<TerminalType>('dejavoo')
    const [authKey, setAuthKey] = useState('')
    const [registerId, setRegisterId] = useState('')
    const [apiEnvironment, setApiEnvironment] = useState<ApiEnvironment>('sandbox')
    const [signatureThreshold, setSignatureThreshold] = useState(25)
    const [showAuthKey, setShowAuthKey] = useState(false)

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
            setTerminalType('dejavoo')
            setAuthKey('')
            setRegisterId('')
            setApiEnvironment('sandbox')
            setSignatureThreshold(25)
            setShowAuthKey(false)
        }
    }, [open])

    // Reset station selection when location changes
    useEffect(() => {
        setSelectedStationId(UNASSIGNED_STATION)
    }, [selectedLocationId])

    const handleSubmit = async () => {
        if (!selectedLocationId || !terminalName || !registerId || !authKey) {
            toast.error('Please fill in all required fields')
            return
        }

        const input: CreatePaymentTerminalInput = {
            location_id: selectedLocationId,
            station_id: selectedStationId === UNASSIGNED_STATION ? null : selectedStationId,
            terminal_name: terminalName,
            terminal_type: terminalType,
            auth_key: authKey,
            register_id: registerId,
            api_environment: apiEnvironment,
            signature_threshold: signatureThreshold,
        }

        try {
            const result = await createTerminalMutation.mutateAsync({
                merchantId,
                input,
            })

            if (result.success) {
                toast.success('Payment terminal created successfully')
                onOpenChange(false)
            } else {
                toast.error(result.error || 'Failed to create terminal')
            }
        } catch (error) {
            toast.error('Failed to create terminal')
        }
    }

    const canSubmit = selectedLocationId && terminalName.trim() && registerId.trim() && authKey.trim()

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[calc(100%-1rem)] sm:max-w-[560px] max-h-[92vh] overflow-hidden gap-0 p-0">
                <DialogHeader className="border-b bg-gradient-to-br from-slate-50 via-white to-amber-50/60 px-6 pt-6 pb-4">
                    <div className="flex items-start gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 text-amber-700">
                            <CreditCard className="h-6 w-6" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <DialogTitle className="text-xl">Add Payment Terminal</DialogTitle>
                            <DialogDescription className="mt-1">
                                Connect a card terminal to a location and optionally link it to a station.
                            </DialogDescription>
                        </div>
                    </div>
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
                                    Environment
                                </p>
                                <p className={cn(
                                    'text-sm font-medium',
                                    apiEnvironment === 'production' ? 'text-amber-700' : 'text-emerald-700'
                                )}>
                                    {apiEnvironment === 'production' ? 'Production' : 'Sandbox'}
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
                                    <SelectItem value="dejavoo">Dejavoo</SelectItem>
                                    <SelectItem value="pax">PAX</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Register ID & Auth Key */}
                    <div className="space-y-2">
                        <Label htmlFor="register-id">Register ID *</Label>
                        <Input
                            id="register-id"
                            placeholder="Register identifier"
                            value={registerId}
                            onChange={(e) => setRegisterId(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                            The Register ID provided by your payment processor
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="auth-key">Auth Key *</Label>
                        <div className="relative">
                            <Input
                                id="auth-key"
                                type={showAuthKey ? 'text' : 'password'}
                                placeholder="Authentication key"
                                value={authKey}
                                onChange={(e) => setAuthKey(e.target.value)}
                                className="pr-10"
                            />
                            <button
                                type="button"
                                onClick={() => setShowAuthKey(!showAuthKey)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                                {showAuthKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                    </div>

                    {/* Environment & Threshold */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>API Environment</Label>
                            <Select value={apiEnvironment} onValueChange={(v) => setApiEnvironment(v as ApiEnvironment)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="sandbox">Sandbox (Testing)</SelectItem>
                                    <SelectItem value="production">Production (Live)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="sig-threshold">Signature Threshold ($)</Label>
                            <Input
                                id="sig-threshold"
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="25.00"
                                value={signatureThreshold}
                                onChange={(e) => setSignatureThreshold(parseFloat(e.target.value) || 0)}
                            />
                        </div>
                    </div>

                    {/* Warning for Production */}
                    {apiEnvironment === 'production' && (
                        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                            <p className="text-sm text-yellow-800 dark:text-yellow-200">
                                <strong>Warning:</strong> You are configuring a production terminal. Real transactions will be processed.
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
