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
import {
  reservationStatusLabel,
  reservationStatusStyle
} from '@/lib/constants/reservation-status'
import { cn } from '@/lib/utils'

// Status colours come from `lib/constants/reservation-status` (D-11) so the
// sheet, the card and the list can never drift apart. The old local map also
// used `text-*-100` foregrounds, which are near-white — unreadable on the light
// tints they were paired with.

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

/**
 * One labelled figure. Borderless: a grid of bordered boxes inside an already
 * bordered section read as three competing frames. The tinted inset well
 * (§3.1) groups them without drawing any lines.
 */
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
    <div className='min-w-0 rounded-2xl border-0 bg-muted/50 px-4 py-3 shadow-none'>
      <div className='flex items-center gap-1.5 text-sm text-muted-foreground'>
        <Icon className='h-4 w-4 shrink-0' />
        <span className='truncate'>{label}</span>
      </div>
      <div className='mt-1 truncate text-sm font-medium text-foreground tabular-nums'>
        {value}
      </div>
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
        <SheetContent className='w-full overflow-y-auto border-0 bg-background p-0 sm:max-w-[560px]'>
          <div className='flex min-h-full flex-col'>
            <SheetHeader className='bg-background px-6 pb-2 pt-6'>
              <div className='space-y-4'>
                <div className='flex items-start justify-between gap-3 pr-8'>
                  <div className='min-w-0 space-y-2'>
                    <div className='flex items-center gap-2'>
                      <SheetTitle className='truncate text-2xl font-semibold tracking-tight'>
                        {displayedReservation.party_name}
                      </SheetTitle>
                      {displayedReservation.is_vip && (
                        <Badge className='shrink-0 gap-1 rounded-full border-0 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 shadow-none dark:bg-amber-900/20 dark:text-amber-400'>
                          <Star className='mr-1 h-3 w-3 fill-current' />
                          VIP
                        </Badge>
                      )}
                    </div>
                    <SheetDescription className='text-sm'>
                      Reservation #{displayedReservation.confirmation_number}
                    </SheetDescription>
                  </div>

                  {(() => {
                    const style = reservationStatusStyle(
                      displayedReservation.status
                    )
                    return (
                      <span
                        className={cn(
                          'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
                          style.bg,
                          style.text
                        )}
                      >
                        <span
                          className={cn(
                            'h-1.5 w-1.5 shrink-0 rounded-full',
                            style.dot
                          )}
                        />
                        {reservationStatusLabel(displayedReservation.status)}
                      </span>
                    )
                  })()}
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

            <div className='flex-1 space-y-6 px-6 py-5'>
              <section className='space-y-3 rounded-[24px] border-0 bg-card p-5 shadow-none'>
                <div className='flex items-center gap-2 text-[1.0625rem] font-semibold text-[#0C4FD1] dark:text-[#6CA0FF]'>
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
                <section className='space-y-3 rounded-[24px] border-0 bg-card p-5 shadow-none'>
                  <div className='flex items-center gap-2 text-[1.0625rem] font-semibold text-[#0C4FD1] dark:text-[#6CA0FF]'>
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
                <section className='space-y-3 rounded-[24px] border-0 bg-card p-5 shadow-none'>
                  {/* The section is named once here; the entries beneath use the
                      quiet sub-label so "Notes" does not appear twice in a row. */}
                  <div className='flex items-center gap-2 text-[1.0625rem] font-semibold text-[#0C4FD1] dark:text-[#6CA0FF]'>
                    Notes &amp; Requests
                  </div>
                  <div className='space-y-4'>
                    {displayedReservation.notes && (
                      <div className='space-y-1'>
                        <div className='text-sm text-muted-foreground'>
                          Notes
                        </div>
                        <p className='text-sm leading-6 text-foreground'>
                          {displayedReservation.notes}
                        </p>
                      </div>
                    )}
                    {displayedReservation.special_requests && (
                      <div className='space-y-1'>
                        <div className='text-sm text-muted-foreground'>
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
                <section className='space-y-3 rounded-[24px] border-0 bg-card p-5 shadow-none'>
                  <div className='flex items-center gap-2 text-[1.0625rem] font-semibold text-[#0C4FD1] dark:text-[#6CA0FF]'>
                    Cancellation
                  </div>
                  <p className='text-sm leading-6 text-foreground'>
                    {displayedReservation.cancellation_reason}
                  </p>
                </section>
              )}
            </div>

            <div className='mt-auto bg-background px-6 pb-6 pt-2'>
              <div className='space-y-3'>
                <Button
                  className='h-10 w-full rounded-full text-sm font-medium shadow-sm'
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
                        className='h-10 w-full rounded-full text-sm font-medium shadow-sm'
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
                        className='h-10 w-full rounded-full text-sm font-medium shadow-sm'
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
