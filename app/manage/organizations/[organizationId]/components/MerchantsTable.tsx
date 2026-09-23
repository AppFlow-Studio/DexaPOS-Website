'use client'

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { MoreHorizontal, Store, Target, TrendingUp, TrendingDown, Users } from 'lucide-react'
import { MerchantsModel } from '@/types/db-modles'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

const formatDate = (value?: string) =>
    value
        ? new Date(value).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        })
        : '-'

/** The merchant's logo, or a neutral glyph when it has none. */
const MerchantLogo = ({ merchant, size = 'h-8 w-8' }: { merchant: any; size?: string }) => (
    <div className={`${size} flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary/10`}>
        {merchant?.public_metadata?.imageURL ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
                src={merchant.public_metadata.imageURL}
                alt={merchant.business_name || merchant.name}
                className="h-full w-full object-cover"
            />
        ) : (
            <Store className="h-4 w-4 text-primary" />
        )}
    </div>
)

/**
 * One neutral pill for every state (D-03). The previous version colour-coded
 * active/pending/suspended green/amber/red; an onboarding state is not an
 * alarm, so status is carried by the word alone.
 */
const StatusBadge = ({ status }: { status?: string }) => {
    if (!status) return <span className="text-muted-foreground">-</span>
    return (
        <Badge
            variant="secondary"
            className="w-fit rounded-full border-0 px-2.5 text-xs font-medium capitalize"
        >
            {status}
        </Badge>
    )
}

/** Direction reads from the glyph; the red/green tint is dropped (D-03). */
const GrowthCell = ({ rate }: { rate?: number }) => (
    <span className="inline-flex items-center gap-1 tabular-nums">
        {(rate ?? 0) > 0 ? (
            <TrendingUp className="h-3 w-3 text-muted-foreground" />
        ) : (
            <TrendingDown className="h-3 w-3 text-muted-foreground" />
        )}
        {(rate ?? 0) > 0 ? '+' : ''}{rate || 0}%
    </span>
)

/** A label/value pair inside a mobile record card. */
const CardField = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate font-medium tabular-nums">{value}</p>
    </div>
)

const RowActions = ({ clerkOrgId, name }: { clerkOrgId: string; name: string }) => (
    /* The previous menu had six items and none had a handler, so every click
       fell through to the row and did the same thing. Only the action with a
       real destination survives — "Edit Merchant", "View Analytics", "Send
       Login Link", "Reset Password" and "Suspend Account" named features that
       exist nowhere in the product. */
    <DropdownMenu>
        <DropdownMenuTrigger asChild>
            <Button
                variant="ghost"
                aria-label={`Actions for ${name}`}
                className="h-8 w-8 rounded-full p-0"
                onClick={(e) => e.stopPropagation()}
            >
                <MoreHorizontal className="h-4 w-4" />
            </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem asChild>
                <Link href={`/manage/merchants/${clerkOrgId}`}>View details</Link>
            </DropdownMenuItem>
        </DropdownMenuContent>
    </DropdownMenu>
)

export const MerchantsTable = ({ merchants }: { merchants: MerchantsModel[] }) => {
    const router = useRouter()

    if (!merchants || merchants?.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center space-y-4 rounded-2xl bg-muted/30 px-4 py-12">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted/50">
                    <Store className="h-8 w-8 text-muted-foreground" />
                </div>
                <div className="space-y-2 text-center">
                    <h3 className="text-lg font-semibold">No merchants yet</h3>
                    <p className="max-w-md text-sm text-muted-foreground">
                        This organization doesn&apos;t have any merchants yet. Create a merchant account to get started.
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className="min-w-0">
            {/* §5.3: two trees off one dataset — the data table from `xl`, a card
                grid below it. Never a horizontally scrolling table on a phone. */}
            <Table
                variant="data"
                containerClassName="hidden xl:block"
                className="min-w-[900px]"
            >
                <TableHeader className="[&_tr]:border-0">
                    <TableRow>
                        <TableHead>Merchant</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Sales</TableHead>
                        <TableHead className="text-right">Transactions</TableHead>
                        <TableHead className="text-right">Conversion</TableHead>
                        <TableHead className="text-right">Growth</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead className="w-[70px]">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {merchants.map((merchant: any) => (
                        <TableRow
                            key={merchant.id}
                            className="cursor-pointer"
                            onClick={() => router.push(`/manage/merchants/${merchant.clerk_org_id}`)}
                        >
                            <TableCell className="font-medium">
                                <div className="flex min-w-0 items-center gap-3">
                                    <MerchantLogo merchant={merchant} />
                                    <div className="min-w-0">
                                        <div className="font-semibold">{merchant.name}</div>
                                        <div className="text-sm text-muted-foreground">ID: {merchant.clerk_org_id}</div>
                                    </div>
                                </div>
                            </TableCell>
                            <TableCell>
                                <StatusBadge status={merchant.status} />
                            </TableCell>
                            <TableCell className="text-right font-medium tabular-nums">
                                ${merchant.total_sales?.toLocaleString() || '0'}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                                <span className="inline-flex items-center gap-1">
                                    <Users className="h-4 w-4 text-muted-foreground" />
                                    {merchant.transaction_count || 0}
                                </span>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                                <span className="inline-flex items-center gap-1">
                                    <Target className="h-4 w-4 text-muted-foreground" />
                                    {merchant.conversion_rate || 0}%
                                </span>
                            </TableCell>
                            <TableCell className="text-right">
                                <GrowthCell rate={merchant.growth_rate} />
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                                {formatDate(merchant.created_at)}
                            </TableCell>
                            <TableCell>
                                <RowActions clerkOrgId={merchant.clerk_org_id} name={merchant.name} />
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>

            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:hidden">
                {merchants.map((merchant: any) => (
                    <div
                        key={merchant.id}
                        className="min-w-0 cursor-pointer rounded-2xl border-0 bg-muted/45 p-4 transition-colors hover:bg-muted"
                        onClick={() => router.push(`/manage/merchants/${merchant.clerk_org_id}`)}
                    >
                        {/* The logo and the raw org id are both dropped here:
                            neither is actionable on a phone, and together they
                            cost the card a 32px column and a second line under
                            every name. The desktop table still carries the id. */}
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                                <p className="truncate font-semibold">{merchant.name}</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                                <StatusBadge status={merchant.status} />
                                <RowActions clerkOrgId={merchant.clerk_org_id} name={merchant.name} />
                            </div>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                            <CardField label="Sales" value={`$${merchant.total_sales?.toLocaleString() || '0'}`} />
                            <CardField label="Transactions" value={merchant.transaction_count || 0} />
                            <CardField label="Conversion" value={`${merchant.conversion_rate || 0}%`} />
                            <CardField label="Growth" value={<GrowthCell rate={merchant.growth_rate} />} />
                        </div>

                        <p className="mt-3 text-xs text-muted-foreground">
                            Created {formatDate(merchant.created_at)}
                        </p>
                    </div>
                ))}
            </div>
        </div>
    )
}
