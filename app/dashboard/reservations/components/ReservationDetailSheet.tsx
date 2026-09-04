'use client'

import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, Pencil, Phone, Clock3, Users, Star, Armchair, Hash, Globe } from 'lucide-react'
import {
  useCancelReservation,
  useUpdateReservationStatus
} from '@/app/dashboard/hooks/useReservations'
import { useClerkOrgId } from '@/app/dashboard/hooks/useLocationScoped'
import { RespondToReservationRequestAction } from '@/app/dashboard/actions/floor-plan-actions'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import CancelReservationDialog from './CancelReservationDialog'
import EditReservationDialog from './EditReservationDialog'
import type { Reservation } from '@/types/floor-plan'
import { formatPhoneForDisplay } from '@/lib/phone'
import {
  isWebsiteReservation,
  WEBSITE_SOURCE_STYLE
} from '@/lib/constants/reservation-source'
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
  /*
    `pending` is deliberately absent.

    It used to carry Confirm and Mark No-Show, and both were wrong once a
    booking request could be pending:

      • **Confirm** went through `update_reservation_status`, which writes the
        column and tells the guest nothing. A guest who was told "we'll answer
        shortly" would be confirmed in silence. Confirm and Decline now route
        through `RespondToReservationRequestAction` instead — see the pending
        block in the actions footer.
      • **Mark No-Show** cannot apply. A guest cannot fail to turn up to a table
        nobody has granted them. It was in this map because the map predates
        requests existing.
  */

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
  const [declineOpen, setDeclineOpen] = useState(false)
  const [declineReason, setDeclineReason] = useState('')
  const [answering, setAnswering] = useState<'accept' | 'decline' | null>(null)
  const queryClient = useQueryClient()
  const clerkOrgId = useClerkOrgId()
  const updateStatus = useUpdateReservationStatus(date)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _cancelMutation = useCancelReservation(date)

  useEffect(() => {
    setDisplayedReservation(reservation)
    setPendingStatus(null)
    setDeclineOpen(false)
    setDeclineReason('')
    setAnswering(null)
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

  /**
   * Answering a booking request.
   *
   * **Passes the reservation's OWN location**, not the dashboard's selected
   * one. On the day view those are the same thing, but this sheet is reused by
   * screens that list more than one branch, and reading the picker there would
   * write the wrong restaurant into the audit log.
   *
   * `acted: false` means the request had already been answered — the other
   * manager got there first, or the guest withdrew. That is success from this
   * user's point of view: the outcome they wanted is already true. Showing a
   * red toast would teach staff the button is broken.
   */
  const respond = async (accept: boolean) => {
    // Auth is still resolving, or the session lapsed. Sending `''` would reach
    // the action, fail its own guard, and surface as a generic error — so say
    // the true thing instead and leave the request untouched.
    if (!clerkOrgId) {
      toast.error('Still signing you in. Try that again in a moment.')
      return
    }

    setAnswering(accept ? 'accept' : 'decline')
    try {
      const outcome = (await RespondToReservationRequestAction(
        clerkOrgId,
        reservation.id,
        accept,
        accept ? undefined : declineReason
      )) as { acted?: boolean; status?: string }

      const next = (outcome?.status ?? (accept ? 'confirmed' : 'cancelled')) as Reservation['status']
      setDisplayedReservation(prev => (prev ? { ...prev, status: next } : prev))
      setDeclineOpen(false)

      if (outcome?.acted === false) {
        toast.info('This request had already been answered.')
      } else {
        toast.success(
          accept
            ? 'Booking confirmed. The guest has been told.'
            : 'Request declined. The guest has been told.'
        )
      }

      // Refetch every branch's list for this date rather than guessing which
      // key holds this row: `location_id` is optional on the Reservation type,
      // so a precise key could silently miss and leave a stale card on screen.
      await queryClient.invalidateQueries({
        queryKey: ['reservations'],
        refetchType: 'active'
      })
    } catch (err) {
      console.error('[respondToReservationRequest] failed:', err)
      toast.error('We could not save that. Please try again.')
    } finally {
      setAnswering(null)
    }
  }

  const transitions = STATUS_TRANSITIONS[displayedReservation.status] ?? []
  const isRequest = displayedReservation.status === 'pending'
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
                      {isWebsiteReservation(displayedReservation.source) && (
                        <Badge
                          className={cn(
                            'shrink-0 gap-1 rounded-full border-0 px-2.5 py-0.5 text-xs font-medium shadow-none',
                            WEBSITE_SOURCE_STYLE.bg,
                            WEBSITE_SOURCE_STYLE.text
                          )}
                        >
                          <Globe className='mr-1 h-3 w-3' />
                          Website
                        </Badge>
                      )}
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
                    {/*
                      A booking REQUEST, waiting on this merchant.

                      Its own block rather than two more rows in
                      `STATUS_TRANSITIONS`, because both buttons go through a
                      different RPC — one that messages the guest, records
                      `cancelled_by`, and refuses to act twice. The map's
                      buttons do none of that.
                    */}
                    {isRequest && (
                      <>
                        <p className='text-sm text-muted-foreground'>
                          This guest is waiting for an answer. They were told their table is
                          held while you decide.
                        </p>
                        <Button
                          className='h-10 w-full rounded-full text-sm font-medium shadow-sm'
                          disabled={answering !== null}
                          onClick={() => respond(true)}
                        >
                          {answering === 'accept' && (
                            <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                          )}
                          Confirm booking
                        </Button>
                        <Button
                          className='h-10 w-full rounded-full text-sm font-medium shadow-sm'
                          variant='outline'
                          disabled={answering !== null}
                          onClick={() => setDeclineOpen(true)}
                        >
                          Decline
                        </Button>
                      </>
                    )}
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

      {/*
        Declining, with an optional word to the guest.

        The reason is OPTIONAL and it is SENT. Both facts are on the dialog,
        because the natural assumption about a text box in a dashboard is that
        it is a note for staff — and someone typing "double booked, our fault"
        for their manager would be mailing it to the customer.
      */}
      <Dialog open={declineOpen} onOpenChange={setDeclineOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline this request?</DialogTitle>
            <DialogDescription>
              {/* Explicit {" "} — a bare space here does not survive the JSX text-node join. */}
              {reservation.party_name}{" "}
              will be told you can&rsquo;t fit them in, and the table you were holding is
              released.
            </DialogDescription>
          </DialogHeader>

          <div className='space-y-2'>
            <label htmlFor='decline-reason' className='text-sm font-medium'>
              Add a reason (optional)
            </label>
            <Textarea
              id='decline-reason'
              value={declineReason}
              onChange={e => setDeclineReason(e.target.value)}
              placeholder="We're fully booked that evening"
              maxLength={300}
              rows={3}
            />
            <p className='text-xs text-muted-foreground'>
              This is sent to the guest, so write it for them — not as a note for your team.
            </p>
          </div>

          <DialogFooter>
            <Button
              variant='outline'
              disabled={answering !== null}
              onClick={() => setDeclineOpen(false)}
            >
              Keep the request
            </Button>
            <Button
              variant='destructive'
              disabled={answering !== null}
              onClick={() => respond(false)}
            >
              {answering === 'decline' && (
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
              )}
              Decline and tell the guest
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
