'use client'

import * as React from 'react'
import { WaitlistEntry } from '@/types/floor-plan'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Clock,
  Users,
  Phone,
  Bell,
  CheckCircle2,
  Plus,
  Pencil
} from 'lucide-react'
import { AddToWaitlistWizard } from './AddToWaitlistWizard'
import { EditWaitlistDialog } from './EditWaitlistDialog'
import { formatPhoneForDisplay } from '@/lib/phone'
// Date formatting helper
function formatDistanceToNow (dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'in less than a minute'
  if (diffMins < 60) return `in ${diffMins} minutes`
  if (diffHours < 24) return `in ${diffHours} hours`
  if (diffDays < 7) return `in ${diffDays} days`
  return `in ${Math.floor(diffDays / 7)} weeks`
}

interface WaitlistPanelProps {
  locationId: string
  waitlistInfo?: {
    waitlist: WaitlistEntry[]
    summary: {
      total_waiting: number
      total_notified: number
      avg_wait_time: number
    }
  }
  onNotify?: (entryId: string) => void
  onSeat?: (entryId: string) => void
  onRemove?: (entryId: string) => void
  onRefresh?: () => void
}

export function WaitlistPanel ({
  locationId,
  waitlistInfo,
  onNotify,
  onSeat,
  onRemove,
  onRefresh
}: WaitlistPanelProps) {
  const [editingEntry, setEditingEntry] = React.useState<WaitlistEntry | null>(
    null
  )

  const handleSuccess = () => {
    onRefresh?.()
  }

  const waitlist = waitlistInfo?.waitlist || []

  if (waitlist.length === 0) {
    return (
      <div className='space-y-4'>
        <AddToWaitlistWizard locationId={locationId} onSuccess={handleSuccess}>
          <Button className='w-full' size='sm'>
            <Plus className='h-4 w-4 mr-2' />
            Add Party to Waitlist
          </Button>
        </AddToWaitlistWizard>
        <Card>
          <CardContent className='py-8'>
            <div className='text-center text-muted-foreground'>
              <Clock className='h-12 w-12 mx-auto mb-4 opacity-50' />
              <p>No one on the waitlist</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className='space-y-2'>
      {/* Add to Waitlist Button */}
      <AddToWaitlistWizard locationId={locationId} onSuccess={handleSuccess}>
        <Button className='w-full mb-4' size='sm' variant='default'>
          <Plus className='h-4 w-4 mr-2' />
          Add Party to Waitlist
        </Button>
      </AddToWaitlistWizard>
      {waitlist.map(entry => (
        <Card key={entry.id} className='hover:shadow-md transition-shadow'>
          <CardHeader className='pb-3'>
            <div className='flex items-start justify-between'>
              <div className='flex-1'>
                <CardTitle className='text-base flex items-center gap-2'>
                  <span className='text-muted-foreground'>
                    #{entry.position}
                  </span>
                  {entry.party_name}
                </CardTitle>
                <CardDescription className='mt-1 flex items-center gap-4'>
                  <span className='flex items-center gap-1'>
                    <Users className='h-3 w-3' />
                    {entry.party_size}
                  </span>
                  {entry.phone && (
                    <span className='flex items-center gap-1'>
                      <Phone className='h-3 w-3' />
                      {formatPhoneForDisplay(entry.phone)}
                    </span>
                  )}
                </CardDescription>
              </div>
              <Badge
                variant={
                  entry.status === 'waiting'
                    ? 'default'
                    : entry.status === 'notified'
                    ? 'secondary'
                    : 'outline'
                }
              >
                {entry.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className='pt-0'>
            <div className='space-y-2'>
              <div className='flex items-center justify-between text-sm'>
                <span className='text-muted-foreground'>Wait time</span>
                <span className='font-medium'>
                  {entry.minutes_waiting || 0} min
                </span>
              </div>
              {entry.estimated_ready_at && (
                <div className='flex items-center justify-between text-sm'>
                  <span className='text-muted-foreground'>Estimated ready</span>
                  <span className='font-medium'>
                    {formatDistanceToNow(entry.estimated_ready_at)}
                  </span>
                </div>
              )}
              {entry.notes && (
                <p className='text-sm text-muted-foreground mt-2'>
                  {entry.notes}
                </p>
              )}
              <div className='flex items-center gap-2 mt-3 pt-3 border-t'>
                {entry.status === 'waiting' && onNotify && (
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => onNotify(entry.id)}
                    className='flex-1'
                  >
                    <Bell className='h-4 w-4 mr-2' />
                    Notify
                  </Button>
                )}
                {onSeat && (
                  <Button
                    variant='default'
                    size='sm'
                    onClick={() => onSeat(entry.id)}
                    className='flex-1'
                  >
                    <CheckCircle2 className='h-4 w-4 mr-2' />
                    Seat
                  </Button>
                )}
                {onRemove && (
                  <Button
                    variant='ghost'
                    size='sm'
                    onClick={() => onRemove(entry.id)}
                  >
                    Remove
                  </Button>
                )}
                {!['seated', 'cancelled', 'no_show', 'expired'].includes(
                  entry.status
                ) && (
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => setEditingEntry(entry)}
                  >
                    <Pencil className='h-4 w-4 mr-2' />
                    Edit
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      <EditWaitlistDialog
        open={!!editingEntry}
        onOpenChange={open => {
          if (!open) setEditingEntry(null)
        }}
        locationId={locationId}
        entry={editingEntry}
        onSuccess={handleSuccess}
      />
    </div>
  )
}
