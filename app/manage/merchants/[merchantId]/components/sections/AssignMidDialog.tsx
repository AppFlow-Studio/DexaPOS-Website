'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
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
import { useAssignLuqraMid, useClearLuqraMid } from '@/lib/queries/use-luqra'
import type {
    LocationMidRow,
    LuqraMidStatus,
} from '@/app/manage/actions/admin-merchant/luqra'

interface AssignMidDialogProps {
    merchantId: string
    open: boolean
    onOpenChange: (open: boolean) => void
    locations: { id: string; name: string }[]
    /** When provided, dialog edits this row. When null, "assign new" with picker. */
    editing: LocationMidRow | null
}

const STATUSES: LuqraMidStatus[] = ['pending', 'review', 'live', 'offline']

export function AssignMidDialog({
    merchantId,
    open,
    onOpenChange,
    locations,
    editing,
}: AssignMidDialogProps) {
    const [locationId, setLocationId] = useState<string>('')
    const [mid, setMid] = useState('')
    const [descriptor, setDescriptor] = useState('')
    const [status, setStatus] = useState<LuqraMidStatus>('pending')

    useEffect(() => {
        if (open) {
            setLocationId(editing?.id ?? locations[0]?.id ?? '')
            setMid(editing?.luqra_mid ?? '')
            setDescriptor(editing?.luqra_mid_descriptor ?? '')
            setStatus((editing?.luqra_mid_status as LuqraMidStatus) ?? 'pending')
        }
    }, [open, editing, locations])

    const assign = useAssignLuqraMid(merchantId)
    const clear = useClearLuqraMid(merchantId)

    const submitting = assign.isPending || clear.isPending

    const handleSubmit = async () => {
        if (!locationId) return
        const cleaned = mid.replace(/\s+/g, '')
        if (!/^[0-9]{8,20}$/.test(cleaned)) {
            toast.error('MID must be 8-20 digits')
            return
        }
        const res = await assign.mutateAsync({
            locationId,
            input: {
                mid: cleaned,
                descriptor: descriptor.trim() || null,
                status,
            },
        })
        if (!res.success) {
            const labels: Record<string, string> = {
                invalid_mid_format: 'MID must be 8-20 digits',
                mid_already_assigned: 'That MID is already assigned to another location',
                location_not_found: 'Location not found',
                merchant_mismatch: 'Location does not belong to this merchant',
            }
            toast.error(labels[res.error ?? ''] ?? res.error ?? 'Failed to save MID')
            return
        }
        toast.success(editing?.luqra_mid ? 'MID updated' : 'MID assigned')
        onOpenChange(false)
    }

    const handleClear = async () => {
        if (!editing) return
        const res = await clear.mutateAsync(editing.id)
        if (!res.success) {
            toast.error(res.error ?? 'Failed to clear MID')
            return
        }
        toast.success('MID cleared')
        onOpenChange(false)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {/* §12/§13.1: a form, so full-screen below `sm`. The content clips and
                the body scrolls; header and footer carry no rule (§5.5). */}
            <DialogContent className="flex h-dvh max-h-dvh w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 max-sm:overflow-hidden sm:h-auto sm:max-h-[85vh] sm:w-full sm:max-w-[440px] sm:rounded-3xl">
                <DialogHeader className="shrink-0 px-6 pb-2 pr-14 pt-6 text-left">
                    <DialogTitle>
                        {editing?.luqra_mid ? 'Edit Luqra MID' : 'Assign Luqra MID'}
                    </DialogTitle>
                    <DialogDescription>
                        Bind a Luqra acquiring MID to one of this merchant&apos;s locations.
                        Used as <code className="font-mono text-[11px]">mid__eq</code> on the Luqra reports API.
                    </DialogDescription>
                </DialogHeader>

                <div className="thin-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="location">Location</Label>
                        <Select value={locationId} onValueChange={setLocationId} disabled={!!editing}>
                            <SelectTrigger id="location">
                                <SelectValue placeholder="Select a location" />
                            </SelectTrigger>
                            <SelectContent>
                                {locations.map((loc) => (
                                    <SelectItem key={loc.id} value={loc.id}>
                                        {loc.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="mid">MID</Label>
                        <Input
                            id="mid"
                            inputMode="numeric"
                            placeholder="584600000103655"
                            className="font-mono"
                            value={mid}
                            onChange={(e) => setMid(e.target.value)}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="descriptor">Descriptor</Label>
                        <Input
                            id="descriptor"
                            placeholder="MTECH DISTRIBUTORS"
                            value={descriptor}
                            onChange={(e) => setDescriptor(e.target.value)}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="status">Status</Label>
                        <Select value={status} onValueChange={(v) => setStatus(v as LuqraMidStatus)}>
                            <SelectTrigger id="status">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent side="top">
                                {STATUSES.map((s) => (
                                    <SelectItem key={s} value={s}>
                                        {s}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <DialogFooter className="flex shrink-0 flex-row items-center justify-between px-6 pb-6 pt-4 sm:justify-between">
                    {editing?.luqra_mid ? (
                        <Button
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={handleClear}
                            disabled={submitting}
                        >
                            Clear MID
                        </Button>
                    ) : (
                        <span />
                    )}
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                            Cancel
                        </Button>
                        <Button onClick={handleSubmit} disabled={submitting || !locationId || !mid}>
                            {editing?.luqra_mid ? 'Save changes' : 'Assign MID'}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
