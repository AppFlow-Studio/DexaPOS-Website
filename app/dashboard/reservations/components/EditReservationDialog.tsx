'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog'
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { PhoneInput } from '@/components/ui/phone-input'
import { isValidPhone, tenDigits } from '@/lib/phone'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Loader2 } from 'lucide-react'
import { useUpdateReservation } from '@/app/dashboard/hooks/useReservations'
import type { Reservation } from '@/types/floor-plan'

const schema = z.object({
  partyName: z.string().min(1, 'Name required'),
  partySize: z.coerce.number().int().min(1, 'Min 1').max(20, 'Max 20'),
  phone: z
    .string()
    .min(1, 'Phone required')
    .refine(isValidPhone, 'Enter a valid 10-digit US phone number'),
  email: z.string().email('Invalid email').or(z.literal('')).optional(),
  reservationDate: z.string().min(1, 'Date required'),
  reservationTime: z.string().min(1, 'Time required'),
  durationMinutes: z.coerce.number().int().min(15, 'Min 15 min').max(480, 'Max 480 min'),
  isVip: z.boolean().default(false),
  preferredSection: z.string().optional(),
  seatingPreference: z.string().optional(),
  notes: z.string().optional(),
  specialRequests: z.string().optional()
})

type FormValues = z.infer<typeof schema>

interface EditReservationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  reservation: Reservation | null
  date: string
  onSaved?: (updatedReservation: Reservation) => void
}

function normalizeTimeValue (time: string | undefined): string {
  if (!time) return '19:00'
  const parts = time.split(':')
  if (parts.length >= 2) {
    return `${parts[0]}:${parts[1]}`
  }
  return time
}

export default function EditReservationDialog ({
  open,
  onOpenChange,
  reservation,
  date,
  onSaved
}: EditReservationDialogProps) {
  const mutation = useUpdateReservation(date)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      partyName: '',
      partySize: 2,
      phone: '',
      email: '',
      reservationDate: date,
      reservationTime: '19:00',
      durationMinutes: 90,
      isVip: false,
      preferredSection: '',
      seatingPreference: '',
      notes: '',
      specialRequests: ''
    }
  })

  useEffect(() => {
    if (!open || !reservation) return

    form.reset({
      partyName: reservation.party_name,
      partySize: reservation.party_size,
      phone: tenDigits(reservation.phone),
      email: reservation.email ?? '',
      reservationDate: reservation.reservation_date ?? date,
      reservationTime: normalizeTimeValue(reservation.reservation_time),
      durationMinutes: reservation.duration_minutes ?? 90,
      isVip: reservation.is_vip,
      preferredSection: reservation.preferred_section ?? '',
      seatingPreference: reservation.seating_preference ?? '',
      notes: reservation.notes ?? '',
      specialRequests: reservation.special_requests ?? ''
    })
  }, [open, reservation, date, form])

  const onSubmit = async (values: FormValues) => {
    if (!reservation) return

    const updated = await mutation.mutateAsync({
      reservationId: reservation.id,
      params: {
        partyName: values.partyName,
        partySize: values.partySize,
        phone: values.phone,
        email: values.email || undefined,
        reservationDate: values.reservationDate,
        reservationTime: values.reservationTime,
        durationMinutes: values.durationMinutes,
        isVip: values.isVip,
        preferredSection: values.preferredSection || undefined,
        seatingPreference: values.seatingPreference || undefined,
        notes: values.notes || undefined,
        specialRequests: values.specialRequests || undefined
      }
    })

    onSaved?.(updated as Reservation)
    onOpenChange(false)
  }

  if (!reservation) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-md max-h-[90vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>Edit Reservation</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4'>
            <FormField
              control={form.control}
              name='partyName'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Party Name</FormLabel>
                  <FormControl>
                    <Input placeholder='Guest name' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className='grid grid-cols-2 gap-4'>
              <FormField
                control={form.control}
                name='partySize'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Party Size</FormLabel>
                    <FormControl>
                      <Input
                        type='number'
                        min={1}
                        max={20}
                        value={field.value ?? ''}
                        onChange={e =>
                          field.onChange(e.target.value === '' ? '' : parseInt(e.target.value, 10))
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='phone'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <PhoneInput
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name='email'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email (optional)</FormLabel>
                  <FormControl>
                    <Input
                      type='email'
                      placeholder='guest@example.com'
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className='grid grid-cols-2 gap-4'>
              <FormField
                control={form.control}
                name='reservationDate'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl>
                      <Input type='date' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='reservationTime'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Time</FormLabel>
                    <FormControl>
                      <Input type='time' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name='durationMinutes'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Duration (minutes)</FormLabel>
                  <FormControl>
                    <Input
                      type='number'
                      min={15}
                      max={480}
                      value={field.value ?? ''}
                      onChange={e =>
                        field.onChange(e.target.value === '' ? '' : parseInt(e.target.value, 10))
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className='grid grid-cols-2 gap-4'>
              <FormField
                control={form.control}
                name='preferredSection'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Preferred Section</FormLabel>
                    <FormControl>
                      <Input placeholder='Patio, Bar...' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='seatingPreference'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Seating Preference</FormLabel>
                    <FormControl>
                      <Input placeholder='Booth, Window...' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name='isVip'
              render={({ field }) => (
                <FormItem className='flex items-center gap-3'>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <FormLabel className='mt-0!'>VIP Guest</FormLabel>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='notes'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea rows={2} className='resize-none' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='specialRequests'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Special Requests</FormLabel>
                  <FormControl>
                    <Textarea rows={2} className='resize-none' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type='submit' disabled={mutation.isPending}>
                {mutation.isPending && (
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                )}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
