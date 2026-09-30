'use client'

import { useQuery } from '@tanstack/react-query'
import { CircleAlert, Cpu, Plug, RefreshCcwDot } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { InfoIcon } from '@/components/ui/info-icon'
import { getConnectivityStatus } from '@/app/manage/actions/hq-platform/payments'

function relativeTime(iso: string | null): string {
    if (!iso) return 'never'
    const ms = Date.now() - new Date(iso).getTime()
    if (ms < 60_000) return 'just now'
    if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min ago`
    if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)} h ago`
    return `${Math.round(ms / 86_400_000)} d ago`
}

/*
 * The processor status line under the page header.
 *
 * Neutral by default (UI-DESIGN-SYSTEM §3.5): a healthy sync is the absence of
 * an alarm, so it gets no green. The one coloured mark is the glyph beside a
 * failed TSYS sync, and the words "Sync failed" say it too (§14.3 HQ-2).
 */
export function ConnectivityStrip({
    merchantIds,
    enabled = true,
}: {
    merchantIds?: string[] | null
    /** Hold the request back (the host's primary list goes first). The skeleton shows meanwhile. */
    enabled?: boolean
}) {
    const { data, isPending, isFetching, refetch } = useQuery({
        queryKey: ['platform-connectivity', (merchantIds ?? []).join(',')],
        queryFn: () => getConnectivityStatus(merchantIds ?? null),
        staleTime: 30_000,
        refetchOnMount: 'always',
        enabled,
    })

    // `isPending` (no data yet), not `isLoading`: it also covers a held-back query.
    if (isPending) {
        return (
            <div className="flex flex-wrap items-center gap-2">
                <Skeleton className="h-7 w-56 rounded-full" />
                <Skeleton className="h-7 w-48 rounded-full" />
            </div>
        )
    }

    const refreshButton = (
        <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2.5 text-xs text-muted-foreground"
            onClick={() => void refetch()}
            disabled={isFetching}
        >
            <RefreshCcwDot className="h-3 w-3" />
            {isFetching ? 'Refreshing…' : 'Refresh'}
        </Button>
    )

    // A status line with a place in the layout says when it has nothing (§4.9).
    if (!data) {
        return (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>Processor connectivity is unavailable right now.</span>
                {refreshButton}
            </div>
        )
    }

    const syncFailed = data.luqra.lastStatus === 'error'

    return (
        <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5 rounded-full bg-muted/60 px-3 py-1">
                <Plug className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium">TSYS</span>
                <InfoIcon tip="TSYS is the payment processing platform that syncs transaction data into Dexa POS. Last synced shows when the most recent import completed. MIDs = Merchant IDs registered in TSYS for this merchant." side="bottom" />
                {syncFailed && (
                    <span className="inline-flex items-center gap-1 font-medium">
                        <CircleAlert className="h-3 w-3 text-red-600 dark:text-red-400" aria-hidden />
                        Sync failed
                    </span>
                )}
                <span className="text-muted-foreground">
                    {data.luqra.lastFinishedAt ? `synced ${relativeTime(data.luqra.lastFinishedAt)}` : 'never synced'}
                </span>
                <span className="text-muted-foreground" aria-hidden>·</span>
                <span className="tabular-nums">{data.luqra.midsConfigured} MIDs</span>
                {data.luqra.lastErrorCode && (
                    <span className="inline-flex items-center gap-1">
                        <Badge variant="outline" className="font-mono text-[10px]">
                            {data.luqra.lastErrorCode}
                        </Badge>
                        <InfoIcon tip={`Last TSYS sync error code: ${data.luqra.lastErrorCode}. Contact Dexa support if this persists.`} side="bottom" />
                    </span>
                )}
            </div>

            <div className="flex min-w-0 flex-wrap items-center gap-1.5 rounded-full bg-muted/60 px-3 py-1">
                <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium">Processor</span>
                <InfoIcon tip="Card payment terminals that have reported activity in the last 24 hours. Each badge shows a terminal type (e.g. dejavoo, pax) and its count." side="bottom" />
                <span className="text-muted-foreground tabular-nums">{data.processor.terminalsLast24h} terminals · 24h</span>
                {data.processor.terminalTypes.slice(0, 3).map((t) => (
                    <span key={t.type} className="capitalize tabular-nums text-muted-foreground">
                        {t.type} {t.count}
                    </span>
                ))}
            </div>

            {refreshButton}
        </div>
    )
}
