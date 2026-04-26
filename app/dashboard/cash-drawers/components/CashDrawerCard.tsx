'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreVertical, Edit, Lock, Banknote, DoorOpen, DoorClosed } from 'lucide-react'
import { format } from 'date-fns'
import type { CashDrawerListItem } from '@/lib/queries/use-cash-drawers'

interface CashDrawerCardProps {
  drawer: CashDrawerListItem
  onEdit: (drawer: CashDrawerListItem) => void
  onDeactivate: (drawer: CashDrawerListItem) => void
  onOpenSession: (drawer: CashDrawerListItem) => void
  onCloseSession: (drawer: CashDrawerListItem) => void
}

function formatUSD(amount: number) {
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  })
}

export function CashDrawerCard({
  drawer,
  onEdit,
  onDeactivate,
  onOpenSession,
  onCloseSession,
}: CashDrawerCardProps) {
  const session = drawer.current_session
  return (
    <Card className={drawer.is_active ? '' : 'opacity-60'}>
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
            <Banknote className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{drawer.name}</span>
              {drawer.drawer_number !== null && (
                <Badge variant="outline" className="font-mono text-xs">
                  #{drawer.drawer_number}
                </Badge>
              )}
              {!drawer.is_active && (
                <Badge variant="secondary" className="text-xs">
                  Inactive
                </Badge>
              )}
              {drawer.is_open ? (
                <Badge className="bg-emerald-100 text-emerald-900 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200">
                  <DoorOpen className="mr-1 h-3 w-3" />
                  Open
                </Badge>
              ) : (
                <Badge variant="outline">
                  <DoorClosed className="mr-1 h-3 w-3" />
                  Closed
                </Badge>
              )}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {drawer.location_name && <span>{drawer.location_name}</span>}
              {drawer.station_name && <span>· {drawer.station_name}</span>}
            </div>
            {session && (
              <div className="mt-2 rounded-md border bg-muted/30 p-2 text-xs">
                <div>
                  Opened {format(new Date(session.opened_at), 'MMM d, p')}{' '}
                  {session.opened_by_name ? `by ${session.opened_by_name}` : ''}
                </div>
                <div>
                  Opening amount{' '}
                  <span className="font-semibold">{formatUSD(session.opening_amount)}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {drawer.is_active && drawer.is_open ? (
            <Button onClick={() => onCloseSession(drawer)}>Close Session</Button>
          ) : drawer.is_active ? (
            <Button onClick={() => onOpenSession(drawer)}>Open Session</Button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreVertical className="h-4 w-4" />
                <span className="sr-only">Actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(drawer)}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              {drawer.is_active && !drawer.is_open && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => onDeactivate(drawer)}
                  >
                    <Lock className="mr-2 h-4 w-4" />
                    Deactivate
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  )
}
