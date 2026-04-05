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
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2, Monitor, ShoppingCart, UtensilsCrossed, TabletSmartphone } from 'lucide-react'
import { useAdminCreateStation, useAdminNextStationNumber } from '@/lib/queries/use-admin-stations'
import type { StationType, CreateStationInput } from '@/app/manage/actions/admin-merchant/stations'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface AddStationDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    merchantId: string
    locations: Array<{ id: string; name: string }>
}

interface StationTypeOption {
    type: StationType
    label: string
    description: string
    icon: React.ReactNode
    defaultCapabilities: {
        can_create_orders: boolean
        can_process_payments: boolean
        can_void_orders: boolean
        can_apply_discounts: boolean
        can_update_kitchen_status: boolean
    }
}

const stationTypes: StationTypeOption[] = [
    {
        type: 'register',
        label: 'Register',
        description: 'Full POS terminal for orders and payments',
        icon: <Monitor className="h-6 w-6" />,
        defaultCapabilities: {
            can_create_orders: true,
            can_process_payments: true,
            can_void_orders: true,
            can_apply_discounts: true,
            can_update_kitchen_status: false,
        },
    },
    {
        type: 'checkout',
        label: 'Checkout',
        description: 'Payment-focused station',
        icon: <ShoppingCart className="h-6 w-6" />,
        defaultCapabilities: {
            can_create_orders: false,
            can_process_payments: true,
            can_void_orders: false,
            can_apply_discounts: false,
            can_update_kitchen_status: false,
        },
    },
    {
        type: 'kds',
        label: 'Kitchen Display',
        description: 'Display for kitchen order management',
        icon: <UtensilsCrossed className="h-6 w-6" />,
        defaultCapabilities: {
            can_create_orders: false,
            can_process_payments: false,
            can_void_orders: false,
            can_apply_discounts: false,
            can_update_kitchen_status: true,
        },
    },
    {
        type: 'self_service',
        label: 'Self-Service',
        description: 'Customer-facing kiosk',
        icon: <TabletSmartphone className="h-6 w-6" />,
        defaultCapabilities: {
            can_create_orders: true,
            can_process_payments: true,
            can_void_orders: false,
            can_apply_discounts: false,
            can_update_kitchen_status: false,
        },
    },
]

export function AddStationDialog({ open, onOpenChange, merchantId, locations }: AddStationDialogProps) {
    // Form state
    const [step, setStep] = useState(1)
    const [selectedType, setSelectedType] = useState<StationType | null>(null)
    const [selectedLocationId, setSelectedLocationId] = useState<string>('')
    const [stationName, setStationName] = useState('')
    const [stationCode, setStationCode] = useState('')
    const [stationNumber, setStationNumber] = useState<number | null>(null)
    const [capabilities, setCapabilities] = useState({
        can_create_orders: true,
        can_process_payments: false,
        can_void_orders: false,
        can_apply_discounts: true,
        can_update_kitchen_status: false,
    })

    // Mutations
    const createStationMutation = useAdminCreateStation()

    // Fetch next station number when type and location are selected
    const { data: nextNumberResult } = useAdminNextStationNumber(
        selectedLocationId,
        selectedType || 'register'
    )

    // Update station number when next number is fetched
    useEffect(() => {
        if (nextNumberResult?.data && !stationNumber) {
            setStationNumber(nextNumberResult.data)
        }
    }, [nextNumberResult?.data])

    // Update capabilities when station type changes
    useEffect(() => {
        if (selectedType) {
            const typeConfig = stationTypes.find((t) => t.type === selectedType)
            if (typeConfig) {
                setCapabilities(typeConfig.defaultCapabilities)
            }
        }
    }, [selectedType])

    // Reset form when dialog closes
    useEffect(() => {
        if (!open) {
            setStep(1)
            setSelectedType(null)
            setSelectedLocationId('')
            setStationName('')
            setStationCode('')
            setStationNumber(null)
            setCapabilities({
                can_create_orders: true,
                can_process_payments: false,
                can_void_orders: false,
                can_apply_discounts: true,
                can_update_kitchen_status: false,
            })
        }
    }, [open])

    const handleSubmit = async () => {
        if (!selectedType || !selectedLocationId || !stationName) {
            toast.error('Please fill in all required fields')
            return
        }

        const input: CreateStationInput = {
            location_id: selectedLocationId,
            station_name: stationName,
            station_code: stationCode || null,
            station_type: selectedType,
            station_number: stationNumber,
            ...capabilities,
        }

        try {
            const result = await createStationMutation.mutateAsync({
                merchantId,
                input,
            })

            if (result.success) {
                toast.success('Station created successfully')
                onOpenChange(false)
            } else {
                toast.error(result.error || 'Failed to create station')
            }
        } catch (error) {
            toast.error('Failed to create station')
        }
    }

    const canProceedStep1 = selectedType !== null && selectedLocationId !== ''
    const canProceedStep2 = stationName.trim() !== ''

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[calc(100%-1rem)] sm:max-w-[680px] max-h-[92vh] overflow-hidden gap-0 p-0">
                <DialogHeader className="border-b bg-gradient-to-br from-slate-50 via-white to-cyan-50/60 px-6 pt-6 pb-4">
                    <div className="flex items-start gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-200 bg-cyan-50 text-cyan-700">
                            <Monitor className="h-6 w-6" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <DialogTitle className="text-xl">Add Station</DialogTitle>
                            <DialogDescription className="mt-1">
                                {step === 1 && 'Choose the location and station type first.'}
                                {step === 2 && 'Define the station identity used by the POS.'}
                                {step === 3 && 'Confirm the permissions this station should have.'}
                            </DialogDescription>
                        </div>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2">
                        {[
                            { id: 1, label: 'Type' },
                            { id: 2, label: 'Details' },
                            { id: 3, label: 'Capabilities' },
                        ].map((item) => (
                            <div
                                key={item.id}
                                className={cn(
                                    'rounded-xl border px-3 py-2 text-sm transition-colors',
                                    step === item.id
                                        ? 'border-primary bg-primary/10 text-primary'
                                        : step > item.id
                                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                            : 'border-slate-200 bg-slate-50 text-slate-500'
                                )}
                            >
                                <div className="text-[11px] uppercase tracking-wide opacity-70">
                                    Step {item.id}
                                </div>
                                <div className="font-medium">{item.label}</div>
                            </div>
                        ))}
                    </div>
                </DialogHeader>

                <div className="overflow-y-auto px-6 py-5 max-h-[calc(92vh-214px)]">
                {/* Step 1: Type & Location */}
                {step === 1 && (
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <Label>Location *</Label>
                            <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select a location" />
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
                            <Label>Station Type *</Label>
                            <div className="grid grid-cols-2 gap-3">
                                {stationTypes.map((type) => (
                                    <button
                                        key={type.type}
                                        type="button"
                                        onClick={() => setSelectedType(type.type)}
                                        className={cn(
                                            'flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all text-left',
                                            selectedType === type.type
                                                ? 'border-primary bg-primary/5'
                                                : 'border-border hover:border-primary/50'
                                        )}
                                    >
                                        <div className={cn(
                                            'p-3 rounded-lg',
                                            selectedType === type.type ? 'bg-primary/10 text-primary' : 'bg-muted'
                                        )}>
                                            {type.icon}
                                        </div>
                                        <div className="text-center">
                                            <div className="font-medium">{type.label}</div>
                                            <div className="text-xs text-muted-foreground">{type.description}</div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Step 2: Details */}
                {step === 2 && (
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="station-name">Station Name *</Label>
                            <Input
                                id="station-name"
                                placeholder="e.g., Front Register, Kitchen Display 1"
                                value={stationName}
                                onChange={(e) => setStationName(e.target.value)}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="station-code">Station Code</Label>
                                <Input
                                    id="station-code"
                                    placeholder="e.g., REG-01"
                                    value={stationCode}
                                    onChange={(e) => setStationCode(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="station-number">Station Number</Label>
                                <Input
                                    id="station-number"
                                    type="number"
                                    placeholder="Auto-generated"
                                    value={stationNumber || ''}
                                    onChange={(e) => setStationNumber(e.target.value ? parseInt(e.target.value) : null)}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* Step 3: Capabilities */}
                {step === 3 && (
                    <div className="space-y-4">
                        <div className="text-sm text-muted-foreground mb-4">
                            Configure what this station can do. These settings control permissions on the POS app.
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center space-x-3">
                                <Checkbox
                                    id="can_create_orders"
                                    checked={capabilities.can_create_orders}
                                    onCheckedChange={(checked) =>
                                        setCapabilities((prev) => ({ ...prev, can_create_orders: checked as boolean }))
                                    }
                                />
                                <Label htmlFor="can_create_orders" className="font-normal">
                                    Can create orders
                                </Label>
                            </div>

                            <div className="flex items-center space-x-3">
                                <Checkbox
                                    id="can_process_payments"
                                    checked={capabilities.can_process_payments}
                                    onCheckedChange={(checked) =>
                                        setCapabilities((prev) => ({ ...prev, can_process_payments: checked as boolean }))
                                    }
                                />
                                <Label htmlFor="can_process_payments" className="font-normal">
                                    Can process payments
                                </Label>
                            </div>

                            <div className="flex items-center space-x-3">
                                <Checkbox
                                    id="can_void_orders"
                                    checked={capabilities.can_void_orders}
                                    onCheckedChange={(checked) =>
                                        setCapabilities((prev) => ({ ...prev, can_void_orders: checked as boolean }))
                                    }
                                />
                                <Label htmlFor="can_void_orders" className="font-normal">
                                    Can void orders
                                </Label>
                            </div>

                            <div className="flex items-center space-x-3">
                                <Checkbox
                                    id="can_apply_discounts"
                                    checked={capabilities.can_apply_discounts}
                                    onCheckedChange={(checked) =>
                                        setCapabilities((prev) => ({ ...prev, can_apply_discounts: checked as boolean }))
                                    }
                                />
                                <Label htmlFor="can_apply_discounts" className="font-normal">
                                    Can apply discounts
                                </Label>
                            </div>

                            <div className="flex items-center space-x-3">
                                <Checkbox
                                    id="can_update_kitchen_status"
                                    checked={capabilities.can_update_kitchen_status}
                                    onCheckedChange={(checked) =>
                                        setCapabilities((prev) => ({ ...prev, can_update_kitchen_status: checked as boolean }))
                                    }
                                />
                                <Label htmlFor="can_update_kitchen_status" className="font-normal">
                                    Can update kitchen status
                                </Label>
                            </div>
                        </div>
                    </div>
                )}
                </div>

                <DialogFooter className="border-t bg-slate-50/80 px-6 py-4">
                    <div className="flex w-full items-center justify-between gap-3">
                        <div>
                        {step > 1 && (
                            <Button variant="outline" onClick={() => setStep(step - 1)}>
                                Back
                            </Button>
                        )}
                        </div>
                        <div className="flex gap-2">
                        <Button variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        {step < 3 ? (
                            <Button
                                onClick={() => setStep(step + 1)}
                                disabled={step === 1 ? !canProceedStep1 : !canProceedStep2}
                            >
                                Next
                            </Button>
                        ) : (
                            <Button
                                onClick={handleSubmit}
                                disabled={createStationMutation.isPending}
                            >
                                {createStationMutation.isPending && (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                )}
                                Create Station
                            </Button>
                        )}
                    </div>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
