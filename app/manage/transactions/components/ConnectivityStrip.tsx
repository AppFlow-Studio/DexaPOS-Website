'use client'

import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, CircleAlert, Cpu, Plug, RefreshCcwDot } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
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

export function ConnectivityStrip({ merchantIds }: { merchantIds?: string[] | null }) {
    const { data, isLoading, isFetching, refetch } = useQuery({
        queryKey: ['platform-connectivity', (merchantIds ?? []).join(',')],
        queryFn: () => getConnectivityStatus(merchantIds ?? null),
        staleTime: 30_000,
        refetchOnMount: 'always',
    })

    if (isLoading) {
        return (
            <div className="flex items-center gap-3">
                <Skeleton className="h-7 w-48" />
                <Skeleton className="h-7 w-48" />
            </div>
        )
    }

    if (!data) return null

    const luqraOk = data.luqra.lastStatus === 'ok'
    const luqraColor = luqraOk
        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
        : data.luqra.lastStatus === 'error'
            ? 'border-red-200 bg-red-50 text-red-800'
            : 'border-zinc-200 bg-zinc-50 text-zinc-700'

    const procColor =
        data.processor.terminalsLast24h > 0
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
            : 'border-zinc-200 bg-zinc-50 text-zinc-700'

    return (
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
            <div className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 ${luqraColor}`}>
                <Plug className="h-3.5 w-3.5" />
                <span className="font-medium">TSYS</span>
                <InfoIcon tip="TSYS is the payment processing platform that syncs transaction data into Dexa POS. Last synced shows when the most recent import completed. MIDs = Merchant IDs registered in TSYS for this merchant." side="bottom" />
                {luqraOk ? (
                    <CheckCircle2 className="h-3 w-3" />
                ) : data.luqra.lastStatus === 'error' ? (
                    <CircleAlert className="h-3 w-3" />
                ) : null}
                <span className="text-muted-foreground">
                    {data.luqra.lastFinishedAt ? `synced ${relativeTime(data.luqra.lastFinishedAt)}` : 'never synced'}
                </span>
                <span className="text-muted-foreground">·</span>
                <span>{data.luqra.midsConfigured} MIDs</span>
                {data.luqra.lastErrorCode && (
                    <span className="inline-flex items-center gap-1">
                        <Badge variant="outline" className="ml-1 text-[10px]">
                            {data.luqra.lastErrorCode}
                        </Badge>
                        <InfoIcon tip={`Last TSYS sync error code: ${data.luqra.lastErrorCode}. Contact Dexa support if this persists.`} side="bottom" />
                    </span>
                )}
            </div>

            <div className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 ${procColor}`}>
                <Cpu className="h-3.5 w-3.5" />
                <span className="font-medium">Processor</span>
                <InfoIcon tip="Card payment terminals that have reported activity in the last 24 hours. Each badge shows a terminal type (e.g. dejavoo, pax) and its count." side="bottom" />
                <span className="text-muted-foreground">{data.processor.terminalsLast24h} terminals · 24h</span>
                {data.processor.terminalTypes.slice(0, 3).map((t) => (
                    <Badge key={t.type} variant="outline" className="text-[10px] capitalize">
                        {t.type} {t.count}
                    </Badge>
                ))}
            </div>

            <button
                type="button"
                onClick={() => void refetch()}
                disabled={isFetching}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/50"
                title="Refresh connectivity status"
            >
                <RefreshCcwDot className="h-3 w-3" />
                {isFetching ? 'Refreshing…' : 'Refresh'}
            </button>
        </div>
    )
}
