'use client'

import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
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
    Loader2,
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

function ConnectionBadge({ state }: { state: ConnectedTerminalRow['connection_state'] }) {
    switch (state) {
        case 'online':
            return (
                <Badge className="bg-green-600 hover:bg-green-600">
                    <Wifi className="h-3 w-3 mr-1" />
                    Online
                </Badge>
            )
        case 'offline':
            return (
                <Badge variant="secondary">
                    <WifiOff className="h-3 w-3 mr-1" />
                    Offline
                </Badge>
            )
        case 'stale':
            return (
                <Badge className="bg-amber-500 hover:bg-amber-500">
                    <Clock className="h-3 w-3 mr-1" />
                    Stale
                </Badge>
            )
        default:
            return (
                <Badge variant="outline">
                    <Clock className="h-3 w-3 mr-1" />
                    Unknown
                </Badge>
            )
    }
}

export function ConnectedTerminalsPanel({ merchantId, locationId }: ConnectedTerminalsPanelProps) {
    const router = useRouter()
    const { data: result, isLoading } = useAdminConnectedTerminals(merchantId, locationId)
    const rows = result?.data || []

    const detailHref = (serial: string | null): string | null =>
        serial
            ? `/manage/merchants/${merchantId}/devices/terminal/${encodeURIComponent(serial)}`
            : null

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        )
    }

    if (rows.length === 0) {
        // Nothing to dedupe (no Castles/Valor terminals) — the flat table below still shows Dejavoo etc.
        return null
    }

    const activeRows = rows.filter((r) => r.is_active)
    const retiredCount = rows.length - activeRows.length
    const onlineCount = activeRows.filter((r) => r.connection_state === 'online').length

    return (
        <TooltipProvider>
        <div className="mb-6 rounded-2xl border bg-slate-50/60 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                    <h3 className="text-sm font-semibold text-slate-900">Unique Terminals (by serial)</h3>
                    <p className="text-xs text-muted-foreground">
                        One row per physical Castles / Valor terminal. Used to track connected devices and reconcile settlements.
                        Retired devices with settlement history stay listed so their batches remain reconcilable.
                    </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    {retiredCount > 0 && (
                        <Badge variant="outline" className="border-slate-300 text-slate-500">
                            <PowerOff className="h-3 w-3 mr-1" />
                            {retiredCount} retired
                        </Badge>
                    )}
                    <Badge variant="outline">
                        {onlineCount}/{activeRows.length} online
                    </Badge>
                </div>
            </div>

            <div className="overflow-x-auto rounded-lg border bg-white">
                <Table>
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
                            <TableHead className="w-[40px]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.map((row) => {
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
                                        ? 'cursor-pointer transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none'
                                        : '',
                                    retired ? 'bg-slate-50 text-muted-foreground' : '',
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
                                                        <Badge variant="outline" className="border-amber-400 text-amber-700">
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
                                                <Badge variant="outline" className="border-dashed text-muted-foreground">
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
                                                    <Badge variant="outline" className="border-slate-300 text-slate-500 text-[10px] px-1.5 py-0">
                                                        Retired
                                                    </Badge>
                                                )}
                                            </div>
                                            <div className="text-xs text-muted-foreground">{row.location_name || '—'}</div>
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <Badge variant="outline">{terminalTypeLabel(row.terminal_type)}</Badge>
                                </TableCell>
                                <TableCell>
                                    <span className="text-sm">{row.station_name || <span className="text-muted-foreground">Unassigned</span>}</span>
                                </TableCell>
                                <TableCell>
                                    {retired ? (
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Badge variant="outline" className="border-slate-300 text-slate-500">
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
                                        <Badge className="bg-blue-600 hover:bg-blue-600">
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
            </div>
        </div>
        </TooltipProvider>
    )
}
