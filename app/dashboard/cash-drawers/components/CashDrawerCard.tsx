'use client'

import { format } from 'date-fns'
import { Banknote, Edit, Lock, MoreVertical } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { TableCell, TableRow } from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  CASH_DRAWER_STATUS_LABELS,
  cashDrawerStatus,
  cashDrawerStatusStyle,
  type CashDrawerState,
} from '@/lib/constants/cash-drawer-status'
import type { CashDrawerListItem } from '@/lib/queries/use-cash-drawers'
import { cn } from '@/lib/utils'

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

/**
 * The canonical status badge (DS-CTL-09): soft tint, 6px dot, no border.
 *
 * Classes are literal here rather than pulled from the constants module's
 * shell, because Tailwind only scans `.tsx` (C7).
 */
function DrawerStatus({ status }: { status: CashDrawerState }) {
  const style = cashDrawerStatusStyle(status)
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        style.bg,
        style.text,
      )}
    >
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', style.dot)} />
      {CASH_DRAWER_STATUS_LABELS[status]}
    </span>
  )
}

function DrawerActions({
  drawer,
  onEdit,
  onDeactivate,
  onOpenSession,
  onCloseSession,
  status,
  compact = false,
}: Omit<CashDrawerCardProps, 'layout'> & {
  status: CashDrawerState
  compact?: boolean
}) {
  return (
    <div className="flex min-w-0 items-center justify-end gap-2">
      {status === 'open' ? (
        <Button
          className={compact ? 'min-w-0 flex-1 rounded-full' : 'min-w-32 rounded-full'}
          onClick={() => onCloseSession(drawer)}
        >
          Close Session
        </Button>
      ) : status === 'closed' ? (
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
          {status === 'closed' ? (
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
  const status = cashDrawerStatus(drawer.is_active, drawer.is_open)
  const actionProps = {
    drawer,
    onEdit,
    onDeactivate,
    onOpenSession,
    onCloseSession,
    status,
  }

  if (layout === 'row') {
    return (
      <TableRow
        className={cn(
          'border-0 bg-card/70 hover:bg-muted/40',
          status === 'inactive' && 'opacity-60',
        )}
      >
        <TableCell>
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Banknote className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium" title={drawer.name}>
                {drawer.name}
              </p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {drawer.drawer_number !== null ? `Drawer #${drawer.drawer_number}` : 'No drawer number'}
              </p>
            </div>
          </div>
        </TableCell>

        <TableCell>
          <div className="min-w-0 text-sm">
            <p className="truncate font-medium">{drawer.location_name || 'Location not set'}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {drawer.station_name || 'No station assigned'}
            </p>
          </div>
        </TableCell>

        <TableCell>
          <div className="min-w-0 text-sm">
            {session ? (
              <>
                <p className="truncate">
                  Opened {format(new Date(session.opened_at), 'MMM d, p')}
                </p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {session.opened_by_name ? `By ${session.opened_by_name} · ` : ''}
                  Opening{' '}
                  <span className="tabular-nums">
                    {formatUSD(session.opening_amount)}
                  </span>
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">No active session</p>
            )}
          </div>
        </TableCell>

        <TableCell>
          <DrawerStatus status={status} />
        </TableCell>

        <TableCell>
          <DrawerActions {...actionProps} />
        </TableCell>
      </TableRow>
    )
  }

  return (
    <article
      className={cn(
        'min-w-0 rounded-2xl border-0 bg-muted/60 p-4 shadow-none transition-colors hover:bg-muted',
        status === 'inactive' && 'opacity-60',
      )}
    >
      {/* `flex-wrap` + a `basis` on the name column: at 320px the badge and the
          40px icon left the drawer name almost no room, so it truncated to one
          word. The badge drops to its own line instead. */}
      <div className="flex min-w-0 flex-wrap items-start gap-x-3 gap-y-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-background/70 text-muted-foreground">
          <Banknote className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1 basis-32">
          <p className="truncate text-sm font-medium" title={drawer.name}>
            {drawer.name}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {drawer.drawer_number !== null ? `Drawer #${drawer.drawer_number}` : 'No drawer number'}
          </p>
        </div>
        <DrawerStatus status={status} />
      </div>

      <dl className="mt-5 grid min-w-0 grid-cols-2 gap-x-4 gap-y-4">
        <div className="min-w-0">
          <dt className="text-[11px] font-medium uppercase leading-tight text-muted-foreground">
            Location
          </dt>
          <dd className="mt-1 truncate text-sm font-medium">
            {drawer.location_name || 'Not set'}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[11px] font-medium uppercase leading-tight text-muted-foreground">
            Station
          </dt>
          <dd className="mt-1 truncate text-sm font-medium">
            {drawer.station_name || 'Not assigned'}
          </dd>
        </div>
        <div className="col-span-2 min-w-0">
          <dt className="text-[11px] font-medium uppercase leading-tight text-muted-foreground">
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
                  Opening amount{' '}
                  <span className="tabular-nums">
                    {formatUSD(session.opening_amount)}
                  </span>
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">No active session</span>
            )}
          </dd>
        </div>
      </dl>

      <div className="mt-5">
        <DrawerActions {...actionProps} compact />
      </div>
    </article>
  )
}
