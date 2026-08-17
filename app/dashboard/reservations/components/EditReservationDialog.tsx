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
import { AlertTriangle, CalendarDays, Clock3, Crown, Loader2, Users } from 'lucide-react'
import { DatePopover } from '@/components/ui/date-popover'
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
        // Mobile: full-width bottom sheet. `dialog.tsx` pins mobile to `h-dvh`
        // with its own `overflow-y-auto`, which forced full viewport height
        // regardless of content (dead space below the form) and nested a second
        // scroller inside the form's own. `h-auto` sizes to content instead.
        className='soft-form-fields flex max-h-[92vh] flex-col gap-0 overflow-hidden rounded-[32px] border-0 p-0 shadow-none z-[261] sm:!max-w-3xl max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:h-auto max-sm:max-h-[92dvh] max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:overflow-hidden max-sm:rounded-b-none max-sm:rounded-t-[28px]'
      >
        <DialogHeader className='shrink-0 px-6 pt-6 pb-2'>
          {/* `pr-12` keeps the date chip clear of the absolutely-positioned
              close button, which sits at `top-4 right-4` in `dialog.tsx`. */}
          <div className='flex flex-col gap-3 pr-12 text-left lg:flex-row lg:items-center lg:justify-between'>
            <div className='space-y-2 text-left'>
              <DialogTitle className='text-[1.0625rem] font-semibold tracking-[-0.01em]'>Edit Reservation</DialogTitle>
              <DialogDescription className='max-w-2xl text-sm leading-relaxed'>
                Update the guest, schedule, and seating details without leaving the reservation flow.
              </DialogDescription>
            </div>
            <span className='inline-flex shrink-0 items-center gap-1.5 self-start rounded-full bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-muted-foreground tabular-nums'>
              <CalendarDays className='h-3.5 w-3.5' />
              {reservation.reservation_date ?? date}
            </span>
          </div>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit, onInvalidSubmit)} className='flex min-h-0 flex-1 flex-col'>
            <div className='min-h-0 flex-1 overflow-y-auto'>
              <div>
                {submitError && (
                  <Alert variant='destructive' className='mx-6 mt-5 w-auto rounded-2xl'>
                    <AlertTriangle className='h-4 w-4' />
                    <AlertDescription>{submitError}</AlertDescription>
                  </Alert>
                )}

                <div>
                  <section className='min-w-0 px-6 py-6'>
                    <div className='mb-4 flex items-center gap-2 text-[1.0625rem] font-semibold text-[#0C4FD1] dark:text-[#6CA0FF]'>
                      <Users className='h-[1.125rem] w-[1.125rem] shrink-0' />
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

                      <div className='grid gap-4 sm:grid-cols-[140px_minmax(0,1fr)]'>
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

                  <section className='min-w-0 px-6 py-6'>
                    <div className='mb-4 flex items-center gap-2 text-[1.0625rem] font-semibold text-[#0C4FD1] dark:text-[#6CA0FF]'>
                      <Clock3 className='h-[1.125rem] w-[1.125rem] shrink-0' />
                      Schedule
                    </div>
                    <div className='grid gap-4'>
                      <FormField
                        control={form.control}
                        name='reservationDate'
                        render={({ field }) => (
                          <FormItem className='sm:max-w-[calc(50%-0.5rem)]'>
                            <FormLabel>Date</FormLabel>
                            <FormControl>
                              <DatePopover
                                value={field.value}
                                onChange={value => field.onChange(value ?? '')}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className='grid gap-4 sm:grid-cols-2'>
                        <FormField
                          control={form.control}
                          name='reservationTime'
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Time</FormLabel>
                              <FormControl>
                                {/* Native — see the note in CreateReservationDialog. */}
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

                  <section className='min-w-0 px-6 py-6'>
                    <div className='mb-4 flex items-center gap-2 text-[1.0625rem] font-semibold text-[#0C4FD1] dark:text-[#6CA0FF]'>
                      <Crown className='h-[1.125rem] w-[1.125rem] shrink-0' />
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

                      <div className='grid gap-4 sm:grid-cols-2'>
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
                            <FormItem className='flex items-center justify-between gap-4 rounded-[24px] border-0 bg-muted/40 px-4 py-3 shadow-none sm:col-span-2'>
                              <div className='space-y-1'>
                                <FormLabel className='mt-0 text-sm'>VIP Guest</FormLabel>
                                <p className='text-xs text-muted-foreground'>
                                  Highlight this guest in the reservation list.
                                </p>
                              </div>
                              <FormControl>
                                {/* Larger with a visible off-state — the default
                                    switch all but disappears on a tinted well. */}
                                <Switch
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                  className='h-6 w-11 shrink-0 ring-1 ring-border data-[state=checked]:bg-[#0C4FD1] dark:data-[state=checked]:bg-[#6CA0FF] data-[state=unchecked]:bg-muted-foreground/35 dark:data-[state=unchecked]:bg-muted-foreground/40 [&>[data-slot=switch-thumb]]:size-5 [&>[data-slot=switch-thumb]]:bg-background [&>[data-slot=switch-thumb]]:shadow-sm'
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

            <div className='flex shrink-0 flex-col gap-3 px-6 pb-6 pt-2 sm:flex-row sm:items-center sm:justify-between'>
              <p className='text-[0.8125rem] text-muted-foreground'>
                Update the reservation details and save the changes when you are done.
              </p>
              <DialogFooter className='border-0 pt-0'>
                <Button
                  className='h-9 w-full rounded-full px-5 text-[0.8125rem] font-medium shadow-sm sm:w-auto'
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
