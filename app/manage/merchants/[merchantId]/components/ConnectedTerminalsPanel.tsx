'use client'

import { useRouter } from 'next/navigation'
import { Panel } from '@/components/dashboard/shell/Panel'
import { PanelSection } from '@/components/dashboard/shell/PanelSection'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { PaginationBar } from '@/components/dashboard/PaginationBar'
import { useClientPagination } from '@/lib/hooks/useClientPagination'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip'
import {
    AlertTriangle,
    ChevronRight,
    Clock,
    CreditCard,
    PowerOff,
    Wifi,
    WifiOff,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useAdminConnectedTerminals } from '@/lib/queries/use-admin-stations'
import type { ConnectedTerminalRow } from '@/app/manage/actions/admin-merchant/payment-terminals'

interface ConnectedTerminalsPanelProps {
    merchantId: string
    locationId?: string | null
}

const terminalTypeLabel = (type: string): string => {
    switch (type) {
        case 'castles':
            return 'Castles'
        case 'valor':
            return 'Valor'
        case 'dejavoo':
            return 'Dejavoo'
        case 'codepay':
            return 'CodePay'
        default:
            return type
    }
}

const settleTimeLabel = (time: string | null): string => {
    if (!time) return '—'
    // Postgres time comes back as HH:MM:SS — show HH:MM
    return time.slice(0, 5)
}

const timeAgo = (iso: string | null): string => {
    if (!iso) return '—'
    try {
        return formatDistanceToNow(new Date(iso), { addSuffix: true })
    } catch {
        return '—'
    }
}

const connectionLabel = (state: ConnectedTerminalRow['connection_state']): string => {
    switch (state) {
        case 'online':
            return 'Online'
        case 'offline':
            return 'Offline'
        case 'stale':
            return 'Stale'
        default:
            return 'Unknown'
    }
}

/**
 * One neutral pill for every connection state (§4.6b). The icon and the word
 * carry the state — a green "Online" pill beside a `Wifi` glyph says the same
 * thing twice, and a column of saturated pills reads as a column of alarms.
 */
function ConnectionBadge({ state }: { state: ConnectedTerminalRow['connection_state'] }) {
    const Icon = state === 'online' ? Wifi : state === 'offline' ? WifiOff : Clock
    return (
        <Badge variant="secondary" className="w-fit shrink-0 rounded-full border-0 px-2.5 text-xs font-medium">
            <Icon className="h-3 w-3 mr-1" />
            {connectionLabel(state)}
        </Badge>
    )
}

/** One labelled field inside a mobile terminal card (§5.3). */
function CardField({ label, value }: { label: string; value: string }) {
    return (
        <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="truncate font-medium tabular-nums">{value}</p>
        </div>
    )
}

const PANEL_LABEL = 'Unique terminals (by serial)'
const PANEL_CAPTION =
    'One row per physical Castles / Valor terminal. Used to track connected devices and reconcile settlements. Retired devices with settlement history stay listed so their batches remain reconcilable.'

export function ConnectedTerminalsPanel({ merchantId, locationId }: ConnectedTerminalsPanelProps) {
    const router = useRouter()
    const { data: result, isLoading } = useAdminConnectedTerminals(merchantId, locationId)
    const rows = result?.data || []
    const { pageRows, pagination, setPage } = useClientPagination(rows, 10)

    const detailHref = (serial: string | null): string | null =>
        serial
            ? `/manage/merchants/${merchantId}/devices/terminal/${encodeURIComponent(serial)}`
            : null

    if (isLoading) {
        return (
            <Panel>
                <PanelSection label={PANEL_LABEL} caption={PANEL_CAPTION}>
                    <div className="mt-4 space-y-2">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <Skeleton key={i} className="h-14 w-full rounded-2xl" />
                        ))}
                    </div>
                </PanelSection>
            </Panel>
        )
    }

    if (rows.length === 0) {
        // Nothing to dedupe (no Castles/Valor terminals) — the terminals list
        // above still shows Dejavoo etc. Say so rather than vanish (§4.9).
        return (
            <Panel>
                <PanelSection label={PANEL_LABEL} caption={PANEL_CAPTION}>
                    <p className="mt-4 text-sm text-muted-foreground">
                        No Castles or Valor terminals yet — physical terminals appear here once one is registered with a serial number.
                    </p>
                </PanelSection>
            </Panel>
        )
    }

    const activeRows = rows.filter((r) => r.is_active)
    const retiredCount = rows.length - activeRows.length
    const onlineCount = activeRows.filter((r) => r.connection_state === 'online').length

    return (
        <TooltipProvider>
        <Panel>
            <PanelSection
                label={PANEL_LABEL}
                caption={PANEL_CAPTION}
                action={
                    <div className="flex shrink-0 items-center gap-2">
                        {retiredCount > 0 && (
                            <Badge variant="outline" className="tabular-nums">
                                <PowerOff className="h-3 w-3 mr-1" />
                                {retiredCount} retired
                            </Badge>
                        )}
                        <Badge variant="outline" className="tabular-nums">
                            {onlineCount}/{activeRows.length} online
                        </Badge>
                    </div>
                }
            >
                <div className="mt-4">
                    {/* §5.3: nine columns only fit the content column from `xl`;
                        below that the same page of rows renders as cards. */}
                    <Table variant="data" containerClassName="hidden xl:block">
                        <TableHeader>
                            <TableRow>
                                <TableHead>Serial</TableHead>
                                <TableHead>Terminal</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Station</TableHead>
                                <TableHead>Connection</TableHead>
                                <TableHead>Last Txn</TableHead>
                                <TableHead>Last Batch</TableHead>
                                <TableHead>Auto-Settle</TableHead>
                                <TableHead className="w-[40px]"><span className="sr-only">Open</span></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {pageRows.map((row) => {
                                const href = detailHref(row.serial_number)
                                const retired = !row.is_active
                                return (
                                <TableRow
                                    key={row.terminal_uuid}
                                    onClick={href ? () => router.push(href) : undefined}
                                    onKeyDown={
                                        href
                                            ? (e) => {
                                                  if (e.key === 'Enter' || e.key === ' ') {
                                                      e.preventDefault()
                                                      router.push(href)
                                                  }
                                              }
                                            : undefined
                                    }
                                    role={href ? 'link' : undefined}
                                    tabIndex={href ? 0 : undefined}
                                    className={[
                                        href
                                            ? 'cursor-pointer focus-visible:bg-muted/40 focus-visible:outline-none'
                                            : '',
                                        retired ? 'text-muted-foreground' : '',
                                    ]
                                        .filter(Boolean)
                                        .join(' ') || undefined}
                                >
                                    <TableCell>
                                        {row.serial_number ? (
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono text-xs bg-muted px-2 py-1 rounded">
                                                    {row.serial_number}
                                                </span>
                                                {row.duplicate_serial && (
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <Badge variant="secondary" className="w-fit rounded-full border-0 px-2.5 text-xs font-medium">
                                                                <AlertTriangle className="h-3 w-3 mr-1" />
                                                                Dup
                                                            </Badge>
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            Multiple terminals share this serial at this location.
                                                        </TooltipContent>
                                                    </Tooltip>
                                                )}
                                            </div>
                                        ) : (
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Badge variant="secondary" className="w-fit rounded-full border-0 px-2.5 text-xs font-medium">
                                                        No serial — add one
                                                    </Badge>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    Edit this terminal and set its serial number so it can be tracked and reconciled.
                                                </TooltipContent>
                                            </Tooltip>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <CreditCard className="h-4 w-4 text-muted-foreground shrink-0" />
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium">{row.terminal_name}</span>
                                                    {retired && (
                                                        <Badge variant="secondary" className="w-fit rounded-full border-0 px-2.5 text-xs font-medium">
                                                            Retired
                                                        </Badge>
                                                    )}
                                                </div>
                                                <div className="text-xs text-muted-foreground">{row.location_name || '—'}</div>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="secondary" className="w-fit rounded-full border-0 px-2.5 text-xs font-medium">
                                            {terminalTypeLabel(row.terminal_type)}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <span className="text-sm">{row.station_name || <span className="text-muted-foreground">Unassigned</span>}</span>
                                    </TableCell>
                                    <TableCell>
                                        {retired ? (
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Badge variant="secondary" className="w-fit rounded-full border-0 px-2.5 text-xs font-medium">
                                                        <PowerOff className="h-3 w-3 mr-1" />
                                                        Inactive
                                                    </Badge>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    This device is deactivated but still has settlement history. Open it to reconcile its batches and any unsettled funds.
                                                </TooltipContent>
                                            </Tooltip>
                                        ) : (
                                            <div className="flex flex-col gap-1">
                                                <ConnectionBadge state={row.connection_state} />
                                                {row.last_connection_test_at && (
                                                    <span className="text-[11px] text-muted-foreground">
                                                        {timeAgo(row.last_connection_test_at)}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <span className="text-sm text-muted-foreground">{timeAgo(row.last_transaction_at)}</span>
                                    </TableCell>
                                    <TableCell>
                                        <span className="text-sm text-muted-foreground">{timeAgo(row.last_batch_at)}</span>
                                    </TableCell>
                                    <TableCell>
                                        {row.auto_settle ? (
                                            <Badge variant="secondary" className="w-fit rounded-full border-0 px-2.5 text-xs font-medium tabular-nums">
                                                <Clock className="h-3 w-3 mr-1" />
                                                {settleTimeLabel(row.settle_time)}
                                            </Badge>
                                        ) : (
                                            <span className="text-sm text-muted-foreground">Off</span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        {href && (
                                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                        )}
                                    </TableCell>
                                </TableRow>
                                )
                            })}
                        </TableBody>
                    </Table>

                    {/* Mirrors the table's `hidden xl:block`. Values are plain text
                        on the muted card, not pills (§3.5). */}
                    <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:hidden">
                        {pageRows.map((row) => {
                            const href = detailHref(row.serial_number)
                            const retired = !row.is_active
                            const body = (
                                <>
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="truncate font-semibold">{row.terminal_name}</p>
                                            <p className="truncate font-mono text-xs text-muted-foreground">
                                                {row.serial_number || 'No serial — add one'}
                                                {row.duplicate_serial ? ' · Duplicate serial' : ''}
                                            </p>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground">
                                            {retired ? 'Inactive' : connectionLabel(row.connection_state)}
                                            {href && <ChevronRight className="h-4 w-4" />}
                                        </div>
                                    </div>
                                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                        <CardField label="Type" value={terminalTypeLabel(row.terminal_type)} />
                                        <CardField label="Station" value={row.station_name || 'Unassigned'} />
                                        <CardField label="Location" value={row.location_name || '—'} />
                                        <CardField
                                            label="Auto-settle"
                                            value={row.auto_settle ? settleTimeLabel(row.settle_time) : 'Off'}
                                        />
                                        <CardField label="Last txn" value={timeAgo(row.last_transaction_at)} />
                                        <CardField label="Last batch" value={timeAgo(row.last_batch_at)} />
                                    </div>
                                </>
                            )
                            const cardClass = `min-w-0 rounded-2xl border-0 bg-muted/45 p-4 text-left ${retired ? 'text-muted-foreground' : ''}`
                            return href ? (
                                <button
                                    key={row.terminal_uuid}
                                    type="button"
                                    onClick={() => router.push(href)}
                                    className={`${cardClass} w-full transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
                                >
                                    {body}
                                </button>
                            ) : (
                                <div key={row.terminal_uuid} className={cardClass}>
                                    {body}
                                </div>
                            )
                        })}
                    </div>

                    <PaginationBar pagination={pagination} onPageChange={setPage} itemLabel="terminals" />
                </div>
            </PanelSection>
        </Panel>
        </TooltipProvider>
    )
}
