'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { isValidPhone, normalizePhone } from '@/lib/phone'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { DatePopover } from '@/app/dashboard/settings/tips/components/DatePopover'
import { AlertTriangle, CalendarDays, Clock3, Crown, Loader2, Users } from 'lucide-react'
import { useCreateReservation } from '@/app/dashboard/hooks/useReservations'
import { detectReservationConflict } from '@/lib/reservations/conflict-detection'
import {
  DEFAULT_RESERVATION_TIMEZONE,
  isPastAtLocation,
  zonedToday
} from '@/lib/reservations/local-time'
import { toast } from 'sonner'
import type { ConflictResult } from '@/lib/reservations/conflict-detection'
import type { Reservation } from '@/types/floor-plan'

const schema = z.object({
  partyName: z.string().min(1, 'Name required'),
  partySize: z.coerce.number().int().min(1, 'Min 1').max(20, 'Max 20'),
  phone: z
    .string()
    .min(1, 'Phone required')
    .refine(value => normalizePhone(value) !== null, {
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

/**
 * The `create_reservation` RPC rejects a past booking with a bare `P0001`,
 * which reaches the user as an unreadable
 * `{code: "P0001", details: Null, hint: ...}` toast. Validating the same rule
 * here turns it into an inline message on the field that is actually wrong,
 * and the request is never sent.
 *
 * Bound to the LOCATION's timezone, not the browser's — see `local-time.ts`.
 */
const makeSchema = (timeZone: string) =>
  schema.superRefine((values, ctx) => {
    if (!values.reservationDate || !values.reservationTime) return
    if (isPastAtLocation(values.reservationDate, values.reservationTime, timeZone)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reservationTime'],
        message: 'Reservation must be in the future'
      })
    }
  })

type FormValues = z.infer<typeof schema>

interface CreateReservationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultDate: string
  existingReservations: Reservation[]
  /** IANA zone of the location the booking belongs to. */
  timeZone?: string
}

export default function CreateReservationDialog ({
  open,
  onOpenChange,
  defaultDate,
  existingReservations,
  timeZone = DEFAULT_RESERVATION_TIMEZONE
}: CreateReservationDialogProps) {
  const [conflictWarning, setConflictWarning] = useState<ConflictResult | null>(
    null
  )
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [forceCreate, setForceCreate] = useState(false)

  const mutation = useCreateReservation(defaultDate)

  // The page's date selector browses history too, so `defaultDate` can be a
  // past day. Pre-filling it there would seed the form with a value that can
  // never submit, so a past day falls forward to today.
  const localToday = zonedToday(timeZone)
  const initialDate = defaultDate < localToday ? localToday : defaultDate

  const blankValues = {
    partyName: '',
    partySize: 2,
    phone: '',
    email: '',
    reservationDate: initialDate,
    reservationTime: '19:00',
    durationMinutes: 90,
    isVip: false,
    preferredSection: '',
    seatingPreference: '',
    notes: '',
    specialRequests: ''
  }

  const form = useForm<FormValues>({
    resolver: zodResolver(makeSchema(timeZone)),
    defaultValues: blankValues
  })

  // `blankValues` is rebuilt every render, so it is deliberately NOT a
  // dependency — including it would reset the form on each keystroke. The
  // effect only needs to re-run when the dialog opens or the day changes, and
  // it reads the current values through the closure at that point.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return

    form.reset(blankValues)
    setConflictWarning(null)
    setSubmitError(null)
    setForceCreate(false)
  }, [defaultDate, form, open, initialDate])

  const onSubmit = async (values: FormValues) => {
    setSubmitError(null)

    if (!forceCreate) {
      const conflict = detectReservationConflict(
        {
          reservationDate: values.reservationDate,
          reservationTime: values.reservationTime,
          durationMinutes: values.durationMinutes,
          assignedTableIds: []
        },
        existingReservations
      )
      if (conflict) {
        setConflictWarning(conflict)
        setSubmitError('This reservation conflicts with an existing booking.')
        return
      }
    }

    try {
      await mutation.mutateAsync({
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
        notes: values.notes,
        specialRequests: values.specialRequests || undefined
      })
      onOpenChange(false)
      form.reset()
      setConflictWarning(null)
      setSubmitError(null)
      setForceCreate(false)
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'Unable to create reservation.'
      )
    }
  }

  const onInvalidSubmit = () => {
    const firstError = Object.values(form.formState.errors)[0]
    const message =
      firstError?.message && typeof firstError.message === 'string'
        ? firstError.message
        : 'Please fill in the required fields before creating the reservation.'

    setSubmitError(message)
    toast.error(message)
  }

  const handleCreateAnyway = () => {
    setForceCreate(true)
    setConflictWarning(null)
    setSubmitError(null)
    form.handleSubmit(onSubmit, onInvalidSubmit)()
  }

  const handleClose = (open: boolean) => {
    if (!open) {
      form.reset()
      setConflictWarning(null)
      setSubmitError(null)
      setForceCreate(false)
    }
    onOpenChange(open)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      {/* Mobile: keep the primitive's full-bleed sheet (full width, flush to
          the edges) but drop its `h-dvh` + own `overflow-y-auto`. Height then
          follows content up to the viewport, so a short form has no dead space
          below it and the form's scroller is the only one. */}
      <DialogContent className='soft-form-fields flex max-h-[92vh] flex-col gap-0 overflow-hidden rounded-[32px] border-0 p-0 shadow-none sm:!max-w-3xl max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:h-auto max-sm:max-h-[92dvh] max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:overflow-hidden max-sm:rounded-b-none max-sm:rounded-t-[28px]'>
        <DialogHeader className='shrink-0 px-6 pt-6 pb-2'>
          {/* Stacks on mobile: side by side, the narrow screen squeezed the
              title column until "Create Reservation" broke over three lines.
              `pr-12` clears the close button at `top-4 right-4` (size-8). */}
          <div className='flex flex-col gap-2 pr-12 text-left sm:flex-row sm:items-center sm:justify-between sm:gap-3'>
            <div className='min-w-0'>
              <DialogTitle className='text-[1.0625rem] font-semibold tracking-[-0.01em]'>
                Create Reservation
              </DialogTitle>
              <DialogDescription className='mt-1 text-sm text-muted-foreground'>
                Fill in guest, schedule and seating details.
              </DialogDescription>
            </div>
            <span className='inline-flex shrink-0 items-center gap-1.5 self-start rounded-full bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-muted-foreground tabular-nums'>
              <CalendarDays className='h-3.5 w-3.5' />
              {defaultDate}
            </span>
          </div>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit, onInvalidSubmit)}
            className='flex min-h-0 flex-1 flex-col'
          >
            <div className='min-h-0 flex-1 overflow-y-auto'>
                {(conflictWarning || submitError) && (
                  <div className='px-6 pt-5'>
                    <Alert variant='destructive' className='rounded-2xl'>
                      <AlertTriangle className='h-4 w-4' />
                      <AlertDescription>
                        {submitError ?? `Table conflict: ${conflictWarning?.reason}. You can go back and adjust the time, or create it anyway.`}
                      </AlertDescription>
                    </Alert>
                  </div>
                )}

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
                      // Half width but still alone on its row: the row stays a
                      // full-width grid and the field caps at half, so the
                      // Time/Duration pair below keeps its own alignment.
                      <FormItem className='sm:max-w-[calc(50%-0.5rem)]'>
                        <FormLabel>Date</FormLabel>
                        <FormControl>
                          <DatePopover
                            value={field.value}
                            onChange={value => field.onChange(value ?? '')}
                            min={localToday}
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
                            {/* Native time input on purpose. Its dropdown is
                                browser UI that CSS cannot reach, but the field
                                box itself takes our radius via
                                `.soft-form-fields` — a custom panel here read
                                as a full-width sheet rather than a field. */}
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
                  <div className='grid gap-4 sm:grid-cols-2'>
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
                          <div className='min-w-0 space-y-1'>
                            <FormLabel className='mt-0 text-sm'>VIP Guest</FormLabel>
                            <p className='text-[0.8125rem] text-muted-foreground'>
                              Highlight this guest in the reservation list.
                            </p>
                          </div>
                          <FormControl>
                            {/* The default switch is h-[1.15rem] with a
                                `bg-input` off-track, which all but vanishes
                                against the tinted well behind it. Bigger, with
                                a ring and a darker off-state, so "off" reads as
                                a control rather than as background. */}
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

            <div className='flex shrink-0 flex-col gap-3 px-6 pt-2 pb-6 sm:flex-row sm:items-center sm:justify-between'>
              <p className='text-[0.8125rem] text-muted-foreground'>
                Required: party name, party size, phone, date, time, and duration.
              </p>
              {conflictWarning ? (
                <DialogFooter className='flex-row gap-2 border-0 pt-0'>
                  <Button
                    type='button'
                    variant='outline'
                    className='h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm'
                    onClick={() => setConflictWarning(null)}
                  >
                    Go Back
                  </Button>
                  <Button
                    type='button'
                    className='h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm'
                    onClick={handleCreateAnyway}
                    disabled={mutation.isPending}
                  >
                    {mutation.isPending && (
                      <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                    )}
                    Create Anyway
                  </Button>
                </DialogFooter>
              ) : (
                <DialogFooter className='border-0 pt-0'>
                  <Button
                    type='submit'
                    className='h-9 w-full rounded-full px-5 text-[0.8125rem] font-medium shadow-sm sm:w-auto'
                    disabled={mutation.isPending}
                  >
                    {mutation.isPending && (
                      <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                    )}
                    Create Reservation
                  </Button>
                </DialogFooter>
              )}
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
