'use client'

import { format } from 'date-fns'
import {
  Banknote,
  DoorClosed,
  DoorOpen,
  Edit,
  Lock,
  MoreVertical,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { CashDrawerListItem } from '@/lib/queries/use-cash-drawers'

interface CashDrawerCardProps {
  drawer: CashDrawerListItem
  onEdit: (drawer: CashDrawerListItem) => void
  onDeactivate: (drawer: CashDrawerListItem) => void
  onOpenSession: (drawer: CashDrawerListItem) => void
  onCloseSession: (drawer: CashDrawerListItem) => void
  layout?: 'row' | 'card'
}

function formatUSD(amount: number) {
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  })
}

function DrawerStatus({ drawer }: { drawer: CashDrawerListItem }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {!drawer.is_active ? (
        <Badge variant="secondary" className="text-xs">
          Inactive
        </Badge>
      ) : null}
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
  )
}

function DrawerActions({
  drawer,
  onEdit,
  onDeactivate,
  onOpenSession,
  onCloseSession,
  compact = false,
}: Omit<CashDrawerCardProps, 'layout'> & { compact?: boolean }) {
  return (
    <div className="flex min-w-0 items-center justify-end gap-2">
      {drawer.is_active && drawer.is_open ? (
        <Button
          className={compact ? 'min-w-0 flex-1 rounded-full' : 'min-w-32 rounded-full'}
          onClick={() => onCloseSession(drawer)}
        >
          Close Session
        </Button>
      ) : drawer.is_active ? (
        <Button
          className={compact ? 'min-w-0 flex-1 rounded-full' : 'min-w-32 rounded-full'}
          onClick={() => onOpenSession(drawer)}
        >
          Open Session
        </Button>
      ) : null}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="shrink-0 rounded-full">
            <MoreVertical className="h-4 w-4" />
            <span className="sr-only">Actions for {drawer.name}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onEdit(drawer)}>
            <Edit className="mr-2 h-4 w-4" />
            Edit
          </DropdownMenuItem>
          {drawer.is_active && !drawer.is_open ? (
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
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export function CashDrawerCard({
  drawer,
  onEdit,
  onDeactivate,
  onOpenSession,
  onCloseSession,
  layout = 'card',
}: CashDrawerCardProps) {
  const session = drawer.current_session
  const actionProps = {
    drawer,
    onEdit,
    onDeactivate,
    onOpenSession,
    onCloseSession,
  }

  if (layout === 'row') {
    return (
      <div
        className={`grid min-w-[900px] grid-cols-[minmax(170px,1.2fr)_minmax(130px,1fr)_minmax(170px,1.2fr)_105px_180px] items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/40 ${
          drawer.is_active ? '' : 'opacity-60'
        }`}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Banknote className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium" title={drawer.name}>
              {drawer.name}
            </p>
            <p className="mt-0.5 min-h-5 text-xs text-muted-foreground">
              {drawer.drawer_number !== null ? `Drawer #${drawer.drawer_number}` : 'No drawer number'}
            </p>
          </div>
        </div>

        <div className="min-w-0 text-sm">
          <p className="truncate font-medium">{drawer.location_name || 'Location not set'}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {drawer.station_name || 'No station assigned'}
          </p>
        </div>

        <div className="min-w-0 text-sm">
          {session ? (
            <>
              <p className="truncate">
                Opened {format(new Date(session.opened_at), 'MMM d, p')}
              </p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {session.opened_by_name ? `By ${session.opened_by_name} / ` : ''}
                Opening {formatUSD(session.opening_amount)}
              </p>
            </>
          ) : (
            <p className="text-muted-foreground">No active session</p>
          )}
        </div>

        <div>
          <DrawerStatus drawer={drawer} />
        </div>

        <div>
          <DrawerActions {...actionProps} />
        </div>
      </div>
    )
  }

  return (
    <article
      className={`min-w-0 rounded-2xl border-0 bg-muted/45 p-4 transition-colors hover:bg-muted/65 ${
        drawer.is_active ? '' : 'opacity-60'
      }`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Banknote className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={drawer.name}>
            {drawer.name}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {drawer.drawer_number !== null ? `Drawer #${drawer.drawer_number}` : 'No drawer number'}
          </p>
        </div>
        <DrawerStatus drawer={drawer} />
      </div>

      <dl className="mt-5 grid min-w-0 grid-cols-2 gap-x-4 gap-y-4">
        <div className="min-w-0">
          <dt className="text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Location
          </dt>
          <dd className="mt-1 truncate text-sm font-medium">
            {drawer.location_name || 'Not set'}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Station
          </dt>
          <dd className="mt-1 truncate text-sm font-medium">
            {drawer.station_name || 'Not assigned'}
          </dd>
        </div>
        <div className="col-span-2 min-w-0 border-t border-border/60 pt-4">
          <dt className="text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Current session
          </dt>
          <dd className="mt-1 text-sm">
            {session ? (
              <>
                <span className="block truncate">
                  Opened {format(new Date(session.opened_at), 'MMM d, p')}
                  {session.opened_by_name ? ` by ${session.opened_by_name}` : ''}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Opening amount {formatUSD(session.opening_amount)}
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">No active session</span>
            )}
          </dd>
        </div>
      </dl>

      <div className="mt-5 border-t border-border/60 pt-4">
        <DrawerActions {...actionProps} compact />
      </div>
    </article>
  )
}
