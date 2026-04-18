'use client'

import { useState, useEffect } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Star, Loader2, Pencil } from 'lucide-react'
import {
  useUpdateReservationStatus,
  useCancelReservation
} from '@/app/dashboard/hooks/useReservations'
import CancelReservationDialog from './CancelReservationDialog'
import EditReservationDialog from './EditReservationDialog'
import type { Reservation } from '@/types/floor-plan'

const STATUS_COLORS: Record<Reservation['status'], string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-blue-100 text-blue-800',
  reminded: 'bg-purple-100 text-purple-800',
  arrived: 'bg-orange-100 text-orange-800',
  seated: 'bg-green-100 text-green-800',
  completed: 'bg-gray-100 text-gray-600',
  no_show: 'bg-red-100 text-red-800',
  cancelled: 'bg-red-100 text-red-800'
}

type StatusTransition = {
  label: string
  status: Reservation['status']
}

const STATUS_TRANSITIONS: Partial<
  Record<Reservation['status'], StatusTransition[]>
> = {
  pending: [{ label: 'Confirm', status: 'confirmed' }],
  confirmed: [{ label: 'Mark Arrived', status: 'arrived' }],
  reminded: [{ label: 'Mark Arrived', status: 'arrived' }],
  arrived: [
    { label: 'Complete', status: 'completed' },
    { label: 'Mark No-Show', status: 'no_show' }
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

function InfoRow ({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div className='flex justify-between text-sm'>
      <span className='text-muted-foreground'>{label}</span>
      <span className='font-medium text-right max-w-[60%]'>{value}</span>
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
  const updateStatus = useUpdateReservationStatus(date)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _cancelMutation = useCancelReservation(date)

  // Sync displayed reservation with prop updates
  useEffect(() => {
    setDisplayedReservation(reservation)
  }, [reservation])

  if (!reservation || !displayedReservation) return null

  const handleStatusChange = (newStatus: Reservation['status']) => {
    // Optimistically update the displayed reservation
    setDisplayedReservation({ ...displayedReservation, status: newStatus })

    // Then mutate to server
    updateStatus.mutate(
      { reservationId: reservation.id, status: newStatus },
      {
        onError: () => {
          // Revert on error
          setDisplayedReservation(reservation)
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

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className='w-full sm:max-w-md overflow-y-auto p-6'>
          <SheetHeader className='mb-6 space-y-3'>
            <SheetTitle className='flex items-center gap-2 text-lg'>
              {displayedReservation.party_name}
              {displayedReservation.is_vip && (
                <Badge className='bg-amber-100 text-amber-800 flex items-center gap-1'>
                  <Star className='h-3 w-3' />
                  VIP
                </Badge>
              )}
            </SheetTitle>
            <SheetDescription className='flex items-center gap-2'>
              <Badge className={STATUS_COLORS[displayedReservation.status]}>
                {displayedReservation.status.replace('_', ' ')}
              </Badge>
              <span className='text-xs text-muted-foreground'>
                #{displayedReservation.confirmation_number}
              </span>
            </SheetDescription>
          </SheetHeader>

          <div className='space-y-6'>
            {/* Core details */}
            <div className='space-y-3'>
              <InfoRow
                label='Date'
                value={displayedReservation.reservation_date}
              />
              <InfoRow
                label='Time'
                value={displayedReservation.reservation_time}
              />
              <InfoRow
                label='Duration'
                value={`${displayedReservation.duration_minutes} min`}
              />
              <InfoRow
                label='Party Size'
                value={String(displayedReservation.party_size)}
              />
              <InfoRow label='Phone' value={displayedReservation.phone} />
              <InfoRow label='Email' value={displayedReservation.email} />
            </div>

            <Separator />

            {/* Tables & seating */}
            <div className='space-y-3'>
              <InfoRow
                label='Assigned Tables'
                value={
                  displayedReservation.assigned_tables &&
                  displayedReservation.assigned_tables.length > 0
                    ? displayedReservation.assigned_tables.join(', ')
                    : 'None assigned'
                }
              />
              <InfoRow
                label='Preferred Section'
                value={displayedReservation.preferred_section}
              />
              <InfoRow
                label='Seating Preference'
                value={displayedReservation.seating_preference}
              />
            </div>

            {/* Timestamps */}
            {(displayedReservation.arrived_at ||
              displayedReservation.seated_at) && (
              <>
                <Separator />
                <div className='space-y-3'>
                  <InfoRow
                    label='Arrived At'
                    value={formatTimestamp(displayedReservation.arrived_at)}
                  />
                  <InfoRow
                    label='Seated At'
                    value={formatTimestamp(displayedReservation.seated_at)}
                  />
                </div>
              </>
            )}

            {/* Notes */}
            {(displayedReservation.notes ||
              displayedReservation.special_requests) && (
              <>
                <Separator />
                <div className='space-y-3'>
                  {displayedReservation.notes && (
                    <div className='text-sm'>
                      <p className='text-muted-foreground mb-2'>Notes</p>
                      <p>{displayedReservation.notes}</p>
                    </div>
                  )}
                  {displayedReservation.special_requests && (
                    <div className='text-sm'>
                      <p className='text-muted-foreground mb-2'>
                        Special Requests
                      </p>
                      <p>{displayedReservation.special_requests}</p>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Cancellation reason */}
            {displayedReservation.cancellation_reason && (
              <>
                <Separator />
                <div className='text-sm space-y-1'>
                  <p className='text-muted-foreground'>Cancellation Reason</p>
                  <p>{displayedReservation.cancellation_reason}</p>
                </div>
              </>
            )}

            <Separator />

            {/* Actions */}
            <div className='space-y-3 mt-6'>
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
                  No further actions
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
                      {updateStatus.isPending && (
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
