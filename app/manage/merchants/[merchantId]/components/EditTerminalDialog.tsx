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
import { Switch } from '@/components/ui/switch'
import { Loader2, Settings2, Clock } from 'lucide-react'
import { useAdminUpdateTerminal } from '@/lib/queries/use-admin-stations'
import type { PaymentTerminal, UpdatePaymentTerminalInput } from '@/app/manage/actions/admin-merchant/payment-terminals'
import { toast } from 'sonner'

interface EditTerminalDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    merchantId: string
    terminal: (PaymentTerminal & { location_name?: string; station_name?: string | null }) | null
}

// Postgres time comes back as HH:MM:SS — the <input type="time"> wants HH:MM.
const toTimeInput = (t: string | null | undefined): string => (t ? t.slice(0, 5) : '')

export function EditTerminalDialog({ open, onOpenChange, merchantId, terminal }: EditTerminalDialogProps) {
    const [terminalName, setTerminalName] = useState('')
    const [serialNumber, setSerialNumber] = useState('')
    const [autoSettle, setAutoSettle] = useState(false)
    const [settleTime, setSettleTime] = useState('')
    const [valorEpi, setValorEpi] = useState('')
    // Set when the server blocks a serial change because a different physical
    // device answered (SERIAL_IDENTITY_MISMATCH). Holds the explanatory message.
    const [serialMismatch, setSerialMismatch] = useState<string | null>(null)

    const updateMutation = useAdminUpdateTerminal()

    const isValor = terminal?.terminal_type === 'valor'

    // Hydrate form when a terminal is opened for editing.
    useEffect(() => {
        if (open && terminal) {
            setTerminalName(terminal.terminal_name ?? '')
            setSerialNumber(terminal.serial_number ?? '')
            setAutoSettle(!!terminal.auto_settle)
            setSettleTime(toTimeInput(terminal.settle_time))
            setValorEpi(terminal.valor_epi ?? '')
            setSerialMismatch(null)
        }
    }, [open, terminal])

    const handleSubmit = async (confirmSerialChange = false) => {
        if (!terminal) return

        const input: UpdatePaymentTerminalInput = {
            terminal_name: terminalName.trim() || terminal.terminal_name,
            // Send raw; the server normalizes + enforces uniqueness. Empty -> null.
            serial_number: serialNumber.trim() || null,
            auto_settle: autoSettle,
            // Clear-to-null: an empty time input must persist NULL, not midnight.
            settle_time: autoSettle ? (settleTime.trim() || null) : null,
        }
        if (isValor) {
            input.valor_epi = valorEpi.trim() || null
        }
        if (confirmSerialChange) {
            input.confirmSerialChange = true
        }

        try {
            const result = await updateMutation.mutateAsync({ merchantId, terminalId: terminal.id, input })
            if (result.success) {
                toast.success('Terminal updated')
                setSerialMismatch(null)
                onOpenChange(false)
            } else if ((result as { code?: string }).code === 'SERIAL_IDENTITY_MISMATCH') {
                // Different device — do not silently overwrite the serial. Surface
                // an inline warning with an explicit override, and steer toward
                // registering the replacement as a new terminal.
                setSerialMismatch(result.error || 'This looks like a different device.')
            } else {
                toast.error(result.error || 'Failed to update terminal')
            }
        } catch {
            toast.error('Failed to update terminal')
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[calc(100%-1rem)] sm:max-w-[520px] max-h-[92vh] overflow-hidden gap-0 p-0">
                <DialogHeader className="border-b bg-gradient-to-br from-slate-50 via-white to-blue-50/60 px-6 pt-6 pb-4">
                    <div className="flex items-start gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-200 bg-blue-50 text-blue-700">
                            <Settings2 className="h-6 w-6" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <DialogTitle className="text-xl">Edit Terminal</DialogTitle>
                            <DialogDescription className="mt-1">
                                {terminal ? `${terminal.terminal_name} · ${terminal.location_name || ''}` : ''}
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <div className="space-y-5 overflow-y-auto px-6 py-5 max-h-[calc(92vh-176px)]">
                    {/* Identity */}
                    <div className="space-y-2">
                        <Label htmlFor="edit-terminal-name">Terminal Name</Label>
                        <Input
                            id="edit-terminal-name"
                            value={terminalName}
                            onChange={(e) => setTerminalName(e.target.value)}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="edit-serial">Serial Number</Label>
                        <Input
                            id="edit-serial"
                            className="font-mono"
                            placeholder="Printed on the terminal"
                            value={serialNumber}
                            onChange={(e) => {
                                setSerialNumber(e.target.value)
                                if (serialMismatch) setSerialMismatch(null)
                            }}
                        />
                        <p className="text-xs text-muted-foreground">
                            Uniquely identifies this physical terminal. Must be unique within the location.
                        </p>
                        {serialMismatch && (
                            <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-2">
                                <p className="text-xs font-semibold text-red-700">
                                    Different device detected
                                </p>
                                <p className="text-xs text-red-700">{serialMismatch}</p>
                                <p className="text-xs text-red-700">
                                    Recommended: close this dialog and register the replacement as a new terminal so its settlement batches stay separate.
                                </p>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="border-red-300 text-red-700 hover:bg-red-100"
                                    disabled={updateMutation.isPending}
                                    onClick={() => handleSubmit(true)}
                                >
                                    Change serial anyway
                                </Button>
                            </div>
                        )}
                    </div>

                    {isValor && (
                        <div className="space-y-2">
                            <Label htmlFor="edit-valor-epi">Valor EPI</Label>
                            <Input
                                id="edit-valor-epi"
                                className="font-mono"
                                placeholder="Electronic Payment Interface id"
                                value={valorEpi}
                                onChange={(e) => setValorEpi(e.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">
                                The device EPI Valor sends on its auto-batch webhook. Required to record this terminal&apos;s settlements automatically.
                            </p>
                        </div>
                    )}

                    {/* Auto-settle */}
                    <div className="rounded-2xl border bg-slate-50/80 p-4 space-y-4">
                        <div className="flex items-start justify-between gap-4">
                            <div className="space-y-0.5">
                                <Label htmlFor="edit-auto-settle" className="text-sm font-semibold">Auto-Settle</Label>
                                <p className="text-xs text-muted-foreground">
                                    {isValor
                                        ? 'The terminal auto-batches on-device at its set time; Dexa records it via webhook.'
                                        : 'The POS tablet performs the settlement at the set time (the tablet must be on).'}
                                </p>
                            </div>
                            <Switch id="edit-auto-settle" checked={autoSettle} onCheckedChange={setAutoSettle} />
                        </div>

                        {autoSettle && (
                            <div className="space-y-2">
                                <Label htmlFor="edit-settle-time" className="flex items-center gap-1.5">
                                    <Clock className="h-3.5 w-3.5" />
                                    Settle Time (location time)
                                </Label>
                                <Input
                                    id="edit-settle-time"
                                    type="time"
                                    value={settleTime}
                                    onChange={(e) => setSettleTime(e.target.value)}
                                    className="w-40"
                                />
                                <p className="text-xs text-muted-foreground">
                                    Leave empty to clear. Interpreted in the location&apos;s timezone.
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                <DialogFooter className="border-t bg-slate-50/80 px-6 py-4">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={() => handleSubmit()} disabled={!terminal || updateMutation.isPending}>
                        {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Save Changes
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
