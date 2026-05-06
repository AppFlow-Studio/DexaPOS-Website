'use client'

import { useState } from 'react'
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
import { isValidPhone } from '@/lib/phone'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { PhoneInput } from '@/components/ui/phone-input'
import { isValidPhone, normalizePhone } from '@/lib/phone'
import { useCreateReservation } from '@/app/dashboard/hooks/useReservations'
import { detectReservationConflict } from '@/lib/reservations/conflict-detection'
import type { ConflictResult } from '@/lib/reservations/conflict-detection'
import type { Reservation } from '@/types/floor-plan'

const schema = z.object({
  partyName: z.string().min(1, 'Name required'),
  partySize: z.coerce.number().int().min(1, 'Min 1').max(20, 'Max 20'),
  phone: z.string().refine(v => !v || isValidPhone(v), { message: 'Enter a valid phone number' }),
  email: z.string().email('Invalid email').or(z.literal('')).optional(),
  reservationDate: z.string(),
  reservationTime: z.string(),
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

  const onSubmit = async (values: FormValues) => {
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
        return
      }
    }

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
    setForceCreate(false)
  }

  const handleCreateAnyway = () => {
    setForceCreate(true)
    setConflictWarning(null)
    form.handleSubmit(onSubmit)()
  }

  const handleClose = (open: boolean) => {
    if (!open) {
      form.reset()
      setConflictWarning(null)
      setForceCreate(false)
    }
    onOpenChange(open)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className='w-[calc(100vw-2rem)] max-w-md max-h-[90vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>New Reservation</DialogTitle>
        </DialogHeader>

        {conflictWarning && (
          <Alert variant='destructive'>
            <AlertTriangle className='h-4 w-4' />
            <AlertDescription>
              Table conflict: {conflictWarning.reason}. You can proceed anyway.
            </AlertDescription>
          </Alert>
        )}

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
                    <Textarea className='resize-none' rows={2} {...field} />
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
                    <Textarea className='resize-none' rows={2} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {conflictWarning ? (
              <DialogFooter className='gap-2'>
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
              <DialogFooter>
                <Button type='submit' disabled={mutation.isPending}>
                  {mutation.isPending && (
                    <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  )}
                  Create Reservation
                </Button>
              </DialogFooter>
            )}
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
