'use client'

import { useState } from 'react'
import { CreditCard, Plus, MapPin, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useMerchantLocationMids } from '@/lib/queries/use-luqra'
import type { LocationMidRow } from '@/app/manage/actions/admin-merchant/luqra'
import { useAdminPermissions } from '@/lib/hooks/useAdminPermissions'
import { SectionHead } from './SectionHead'
import { EmptySection } from './EmptySection'
import { AssignMidDialog } from './AssignMidDialog'

const STATUS_CLASS: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-800 border-amber-200',
    review: 'bg-blue-100 text-blue-800 border-blue-200',
    live: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    offline: 'bg-zinc-200 text-zinc-700 border-zinc-300',
}

function MidCard({
    row,
    canEdit,
    onEdit,
}: {
    row: LocationMidRow
    canEdit: boolean
    onEdit: (row: LocationMidRow) => void
}) {
    const hasMid = !!row.luqra_mid
    return (
        <div className="rounded-lg border bg-card">
            <div className="flex items-start justify-between gap-3 border-b px-5 py-3">
                <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-[13px] font-medium">{row.name}</span>
                    </div>
                    <div className="text-[11.5px] text-muted-foreground">
                        {hasMid ? (
                            <>
                                <span className="font-mono">{row.luqra_mid}</span>
                                {row.luqra_mid_descriptor && (
                                    <>
                                        <span className="mx-1.5" aria-hidden>
                                            ·
                                        </span>
                                        <span>&ldquo;{row.luqra_mid_descriptor}&rdquo;</span>
                                    </>
                                )}
                            </>
                        ) : (
                            <span>No MID assigned</span>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Badge className={STATUS_CLASS[row.luqra_mid_status] ?? STATUS_CLASS.pending}>
                        {row.luqra_mid_status}
                    </Badge>
                    {canEdit && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2"
                            onClick={() => onEdit(row)}
                        >
                            {hasMid ? (
                                <>
                                    <Pencil className="h-3.5 w-3.5" />
                                    Edit
                                </>
                            ) : (
                                <>
                                    <Plus className="h-3.5 w-3.5" />
                                    Assign
                                </>
                            )}
                        </Button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-px bg-border lg:grid-cols-4">
                <Cell label="Processor" value="Luqra" />
                <Cell label="Assigned" value={formatDate(row.luqra_mid_assigned_at)} />
                <Cell label="Descriptor" value={row.luqra_mid_descriptor ?? '—'} />
                <Cell
                    label="Status"
                    value={row.luqra_mid_status[0]?.toUpperCase() + row.luqra_mid_status.slice(1)}
                />
            </div>
        </div>
    )
}

function Cell({ label, value }: { label: string; value: string }) {
    return (
        <div className="bg-card px-4 py-3">
            <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                {label}
            </div>
            <div className="mt-0.5 text-[12.5px] text-foreground">{value}</div>
        </div>
    )
}

function formatDate(iso: string | null): string {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString()
}

export function MidsSection({ merchantId }: { merchantId: string }) {
    const { hasPermission } = useAdminPermissions()
    const canEdit = hasPermission('hq.merchant.update')
    const { data, isLoading } = useMerchantLocationMids(merchantId)
    const [dialogOpen, setDialogOpen] = useState(false)
    const [editing, setEditing] = useState<LocationMidRow | null>(null)

    const rows: LocationMidRow[] = data?.success ? data.data : []
    const locations = rows.map((r) => ({ id: r.id, name: r.name }))

    const openAssign = () => {
        setEditing(null)
        setDialogOpen(true)
    }

    const openEdit = (row: LocationMidRow) => {
        setEditing(row)
        setDialogOpen(true)
    }

    return (
        <div>
            <SectionHead
                title="Merchant IDs"
                sub="Luqra acquiring identifiers, one per location."
                actions={
                    canEdit && rows.length > 0 ? (
                        <Button size="sm" onClick={openAssign}>
                            <Plus className="h-3.5 w-3.5" />
                            Assign new MID
                        </Button>
                    ) : null
                }
            />

            {isLoading ? (
                <div className="space-y-3">
                    <Skeleton className="h-24 w-full" />
                    <Skeleton className="h-24 w-full" />
                </div>
            ) : rows.length === 0 ? (
                <EmptySection
                    icon={CreditCard}
                    title="No locations yet"
                    body="Create a location first, then assign a Luqra MID here."
                />
            ) : (
                <div className="space-y-3">
                    {rows.map((row) => (
                        <MidCard key={row.id} row={row} canEdit={canEdit} onEdit={openEdit} />
                    ))}
                </div>
            )}

            <AssignMidDialog
                merchantId={merchantId}
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                locations={locations}
                editing={editing}
            />
        </div>
    )
}
