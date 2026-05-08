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
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, CalendarDays, Clock3, Crown, Loader2, Users } from 'lucide-react'
import { PhoneInput } from '@/components/ui/phone-input'
import { normalizePhone } from '@/lib/phone'
import { useCreateReservation } from '@/app/dashboard/hooks/useReservations'
import { detectReservationConflict } from '@/lib/reservations/conflict-detection'
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

type FormValues = z.infer<typeof schema>

interface CreateReservationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultDate: string
  existingReservations: Reservation[]
}

export default function CreateReservationDialog ({
  open,
  onOpenChange,
  defaultDate,
  existingReservations
}: CreateReservationDialogProps) {
  const [conflictWarning, setConflictWarning] = useState<ConflictResult | null>(
    null
  )
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [forceCreate, setForceCreate] = useState(false)

  const mutation = useCreateReservation(defaultDate)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      partyName: '',
      partySize: 2,
      phone: '',
      email: '',
      reservationDate: defaultDate,
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
    if (!open) return

    form.reset({
      partyName: '',
      partySize: 2,
      phone: '',
      email: '',
      reservationDate: defaultDate,
      reservationTime: '19:00',
      durationMinutes: 90,
      isVip: false,
      preferredSection: '',
      seatingPreference: '',
      notes: '',
      specialRequests: ''
    })
    setConflictWarning(null)
    setSubmitError(null)
    setForceCreate(false)
  }, [defaultDate, form, open])

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
      <DialogContent className='!h-[96vh] !w-[98vw] !max-w-[98vw] border-border/70 p-0 shadow-2xl sm:!max-w-[98vw] sm:overflow-hidden'>
        <DialogHeader className='border-b border-border/70 bg-gradient-to-r from-muted/40 via-background to-muted/20 px-6 py-4'>
          <div className='flex flex-col gap-3 text-left lg:flex-row lg:items-center lg:justify-between'>
            <div className='space-y-2 text-left'>
              <DialogTitle className='text-[1.65rem] font-semibold tracking-tight'>Create Reservation</DialogTitle>
              <DialogDescription className='max-w-2xl text-sm leading-relaxed'>
                Capture the guest, schedule, and seating details in one place without jumping through a cramped form.
              </DialogDescription>
            </div>
            <Badge variant='secondary' className='mt-0.5 inline-flex gap-1.5 self-start rounded-full px-3 py-1.5 text-xs font-medium'>
              <CalendarDays className='h-3.5 w-3.5' />
              {defaultDate}
            </Badge>
          </div>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit, onInvalidSubmit)} className='flex h-[calc(96vh-88px)] flex-col px-6 py-4 pb-6'>
            <div className='min-h-0 flex-1 overflow-y-auto pr-1'>
              <div className='space-y-4 pb-4'>
                {(conflictWarning || submitError) && (
                  <Alert variant='destructive'>
                    <AlertTriangle className='h-4 w-4' />
                    <AlertDescription>
                      {submitError ?? `Table conflict: ${conflictWarning?.reason}. You can go back and adjust the time, or create it anyway.`}
                    </AlertDescription>
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
                Required: party name, party size, phone, date, time, and duration.
              </div>
              {conflictWarning ? (
                <DialogFooter className='gap-2 border-0 pt-0'>
                  <Button
                    type='button'
                    variant='outline'
                    onClick={() => setConflictWarning(null)}
                  >
                    Go Back
                  </Button>
                  <Button
                    type='button'
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
                  <Button size='lg' className='min-w-48' type='submit' disabled={mutation.isPending}>
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
