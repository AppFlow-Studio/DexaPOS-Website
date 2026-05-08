'use client'

import * as React from 'react'
import { toast } from 'sonner'
import {
  BottomSheet,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetBody,
  BottomSheetFooter,
  BottomSheetTitle,
  BottomSheetDescription
} from '@/components/ui/bottom-sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { tenDigits } from '@/lib/phone'
import { Label } from '@/components/ui/label'
import { PhoneInput } from '@/components/ui/phone-input'
import { normalizePhone } from '@/lib/phone'
import { Textarea } from '@/components/ui/textarea'
import {
  Users,
  Phone,
  FileText,
  MapPin,
  Clock,
  Armchair,
  Trash2
} from 'lucide-react'
import {
  UpdateWaitlistEntryAction,
  DeleteWaitlistEntryAction
} from '@/app/dashboard/actions/floor-plan-actions'
import { useQueryClient } from '@tanstack/react-query'
import type { WaitlistEntry } from '@/types/floor-plan'

interface EditWaitlistDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  locationId: string
  entry: WaitlistEntry | null
  onSuccess?: () => void
}

export function EditWaitlistDialog ({
  open,
  onOpenChange,
  locationId,
  entry,
  onSuccess
}: EditWaitlistDialogProps) {
  const queryClient = useQueryClient()
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  const [partyName, setPartyName] = React.useState('')
  const [partySize, setPartySize] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [preferredSection, setPreferredSection] = React.useState('')
  const [seatingPreference, setSeatingPreference] = React.useState('')
  const [quotedWaitMinutes, setQuotedWaitMinutes] = React.useState('')

  React.useEffect(() => {
    if (!open || !entry) return

    setPartyName(entry.party_name || '')
    setPartySize(String(entry.party_size || ''))
    setPhone(tenDigits(entry.phone))
    setNotes(entry.notes || '')
    setPreferredSection(entry.preferred_section || '')
    setSeatingPreference(entry.seating_preference || '')
    setQuotedWaitMinutes(
      entry.quoted_wait_minutes !== undefined &&
        entry.quoted_wait_minutes !== null
        ? String(entry.quoted_wait_minutes)
        : ''
    )
  }, [open, entry])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!entry) return

    if (!partyName.trim()) {
      toast.error('Please enter a party name')
      return
    }

    const size = parseInt(partySize, 10)
    if (!size || size < 1) {
      toast.error('Please enter a valid party size')
      return
    }

    const parsedWait = quotedWaitMinutes.trim()
      ? parseInt(quotedWaitMinutes, 10)
      : undefined

    if (
      parsedWait !== undefined &&
      (Number.isNaN(parsedWait) || parsedWait < 0)
    ) {
      toast.error('Please enter a valid quoted wait time')
      return
    }

    setIsSubmitting(true)

    try {
      await UpdateWaitlistEntryAction(locationId, entry.id, {
        partyName: partyName.trim(),
        partySize: size,
        phone: (normalizePhone(phone) ?? phone.trim()) || undefined,
        notes: notes.trim() || undefined,
        preferredSection: preferredSection.trim() || undefined,
        seatingPreference: seatingPreference.trim() || undefined,
        quotedWaitMinutes: parsedWait
      })

      toast.success('Waitlist entry updated')
      await queryClient.invalidateQueries({
        queryKey: ['waitlist', locationId]
      })
      onOpenChange(false)
      onSuccess?.()
    } catch (error: any) {
      console.error('Error updating waitlist entry:', error)
      toast.error(error?.message || 'Failed to update waitlist entry')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!entry) return

    const confirmed = window.confirm(
      `Delete waitlist entry for ${entry.party_name}? This cannot be undone.`
    )

    if (!confirmed) return

    setIsSubmitting(true)

    try {
      await DeleteWaitlistEntryAction(locationId, entry.id)
      toast.success('Waitlist entry deleted')
      await queryClient.invalidateQueries({
        queryKey: ['waitlist', locationId]
      })
      onOpenChange(false)
      onSuccess?.()
    } catch (error: any) {
      console.error('Error deleting waitlist entry:', error)
      toast.error(error?.message || 'Failed to delete waitlist entry')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent className='max-h-[90vh]'>
        <BottomSheetHeader>
          <BottomSheetTitle>Edit Waitlist Entry</BottomSheetTitle>
          <BottomSheetDescription>
            Update this party&apos;s waitlist details
          </BottomSheetDescription>
        </BottomSheetHeader>

        <BottomSheetBody>
          <form
            onSubmit={handleSubmit}
            id='edit-waitlist-form'
            className='space-y-4'
          >
            <div className='space-y-2'>
              <Label
                htmlFor='edit-party-name'
                className='flex items-center gap-2'
              >
                <Users className='h-4 w-4' />
                Party Name <span className='text-destructive'>*</span>
              </Label>
              <Input
                id='edit-party-name'
                placeholder='Enter party name'
                value={partyName}
                onChange={e => setPartyName(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className='space-y-2'>
              <Label
                htmlFor='edit-party-size'
                className='flex items-center gap-2'
              >
                <Users className='h-4 w-4' />
                Party Size <span className='text-destructive'>*</span>
              </Label>
              <Input
                id='edit-party-size'
                type='number'
                min='1'
                placeholder='Number of guests'
                value={partySize}
                onChange={e => setPartySize(e.target.value)}
                required
              />
            </div>

            <div className='space-y-2'>
              <Label htmlFor='edit-phone' className='flex items-center gap-2'>
                <Phone className='h-4 w-4' />
                Phone Number
              </Label>
              <PhoneInput
                id='edit-phone'
                value={phone}
                onChange={setPhone}
              />
            </div>

            <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
              <div className='space-y-2'>
                <Label
                  htmlFor='edit-preferred-section'
                  className='flex items-center gap-2'
                >
                  <MapPin className='h-4 w-4' />
                  Preferred Section
                </Label>
                <Input
                  id='edit-preferred-section'
                  placeholder='Window, Patio, Bar'
                  value={preferredSection}
                  onChange={e => setPreferredSection(e.target.value)}
                />
              </div>

              <div className='space-y-2'>
                <Label
                  htmlFor='edit-seating-preference'
                  className='flex items-center gap-2'
                >
                  <Armchair className='h-4 w-4' />
                  Seating Preference
                </Label>
                <Input
                  id='edit-seating-preference'
                  placeholder='Booth, High Top'
                  value={seatingPreference}
                  onChange={e => setSeatingPreference(e.target.value)}
                />
              </div>
            </div>

            <div className='space-y-2'>
              <Label
                htmlFor='edit-quoted-wait'
                className='flex items-center gap-2'
              >
                <Clock className='h-4 w-4' />
                Quoted Wait Time (minutes)
              </Label>
              <Input
                id='edit-quoted-wait'
                type='number'
                min='0'
                placeholder='Estimated wait time'
                value={quotedWaitMinutes}
                onChange={e => setQuotedWaitMinutes(e.target.value)}
              />
            </div>

            <div className='space-y-2'>
              <Label htmlFor='edit-notes' className='flex items-center gap-2'>
                <FileText className='h-4 w-4' />
                Notes
              </Label>
              <Textarea
                id='edit-notes'
                placeholder='Any special requests or notes...'
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
              />
            </div>
          </form>
        </BottomSheetBody>

        <BottomSheetFooter>
          <div className='flex w-full gap-2'>
            <Button
              variant='destructive'
              onClick={handleDelete}
              disabled={isSubmitting || !entry}
            >
              <Trash2 className='h-4 w-4 mr-2' />
              Delete
            </Button>
            <Button
              variant='outline'
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className='flex-1'
            >
              Cancel
            </Button>
            <Button
              type='submit'
              form='edit-waitlist-form'
              disabled={isSubmitting || !partyName.trim() || !partySize}
              className='flex-1'
            >
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </BottomSheetFooter>
      </BottomSheetContent>
    </BottomSheet>
  )
}
