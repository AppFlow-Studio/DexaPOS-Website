'use client'

import * as React from 'react'
import { toast } from 'sonner'
import {
    BottomSheet,
    BottomSheetTrigger,
    BottomSheetContent,
    BottomSheetHeader,
    BottomSheetBody,
    BottomSheetFooter,
    BottomSheetTitle,
    BottomSheetDescription,
} from '@/components/ui/bottom-sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PhoneInput } from '@/components/ui/phone-input'
import { normalizePhone } from '@/lib/phone'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Users, Phone, FileText, MapPin, Clock } from 'lucide-react'
import { AddToWaitlistAction } from '@/app/dashboard/actions/floor-plan-actions'
import { useQueryClient } from '@tanstack/react-query'

/**
 * Borderless field material — the tinted fill used across the dashboard's
 * dialogs, so a column of fields reads as one surface rather than a stack of
 * outlined boxes. Literal string in this `.tsx`: Tailwind does not scan `.ts`,
 * so a class sourced only from a constants module would render unstyled.
 */
const SHEET_FIELD =
    'rounded-xl border-transparent bg-muted/50 shadow-none focus-visible:bg-background'

interface AddToWaitlistWizardProps {
    locationId: string
    onSuccess?: () => void
    children?: React.ReactNode
}

export function AddToWaitlistWizard({ locationId, onSuccess, children }: AddToWaitlistWizardProps) {
    const queryClient = useQueryClient()
    const [open, setOpen] = React.useState(false)
    const [isSubmitting, setIsSubmitting] = React.useState(false)

    // Form state
    const [partyName, setPartyName] = React.useState('')
    const [partySize, setPartySize] = React.useState('')
    const [phone, setPhone] = React.useState('')
    const [notes, setNotes] = React.useState('')
    const [preferredSection, setPreferredSection] = React.useState('')
    const [quotedWaitMinutes, setQuotedWaitMinutes] = React.useState('')

    // Reset form when dialog closes
    React.useEffect(() => {
        if (!open) {
            setPartyName('')
            setPartySize('')
            setPhone('')
            setNotes('')
            setPreferredSection('')
            setQuotedWaitMinutes('')
        }
    }, [open])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        // Validation
        if (!partyName.trim()) {
            toast.error('Please enter a party name')
            return
        }

        const size = parseInt(partySize, 10)
        if (!size || size < 1) {
            toast.error('Please enter a valid party size')
            return
        }

        setIsSubmitting(true)

        try {
            const result = await AddToWaitlistAction(locationId, {
                partyName: partyName.trim(),
                partySize: size,
                phone: normalizePhone(phone) ?? undefined,
                notes: notes.trim() || undefined,
                preferredSection: preferredSection.trim() || undefined,
                quotedWaitMinutes: quotedWaitMinutes ? parseInt(quotedWaitMinutes, 10) : undefined,
            })

            toast.success(`Party added to waitlist! Position #${result.position}`)

            // Invalidate waitlist query to refresh
            await queryClient.invalidateQueries({ queryKey: ['waitlist', locationId] })

            setOpen(false)
            onSuccess?.()
        } catch (error: any) {
            console.error('Error adding to waitlist:', error)
            toast.error(error?.message || 'Failed to add party to waitlist')
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <BottomSheet open={open} onOpenChange={setOpen}>
            {children && <BottomSheetTrigger asChild>{children}</BottomSheetTrigger>}
            <BottomSheetContent className="tables-pill-controls max-h-[90vh]">
                {/* The header/footer rules are defaults on the shared
                    BottomSheet primitive; dropped here rather than in the
                    primitive so the other 18 sheets keep their current look. */}
                <BottomSheetHeader className="border-b-0">
                    <BottomSheetTitle>Add Party to Waitlist</BottomSheetTitle>
                    <BottomSheetDescription>
                        Enter the party details to add them to the waitlist
                    </BottomSheetDescription>
                </BottomSheetHeader>

                <BottomSheetBody>
                    <form onSubmit={handleSubmit} id="add-waitlist-form" className="space-y-4">
                        {/* Party Name */}
                        <div className="space-y-2">
                            <Label htmlFor="party-name" className="flex items-center gap-2">
                                <Users className="h-4 w-4" />
                                Party Name <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                id="party-name"
                                placeholder="Enter party name"
                                value={partyName}
                                onChange={(e) => setPartyName(e.target.value)}
                                required
                                autoFocus
                                className={SHEET_FIELD}
                            />
                        </div>

                        {/* Party Size */}
                        <div className="space-y-2">
                            <Label htmlFor="party-size" className="flex items-center gap-2">
                                <Users className="h-4 w-4" />
                                Party Size <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                id="party-size"
                                type="number"
                                min="1"
                                placeholder="Number of guests"
                                value={partySize}
                                onChange={(e) => setPartySize(e.target.value)}
                                required
                                className={SHEET_FIELD}
                            />
                        </div>

                        {/* Phone */}
                        <div className="space-y-2">
                            <Label htmlFor="phone" className="flex items-center gap-2">
                                <Phone className="h-4 w-4" />
                                Phone Number
                            </Label>
                            {/* PhoneInput draws its border from a CSS variable on
                                the wrapper, not a Tailwind class, so a
                                `border-transparent` utility would never reach the
                                inner input — override the variables instead. */}
                            <PhoneInput
                                id="phone"
                                value={phone}
                                onChange={setPhone}
                                style={{
                                    '--react-international-phone-border-color': 'transparent',
                                    '--react-international-phone-background-color': 'var(--muted)',
                                } as React.CSSProperties}
                            />
                        </div>

                        {/* Preferred Section */}
                        <div className="space-y-2">
                            <Label htmlFor="preferred-section" className="flex items-center gap-2">
                                <MapPin className="h-4 w-4" />
                                Preferred Section
                            </Label>
                            <Input
                                id="preferred-section"
                                placeholder="e.g., Window, Patio, Bar"
                                value={preferredSection}
                                onChange={(e) => setPreferredSection(e.target.value)}
                                className={SHEET_FIELD}
                            />
                        </div>

                        {/* Quoted Wait Time */}
                        <div className="space-y-2">
                            <Label htmlFor="quoted-wait" className="flex items-center gap-2">
                                <Clock className="h-4 w-4" />
                                Quoted Wait Time (minutes)
                            </Label>
                            <Input
                                id="quoted-wait"
                                type="number"
                                min="0"
                                placeholder="Estimated wait time"
                                value={quotedWaitMinutes}
                                onChange={(e) => setQuotedWaitMinutes(e.target.value)}
                                className={SHEET_FIELD}
                            />
                        </div>

                        {/* Notes */}
                        <div className="space-y-2">
                            <Label htmlFor="notes" className="flex items-center gap-2">
                                <FileText className="h-4 w-4" />
                                Notes
                            </Label>
                            <Textarea
                                id="notes"
                                placeholder="Any special requests or notes..."
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                rows={3}
                                className={SHEET_FIELD}
                            />
                        </div>
                    </form>
                </BottomSheetBody>

                <BottomSheetFooter className="border-t-0">
                    <div className="flex gap-2 w-full">
                        <Button
                            variant="outline"
                            onClick={() => setOpen(false)}
                            disabled={isSubmitting}
                            className="flex-1"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            form="add-waitlist-form"
                            disabled={isSubmitting || !partyName.trim() || !partySize}
                            className="flex-1"
                        >
                            {isSubmitting ? 'Adding...' : 'Add to Waitlist'}
                        </Button>
                    </div>
                </BottomSheetFooter>
            </BottomSheetContent>
        </BottomSheet>
    )
}

