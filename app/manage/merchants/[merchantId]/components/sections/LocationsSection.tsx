'use client'

import { MapPin } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
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
import { LocationSummary } from '@/types/merchant'
import { EmptySection } from './EmptySection'

function formatAddress(loc: LocationSummary) {
    const parts = [loc.address_line1, loc.city, loc.state, loc.postal_code].filter(Boolean)
    return parts.length ? parts.join(', ') : '—'
}

function formatMoney(n: number) {
    return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function formatToday(loc: LocationSummary) {
    return `${formatMoney(loc.revenue_today ?? 0)} (${loc.orders_today ?? 0})`
}

export function LocationsSection({ locations }: { locations: LocationSummary[] }) {
    const { pageRows, pagination, setPage } = useClientPagination(locations, 10)

    return (
        <Panel>
            <PanelSection
                label="Locations"
                caption={
                    locations.length
                        ? `${locations.length} total`
                        : 'All physical locations under this merchant.'
                }
            >
                {!locations.length ? (
                    <EmptySection
                        icon={MapPin}
                        title="No locations yet"
                        body="Locations the merchant adds will appear here."
                    />
                ) : (
                    <>
                        <Table variant="data" containerClassName="hidden lg:block" className="min-w-[560px]">
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Address</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Today</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {pageRows.map((loc) => (
                                    <TableRow key={loc.id}>
                                        <TableCell className="whitespace-nowrap font-medium text-foreground">
                                            {loc.name}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">{formatAddress(loc)}</TableCell>
                                        <TableCell className="whitespace-nowrap">
                                            <Badge
                                                variant="secondary"
                                                className="w-fit rounded-full border-0 px-2.5 text-xs font-medium"
                                            >
                                                {loc.is_active ? 'Live' : 'Offline'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="whitespace-nowrap text-right tabular-nums text-foreground">
                                            {formatMoney(loc.revenue_today ?? 0)}
                                            <span className="ml-1 text-muted-foreground">
                                                ({loc.orders_today ?? 0})
                                            </span>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>

                        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
                            {pageRows.map((loc) => (
                                <div key={loc.id} className="min-w-0 rounded-2xl border-0 bg-muted/45 p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <p className="min-w-0 truncate font-medium">{loc.name}</p>
                                        <span className="shrink-0 text-sm text-muted-foreground">
                                            {loc.is_active ? 'Live' : 'Offline'}
                                        </span>
                                    </div>
                                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                        <div className="min-w-0">
                                            <p className="text-xs text-muted-foreground">Address</p>
                                            <p className="truncate font-medium">{formatAddress(loc)}</p>
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-xs text-muted-foreground">Today</p>
                                            <p className="truncate font-medium tabular-nums">{formatToday(loc)}</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <PaginationBar pagination={pagination} onPageChange={setPage} itemLabel="locations" />
                    </>
                )}
            </PanelSection>
        </Panel>
    )
}
