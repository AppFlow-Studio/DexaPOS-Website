'use client'

import { useEffect, useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, Pencil, Phone, Clock3, Users, Star, Armchair, Hash } from 'lucide-react'
import {
  useCancelReservation,
  useUpdateReservationStatus
} from '@/app/dashboard/hooks/useReservations'
import CancelReservationDialog from './CancelReservationDialog'
import EditReservationDialog from './EditReservationDialog'
import type { Reservation } from '@/types/floor-plan'
import { formatPhoneForDisplay } from '@/lib/phone'
import { cn } from '@/lib/utils'

const STATUS_COLORS: Record<Reservation['status'], string> = {
  pending: 'border-amber-200 bg-amber-50/90 text-amber-900',
  confirmed: 'border-sky-200 bg-sky-50/90 text-sky-900',
  reminded: 'border-fuchsia-200 bg-fuchsia-50/90 text-fuchsia-900',
  arrived: 'border-orange-200 bg-orange-50/90 text-orange-900',
  seated: 'border-emerald-200 bg-emerald-50/90 text-emerald-900',
  completed: 'border-slate-200 bg-slate-100/90 text-slate-700',
  no_show: 'border-rose-200 bg-rose-50/90 text-rose-900',
  cancelled: 'border-rose-200 bg-rose-50/90 text-rose-900'
}

type StatusTransition = {
  label: string
  status: Reservation['status']
}

const STATUS_TRANSITIONS: Partial<
  Record<Reservation['status'], StatusTransition[]>
> = {
  pending: [
    { label: 'Confirm', status: 'confirmed' },
    { label: 'Mark No-Show', status: 'no_show' }
  ],
  confirmed: [
    { label: 'Mark Arrived', status: 'arrived' },
    { label: 'Mark No-Show', status: 'no_show' }
  ],
  reminded: [
    { label: 'Mark Arrived', status: 'arrived' },
    { label: 'Mark No-Show', status: 'no_show' }
  ],
  arrived: [
    { label: 'Complete', status: 'completed' }
  ]
}

const CANCELLABLE_STATUSES: Reservation['status'][] = [
  'pending',
  'confirmed',
  'reminded',
  'arrived'
]

interface ReservationDetailSheetProps {
  reservation: Reservation | null
  open: boolean
  onOpenChange: (open: boolean) => void
  date: string
}

function formatStatus (status: Reservation['status']) {
  if (status === 'no_show') return 'No-Show'
  return status.replace('_', ' ')
}

function DetailItem ({
  icon: Icon,
  label,
  value
}: {
  icon: typeof Clock3
  label: string
  value?: string | null
}) {
  if (!value) return null

  return (
    <div className='rounded-xl border border-border/70 bg-card px-3 py-3'>
      <div className='mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground'>
        <Icon className='h-3.5 w-3.5' />
        {label}
      </div>
      <div className='text-sm font-medium text-foreground'>{value}</div>
    </div>
  )
}

export default function ReservationDetailSheet ({
  reservation,
  open,
  onOpenChange,
  date
}: ReservationDetailSheetProps) {
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [displayedReservation, setDisplayedReservation] = useState(reservation)
  const [pendingStatus, setPendingStatus] = useState<Reservation['status'] | null>(
    null
  )
  const updateStatus = useUpdateReservationStatus(date)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _cancelMutation = useCancelReservation(date)

  useEffect(() => {
    setDisplayedReservation(reservation)
    setPendingStatus(null)
  }, [reservation])

  if (!reservation || !displayedReservation) return null

  const handleStatusChange = (newStatus: Reservation['status']) => {
    setPendingStatus(newStatus)

    updateStatus.mutate(
      { reservationId: reservation.id, status: newStatus },
      {
        onSuccess: () => {
          setDisplayedReservation(prev =>
            prev ? { ...prev, status: newStatus } : prev
          )
          setPendingStatus(null)
        },
        onError: () => {
          setPendingStatus(null)
        }
      }
    )
  }

  const transitions = STATUS_TRANSITIONS[displayedReservation.status] ?? []
  const canCancel = CANCELLABLE_STATUSES.includes(displayedReservation.status)
  const isTerminal = ['completed', 'cancelled', 'no_show'].includes(
    displayedReservation.status
  )

  const formatTimestamp = (iso?: string) => {
    if (!iso) return null
    return new Date(iso).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const seatingSummary =
    displayedReservation.assigned_tables &&
    displayedReservation.assigned_tables.length > 0
      ? displayedReservation.assigned_tables.join(', ')
      : 'No tables assigned'

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className='w-full overflow-y-auto border-l border-border/70 bg-background p-0 sm:max-w-[560px]'>
          <div className='flex min-h-full flex-col'>
            <SheetHeader className='border-b border-border/70 bg-background/95 px-6 py-5'>
              <div className='space-y-4'>
                <div className='flex items-start justify-between gap-3 pr-8'>
                  <div className='min-w-0 space-y-2'>
                    <div className='flex items-center gap-2'>
                      <SheetTitle className='truncate text-2xl font-semibold tracking-tight'>
                        {displayedReservation.party_name}
                      </SheetTitle>
                      {displayedReservation.is_vip && (
                        <Badge className='border-amber-200 bg-amber-50 text-amber-900'>
                          <Star className='mr-1 h-3 w-3 fill-current' />
                          VIP
                        </Badge>
                      )}
                    </div>
                    <SheetDescription className='text-sm'>
                      Reservation #{displayedReservation.confirmation_number}
                    </SheetDescription>
                  </div>

                  <Badge
                    className={cn(
                      'border px-2.5 py-1 capitalize shadow-sm',
                      STATUS_COLORS[displayedReservation.status]
                    )}
                  >
                    {formatStatus(displayedReservation.status)}
                  </Badge>
                </div>

                <div className='grid gap-3 sm:grid-cols-3'>
                  <DetailItem
                    icon={Clock3}
                    label='Time'
                    value={displayedReservation.reservation_time}
                  />
                  <DetailItem
                    icon={Users}
                    label='Party'
                    value={`${displayedReservation.party_size} ${
                      displayedReservation.party_size === 1 ? 'guest' : 'guests'
                    }`}
                  />
                  <DetailItem
                    icon={Phone}
                    label='Phone'
                    value={formatPhoneForDisplay(displayedReservation.phone)}
                  />
                </div>
              </div>
            </SheetHeader>

            <div className='flex-1 space-y-6 bg-muted/10 px-6 py-5'>
              <section className='space-y-3 rounded-2xl border border-border/70 bg-card p-4'>
                <div className='text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground'>
                  Details
                </div>
                <div className='grid gap-3 sm:grid-cols-2'>
                  <DetailItem
                    icon={Hash}
                    label='Date'
                    value={displayedReservation.reservation_date}
                  />
                  <DetailItem
                    icon={Clock3}
                    label='Duration'
                    value={`${displayedReservation.duration_minutes} min`}
                  />
                  <DetailItem
                    icon={Phone}
                    label='Email'
                    value={displayedReservation.email}
                  />
                  <DetailItem
                    icon={Armchair}
                    label='Tables'
                    value={seatingSummary}
                  />
                  <DetailItem
                    icon={Armchair}
                    label='Section'
                    value={displayedReservation.preferred_section}
                  />
                  <DetailItem
                    icon={Armchair}
                    label='Seating'
                    value={displayedReservation.seating_preference}
                  />
                </div>
              </section>

              {(displayedReservation.arrived_at ||
                displayedReservation.seated_at) && (
                <section className='space-y-3 rounded-2xl border border-border/70 bg-card p-4'>
                  <div className='text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground'>
                    Service Timeline
                  </div>
                  <div className='grid gap-3 sm:grid-cols-2'>
                    <DetailItem
                      icon={Clock3}
                      label='Arrived'
                      value={formatTimestamp(displayedReservation.arrived_at)}
                    />
                    <DetailItem
                      icon={Clock3}
                      label='Seated'
                      value={formatTimestamp(displayedReservation.seated_at)}
                    />
                  </div>
                </section>
              )}

              {(displayedReservation.notes ||
                displayedReservation.special_requests) && (
                <section className='space-y-3 rounded-2xl border border-border/70 bg-card p-4'>
                  <div className='text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground'>
                    Notes
                  </div>
                  <div className='space-y-3'>
                    {displayedReservation.notes && (
                      <div className='space-y-2'>
                        <div className='text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground'>
                          Notes
                        </div>
                        <p className='text-sm leading-6 text-foreground'>
                          {displayedReservation.notes}
                        </p>
                      </div>
                    )}
                    {displayedReservation.special_requests && (
                      <div className='space-y-2'>
                        <div className='text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground'>
                          Special Requests
                        </div>
                        <p className='text-sm leading-6 text-foreground'>
                          {displayedReservation.special_requests}
                        </p>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {displayedReservation.cancellation_reason && (
                <section className='space-y-3 rounded-2xl border border-border/70 bg-card p-4'>
                  <div className='text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground'>
                    Cancellation
                  </div>
                  <p className='text-sm leading-6 text-foreground'>
                    {displayedReservation.cancellation_reason}
                  </p>
                </section>
              )}
            </div>

            <div className='mt-auto border-t border-border/70 bg-background/95 px-6 py-5'>
              <div className='space-y-3'>
                <Button
                  className='w-full'
                  variant='secondary'
                  onClick={() => setEditDialogOpen(true)}
                >
                  <Pencil className='mr-2 h-4 w-4' />
                  Edit Reservation
                </Button>

                {isTerminal ? (
                  <p className='text-sm text-muted-foreground'>
                    No further actions available.
                  </p>
                ) : (
                  <>
                    {transitions.map(t => (
                      <Button
                        key={t.status}
                        className='w-full'
                        variant='outline'
                        disabled={updateStatus.isPending}
                        onClick={() => handleStatusChange(t.status)}
                      >
                        {pendingStatus === t.status && (
                          <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                        )}
                        {t.label}
                      </Button>
                    ))}
                    {canCancel && (
                      <Button
                        className='w-full'
                        variant='destructive'
                        onClick={() => setCancelDialogOpen(true)}
                      >
                        Cancel Reservation
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <CancelReservationDialog
        open={cancelDialogOpen}
        onOpenChange={open => {
          setCancelDialogOpen(open)
          if (!open) onOpenChange(false)
        }}
        reservationId={reservation.id}
        partyName={reservation.party_name}
        date={date}
      />

      <EditReservationDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        reservation={displayedReservation}
        date={date}
        onSaved={updated => {
          setDisplayedReservation(prev => {
            if (!prev) return updated
            return { ...prev, ...updated }
          })
        }}
      />
    </>
  )
}
