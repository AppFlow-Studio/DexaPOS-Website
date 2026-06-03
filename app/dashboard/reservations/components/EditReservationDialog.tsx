'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { PhoneInput } from '@/components/ui/phone-input'
import { isValidPhone, normalizePhone, phoneDigits } from '@/lib/phone'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, CalendarDays, Clock3, Crown, Loader2, Users } from 'lucide-react'
import { useUpdateReservation } from '@/app/dashboard/hooks/useReservations'
import { toast } from 'sonner'
import type { Reservation } from '@/types/floor-plan'

const schema = z.object({
  partyName: z.string().min(1, 'Name required'),
  partySize: z.coerce.number().int().min(1, 'Min 1').max(500, 'Max 500'),
  phone: z
    .string()
    .min(1, 'Phone required')
    .refine(value => isValidPhone(value), {
      message: 'Enter a valid phone number'
    }),
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
  const [submitError, setSubmitError] = useState<string | null>(null)
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
      phone: phoneDigits(reservation.phone),
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
    setSubmitError(null)
  }, [open, reservation, date, form])

  const onSubmit = async (values: FormValues) => {
    if (!reservation) return

    setSubmitError(null)

    try {
      const updated = await mutation.mutateAsync({
        reservationId: reservation.id,
        params: {
          partyName: values.partyName,
          partySize: values.partySize,
          phone: normalizePhone(values.phone) ?? values.phone,
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
      setSubmitError(null)
      onOpenChange(false)
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'Unable to update reservation.'
      )
    }
  }

  const onInvalidSubmit = () => {
    const firstError = Object.values(form.formState.errors)[0]
    const message =
      firstError?.message && typeof firstError.message === 'string'
        ? firstError.message
        : 'Please fill in the required fields before saving changes.'

    setSubmitError(message)
    toast.error(message)
  }

  if (!reservation) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        elevation='high'
        overlayClassName='z-[260]'
        className='!h-[96vh] !w-[98vw] !max-w-[98vw] z-[261] border-border/70 p-0 shadow-2xl sm:!max-w-[98vw] sm:overflow-hidden'
      >
        <DialogHeader className='border-b border-border/70 bg-gradient-to-r from-muted/40 via-background to-muted/20 px-6 py-4'>
          <div className='flex flex-col gap-3 text-left lg:flex-row lg:items-center lg:justify-between'>
            <div className='space-y-2 text-left'>
              <DialogTitle className='text-[1.65rem] font-semibold tracking-tight'>Edit Reservation</DialogTitle>
              <DialogDescription className='max-w-2xl text-sm leading-relaxed'>
                Update the guest, schedule, and seating details without leaving the reservation flow.
              </DialogDescription>
            </div>
            <Badge variant='secondary' className='mt-0.5 inline-flex gap-1.5 self-start rounded-full px-3 py-1.5 text-xs font-medium'>
              <CalendarDays className='h-3.5 w-3.5' />
              {reservation.reservation_date ?? date}
            </Badge>
          </div>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit, onInvalidSubmit)} className='flex h-[calc(96vh-88px)] flex-col px-6 py-4 pb-6'>
            <div className='min-h-0 flex-1 overflow-y-auto pr-1'>
              <div className='space-y-4 pb-4'>
                {submitError && (
                  <Alert variant='destructive'>
                    <AlertTriangle className='h-4 w-4' />
                    <AlertDescription>{submitError}</AlertDescription>
                  </Alert>
                )}

                <div className='grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.95fr)_minmax(0,0.9fr)]'>
                  <section className='min-w-0 rounded-2xl border border-border/70 bg-background p-4'>
                    <div className='mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground'>
                      <Users className='h-4 w-4' />
                      Guest Details
                    </div>
                    <div className='grid gap-4'>
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

                      <div className='grid gap-4 xl:grid-cols-[140px_minmax(0,1fr)]'>
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
                                  max={500}
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
                            <FormItem className='min-w-0'>
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
                            <FormLabel>Email</FormLabel>
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
                    </div>
                  </section>

                  <section className='min-w-0 rounded-2xl border border-border/70 bg-background p-4'>
                    <div className='mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground'>
                      <Clock3 className='h-4 w-4' />
                      Schedule
                    </div>
                    <div className='grid gap-4'>
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

                      <div className='grid gap-4 xl:grid-cols-2'>
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
                      </div>
                    </div>
                  </section>

                  <section className='min-w-0 rounded-2xl border border-border/70 bg-muted/20 p-4'>
                    <div className='mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground'>
                      <Crown className='h-4 w-4' />
                      Preferences
                    </div>
                    <div className='grid gap-4'>
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

                      <div className='grid gap-4 xl:grid-cols-2'>
                        <FormField
                          control={form.control}
                          name='notes'
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Notes</FormLabel>
                              <FormControl>
                                <Textarea className='min-h-20 resize-none' rows={3} {...field} />
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
                                <Textarea className='min-h-20 resize-none' rows={3} {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name='isVip'
                          render={({ field }) => (
                            <FormItem className='flex items-center justify-between gap-4 rounded-xl border border-border/70 bg-background px-4 py-3 xl:col-span-2'>
                              <div className='space-y-1'>
                                <FormLabel className='mt-0 text-sm'>VIP Guest</FormLabel>
                                <p className='text-xs text-muted-foreground'>
                                  Highlight this guest in the reservation list.
                                </p>
                              </div>
                              <FormControl>
                                <Switch
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            </div>

            <div className='mt-2 flex shrink-0 items-center justify-between gap-4 rounded-2xl border border-border/70 bg-muted/20 px-5 py-3'>
              <div className='text-xs text-muted-foreground'>
                Update the reservation details and save the changes when you are done.
              </div>
              <DialogFooter className='border-0 pt-0'>
                <Button
                  size='lg'
                  className='min-w-48'
                  type='submit'
                  disabled={mutation.isPending}
                >
                  {mutation.isPending && (
                    <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  )}
                  Save Changes
                </Button>
              </DialogFooter>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
