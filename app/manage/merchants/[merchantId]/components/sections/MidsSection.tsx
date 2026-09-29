'use client'

import { useState } from 'react'
import { CreditCard, Plus, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Panel, PanelSection } from '@/components/dashboard/shell'
import { PaginationBar } from '@/components/dashboard/PaginationBar'
import { useClientPagination } from '@/lib/hooks/useClientPagination'
import { useMerchantLocationMids } from '@/lib/queries/use-luqra'
import type { LocationMidRow } from '@/app/manage/actions/admin-merchant/luqra'
import { useAdminPermissions } from '@/lib/hooks/useAdminPermissions'
import { EmptySection } from './EmptySection'
import { AssignMidDialog } from './AssignMidDialog'

function formatDate(iso: string | null): string {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString()
}

function statusLabel(status: string): string {
    return status ? status[0].toUpperCase() + status.slice(1) : '—'
}

function CardField({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
    return (
        <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`truncate font-medium tabular-nums${mono ? ' font-mono' : ''}`}>{value}</p>
        </div>
    )
}

function EditButton({
    row,
    onEdit,
    className,
}: {
    row: LocationMidRow
    onEdit: (row: LocationMidRow) => void
    className?: string
}) {
    const hasMid = !!row.luqra_mid
    return (
        <Button variant="ghost" size="sm" className={className} onClick={() => onEdit(row)}>
            {hasMid ? <Pencil className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {hasMid ? 'Edit' : 'Assign'}
        </Button>
    )
}

export function MidsSection({ merchantId }: { merchantId: string }) {
    const { hasPermission } = useAdminPermissions()
    const canEdit = hasPermission('hq.merchant.update')
    const { data, isLoading } = useMerchantLocationMids(merchantId)
    const [dialogOpen, setDialogOpen] = useState(false)
    const [editing, setEditing] = useState<LocationMidRow | null>(null)

    const rows: LocationMidRow[] = data?.success ? data.data : []
    const locations = rows.map((r) => ({ id: r.id, name: r.name }))
    const { pageRows, pagination, setPage } = useClientPagination(rows, 10)

    const openAssign = () => {
        setEditing(null)
        setDialogOpen(true)
    }

    const openEdit = (row: LocationMidRow) => {
        setEditing(row)
        setDialogOpen(true)
    }

    return (
        <Panel>
            <PanelSection
                label="Merchant IDs"
                caption="Luqra acquiring identifiers, one per location."
                action={
                    canEdit && rows.length > 0 ? (
                        <Button size="sm" onClick={openAssign}>
                            <Plus className="h-3.5 w-3.5" />
                            Assign new MID
                        </Button>
                    ) : null
                }
            >
                {isLoading ? (
                    <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
                        {Array.from({ length: 2 }).map((_, i) => (
                            <div key={i} className="space-y-3 rounded-2xl border-0 bg-muted/45 p-4">
                                <Skeleton className="h-4 w-40" />
                                <Skeleton className="h-4 w-full" />
                            </div>
                        ))}
                    </div>
                ) : rows.length === 0 ? (
                    <EmptySection
                        icon={CreditCard}
                        title="No locations yet"
                        body="Create a location first, then assign a Luqra MID here."
                    />
                ) : (
                    <>
                        <Table variant="data" containerClassName="hidden lg:block" className="min-w-[680px]">
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Location</TableHead>
                                    <TableHead>MID</TableHead>
                                    <TableHead>Descriptor</TableHead>
                                    <TableHead>Processor</TableHead>
                                    <TableHead>Assigned</TableHead>
                                    <TableHead>Status</TableHead>
                                    {canEdit && <TableHead className="w-24" />}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {pageRows.map((row) => (
                                    <TableRow key={row.id}>
                                        <TableCell className="font-medium text-foreground">{row.name}</TableCell>
                                        <TableCell className="font-mono text-xs">
                                            {row.luqra_mid ?? (
                                                <span className="font-sans text-muted-foreground">No MID assigned</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">
                                            {row.luqra_mid_descriptor ?? '—'}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">TSYS</TableCell>
                                        <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                                            {formatDate(row.luqra_mid_assigned_at)}
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                variant="secondary"
                                                className="w-fit rounded-full border-0 px-2.5 text-xs font-medium"
                                            >
                                                {statusLabel(row.luqra_mid_status)}
                                            </Badge>
                                        </TableCell>
                                        {canEdit && (
                                            <TableCell className="text-right">
                                                <EditButton row={row} onEdit={openEdit} className="h-8 rounded-full px-3" />
                                            </TableCell>
                                        )}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>

                        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
                            {pageRows.map((row) => (
                                <div key={row.id} className="min-w-0 rounded-2xl border-0 bg-muted/45 p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="truncate font-medium">{row.name}</p>
                                            <p className="truncate font-mono text-xs text-muted-foreground">
                                                {row.luqra_mid ?? 'No MID assigned'}
                                            </p>
                                        </div>
                                        <span className="shrink-0 text-sm text-muted-foreground">
                                            {statusLabel(row.luqra_mid_status)}
                                        </span>
                                    </div>
                                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                        <CardField label="Processor" value="TSYS" />
                                        <CardField label="Assigned" value={formatDate(row.luqra_mid_assigned_at)} />
                                        <CardField label="Descriptor" value={row.luqra_mid_descriptor ?? '—'} />
                                    </div>
                                    {canEdit && (
                                        <div className="mt-3 flex justify-end">
                                            <EditButton row={row} onEdit={openEdit} className="h-9 rounded-full px-4" />
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        <PaginationBar pagination={pagination} onPageChange={setPage} itemLabel="locations" />
                    </>
                )}
            </PanelSection>

            <AssignMidDialog
                merchantId={merchantId}
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                locations={locations}
                editing={editing}
            />
        </Panel>
    )
}
