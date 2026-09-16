'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import {
    Building2,
    Search,
    Filter,
    Plus,
    MoreHorizontal,
    Users,
    DollarSign,
    Target,
    ArrowUpRight,
    ArrowDownRight,
    CheckCircle,
} from 'lucide-react'
import Link from 'next/link'
import {
    PageHeader,
    PageShell,
    Panel,
    StatRow,
    StatTile,
} from '@/components/dashboard/shell'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useCarrierOrganizations } from '../hooks/useCarrierOrganizations'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'


export default function OrganizationsPage() {
    const router = useRouter()
        const { data: organizationsData, isLoading, error } = useCarrierOrganizations()
    const [search, setSearch] = useState('')

    /**
     * `useCarrierOrganizations` types its data as `any[] | Error`, so every
     * `.filter`/`.map` on it was individually untyped. Narrowing inside the
     * memo keeps the call sites clean without creating a fresh array identity
     * on every render. An `Error` was never a mappable list, so this changes
     * no behaviour — only what TypeScript can see.
     */
    const filteredOrganizations = useMemo(() => {
        const organizations = Array.isArray(organizationsData) ? organizationsData : []
        const query = search.trim().toLowerCase()
        if (!query) return organizations
        return organizations.filter((org) =>
            org.name?.toLowerCase().includes(query) ||
            org.clerk_org_id?.toLowerCase().includes(query)
        )
    }, [organizationsData, search])
    /* Shaped to the converted page (§2.3): one panel of stat tiles, then the
       tinted table well — so the skeleton promises the chrome that arrives. */
    if (isLoading) return (
        <PageShell as="div" className="animate-in fade-in-0 duration-300">
            {/* Header skeleton */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2">
                    <div className="h-7 w-48 animate-pulse rounded-md bg-muted" />
                    <div className="h-4 w-72 max-w-full animate-pulse rounded-md bg-muted" />
                </div>
                <div className="h-9 w-32 animate-pulse rounded-full bg-muted" />
            </div>

            {/* KPI panel skeleton */}
            <Panel>
                <div className="grid grid-cols-1 gap-y-6 px-4 py-6 sm:grid-cols-2 sm:gap-x-10 sm:px-6 lg:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="min-w-0">
                            <div className="h-4 w-24 max-w-full animate-pulse rounded-md bg-muted" />
                            <div className="mt-2 h-7 w-28 max-w-full animate-pulse rounded-md bg-muted" />
                            <div className="mt-2 h-3 w-40 max-w-full animate-pulse rounded-md bg-muted" />
                        </div>
                    ))}
                </div>
            </Panel>

            {/* Toolbar skeleton */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-2">
                    <div className="h-5 w-40 animate-pulse rounded-md bg-muted" />
                    <div className="h-4 w-64 max-w-full animate-pulse rounded-md bg-muted" />
                </div>
                <div className="flex min-w-0 items-center gap-2">
                    <div className="h-9 min-w-0 flex-1 animate-pulse rounded-full bg-muted sm:w-72 sm:flex-none" />
                    <div className="h-9 w-20 max-w-[35%] shrink-0 animate-pulse rounded-full bg-muted" />
                </div>
            </div>

            {/* Table well skeleton — no rules between rows (§5.5) */}
            <div className="overflow-hidden rounded-2xl bg-muted/20">
                <div className="h-10 bg-muted/50" />
                <div className="space-y-px">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="grid grid-cols-12 items-center gap-4 bg-card/70 px-3 py-3">
                            <div className="col-span-3 h-4 animate-pulse rounded-md bg-muted" />
                            <div className="col-span-2 h-4 animate-pulse rounded-md bg-muted" />
                            <div className="col-span-2 h-4 animate-pulse rounded-md bg-muted" />
                            <div className="col-span-1 h-4 animate-pulse rounded-md bg-muted" />
                            <div className="col-span-1 h-4 animate-pulse rounded-md bg-muted" />
                            <div className="col-span-2 h-4 animate-pulse rounded-md bg-muted" />
                            <div className="col-span-1 h-8 w-8 animate-pulse justify-self-end rounded-full bg-muted" />
                        </div>
                    ))}
                </div>
            </div>
        </PageShell>
    )

    /* The spinning ring read as "still loading" in an error state. A static
       glyph on the inset material states the failure instead, and the two
       recovery controls are real `Button`s rather than bare `<button>`s
       (§4.2: a raw button no longer matches the pill shape of the system). */
    if (error) return (
        <PageShell as="div" className="animate-in fade-in-0 duration-300">
            <div className="flex flex-col items-center justify-center gap-4 rounded-2xl bg-muted/30 px-4 py-20">
                <Building2 className="h-12 w-12 text-muted-foreground" />
                <div className="space-y-2 text-center">
                    <h2 className="text-lg font-semibold">We hit a snag loading organizations</h2>
                    <p className="text-sm text-muted-foreground">{error.message}</p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                    <Button onClick={() => window.location.reload()}>Retry</Button>
                    <Button variant="outline" onClick={() => history.back()}>
                        Go Back
                    </Button>
                </div>
            </div>
        </PageShell>
    )
    return (
        /* `as="div"`: app/manage/layout.tsx already owns this surface's <main>. */
        <PageShell as="div">
            <PageHeader
                title="Organizations"
                subtitle="Manage your partner organizations and their performance"
                actions={
                    <Button asChild className="h-9 px-4">
                        <Link href="/manage/organizations/create-organization">
                            <Plus className="mr-2 h-4 w-4" />
                            Create Organization
                        </Link>
                    </Button>
                }
            />

            {/*
              ⚠️ PLACEHOLDER DATA — these four figures and their "from last
              month" deltas are hardcoded, not queried. Ported verbatim under
              the §7 behaviour freeze (presentation only); wiring them to real
              data is filed separately as
              docs/features/hq-redesign/organizations-placeholder-kpis-ticket.md.
              The delta text keeps its literal value but loses the green tint —
              colour marks real severity only (D-03/§4.6b).
            */}
            <Panel>
                <div className="px-4 py-6 sm:px-6">
                    <StatRow columns={4}>
                        <StatTile
                            label="Total Partners"
                            value="1,234"
                            meta="+12.5% from last month"
                            icon={<Building2 />}
                        />
                        <StatTile
                            label="Total Sales"
                            value="$2.4M"
                            meta="+8.2% from last month"
                            icon={<DollarSign />}
                        />
                        <StatTile
                            label="Avg. Conversion"
                            value="11.2%"
                            meta="+2.1% from last month"
                            icon={<Target />}
                        />
                        <StatTile
                            label="Active Partners"
                            value="1,156"
                            meta="+5.3% from last month"
                            icon={<Users />}
                        />
                    </StatRow>
                </div>
            </Panel>

            {/* Toolbar — not wrapped in a Panel (§5.2): the table's own tinted
                well is the surface, so a card here would box a box. */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                    <h2 className="text-[1.0625rem] font-semibold text-[#0C4FD1] dark:text-[#6CA0FF]">
                        Partner Organizations
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Manage and monitor your partner organizations
                    </p>
                </div>
                <div className="flex min-w-0 items-center gap-2">
                    <div className="relative min-w-0 flex-1 sm:flex-none">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
                        <Input
                            placeholder="Search by name, domain, or organization ID"
                            className="h-9 w-full border-0 bg-muted/60 pl-9 text-[0.8125rem] shadow-none focus-visible:bg-background sm:w-72"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-9 shrink-0 border-0 bg-muted/60 px-3 text-[0.8125rem] text-muted-foreground shadow-none hover:bg-muted hover:text-foreground"
                    >
                        <Filter className="mr-2 h-4 w-4" />
                        Filter
                    </Button>
                </div>
            </div>

            <div className="min-w-0">
                    <Table
                        variant="data"
                        containerClassName="hidden lg:block"
                        className="min-w-[900px]"
                    >
                        <TableHeader className="[&_tr]:border-0">
                            <TableRow>
                                <TableHead>Name</TableHead>
                                {/* <TableHead>Domains</TableHead> */}
                                {/* <TableHead>Single Sign-On</TableHead> */}
                                <TableHead>Directory Sync</TableHead>
                                <TableHead>Users</TableHead>
                                <TableHead>Sales</TableHead>
                                <TableHead>Conversion</TableHead>
                                <TableHead>Growth</TableHead>
                                <TableHead>Created</TableHead>
                                <TableHead className="w-[70px]">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredOrganizations.map((org) => (
                                <TableRow key={org.id} className='cursor-pointer' onClick={() => router.push(`/manage/organizations/${org.clerk_org_id}`)}>
                                    <TableCell className="font-medium">
                                        <div>
                                            <div className="font-semibold">{org.name}</div>
                                            <div className="text-sm text-muted-foreground">ID: {org.clerk_org_id}</div>
                                        </div>
                                    </TableCell>
                                    {/* <TableCell>
                                        <Badge variant="outline">{org.domain}</Badge>
                                    </TableCell> */}
                                    {/* <TableCell>
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                            <span className="text-sm">{org.sso}</span>
                                        </div>
                                    </TableCell> */}
                                    <TableCell>
                                        {org.directorySync ? (
                                            <div className="flex items-center gap-2">
                                                <CheckCircle className="h-4 w-4 text-green-600" />
                                                <span className="text-sm">Enabled</span>
                                            </div>
                                        ) : (
                                            <span className="text-muted-foreground">-</span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-1 tabular-nums">
                                            <Users className="h-4 w-4 text-muted-foreground" />
                                            <span>{org.organizations.members.length}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="font-medium tabular-nums">
                                        {/* ${org.sales.toLocaleString()} */}
                                        $0
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-1 tabular-nums">
                                            <Target className="h-4 w-4 text-muted-foreground" />
                                            {/* <span>{org.conversions}%</span> */}
                                            <span>0%</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {/* Direction stays legible through the glyph; the
                                            red/green tint is dropped per D-03. */}
                                        <div className="flex items-center gap-1 tabular-nums">
                                            {org.growth > 0 ? (
                                                <ArrowUpRight className="h-3 w-3 text-muted-foreground" />
                                            ) : (
                                                <ArrowDownRight className="h-3 w-3 text-muted-foreground" />
                                            )}
                                            {/* {org.growth > 0 ? '+' : ''}{org.growth}% */}
                                            <span>0%</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                        {new Date(org.created_at).toLocaleDateString('en-US', {
                                            month: 'short',
                                            day: 'numeric',
                                            year: 'numeric'
                                        })}
                                    </TableCell>
                                    <TableCell>
                                        {/* Row actions: a `rounded-full` ghost icon
                                            button (§5.2). `stopPropagation` so opening
                                            the menu does not also navigate the row. */}
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button
                                                    variant="ghost"
                                                    aria-label={`Actions for ${org.name}`}
                                                    className="h-8 w-8 rounded-full p-0"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                <DropdownMenuItem>
                                                    View Details
                                                </DropdownMenuItem>
                                                <DropdownMenuItem>
                                                    Edit Organization
                                                </DropdownMenuItem>
                                                <DropdownMenuItem>
                                                    View Analytics
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem>
                                                    Manage Users
                                                </DropdownMenuItem>
                                                <DropdownMenuItem>
                                                    Configure SSO
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem variant="destructive">
                                                    Suspend Organization
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>

                    {/* §5.3 mobile: a card grid, never a scrolling table. This page
                        previously had only the table, so narrow screens got a
                        horizontal scroll. */}
                    <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
                        {filteredOrganizations.map((org) => (
                            <div
                                key={org.id}
                                className="min-w-0 cursor-pointer rounded-2xl border-0 bg-muted/45 p-4 transition-colors hover:bg-muted"
                                onClick={() => router.push(`/manage/organizations/${org.clerk_org_id}`)}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="truncate font-semibold">{org.name}</p>
                                        <p className="truncate text-xs text-muted-foreground">
                                            ID: {org.clerk_org_id}
                                        </p>
                                    </div>
                                    {org.directorySync && (
                                        <Badge
                                            variant="secondary"
                                            className="w-fit shrink-0 rounded-full border-0 px-2.5 text-xs font-medium"
                                        >
                                            <CheckCircle className="mr-1 h-3 w-3" />
                                            Sync
                                        </Badge>
                                    )}
                                </div>

                                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                    <div className="min-w-0">
                                        <p className="text-xs text-muted-foreground">Users</p>
                                        <p className="font-medium tabular-nums">
                                            {org.organizations.members.length}
                                        </p>
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-xs text-muted-foreground">Sales</p>
                                        <p className="font-medium tabular-nums">$0</p>
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-xs text-muted-foreground">Conversion</p>
                                        <p className="font-medium tabular-nums">0%</p>
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-xs text-muted-foreground">Growth</p>
                                        <p className="font-medium tabular-nums">0%</p>
                                    </div>
                                </div>

                                <p className="mt-3 text-xs text-muted-foreground">
                                    Created{' '}
                                    {new Date(org.created_at).toLocaleDateString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric',
                                    })}
                                </p>
                            </div>
                        ))}
                    </div>
            </div>
        </PageShell>
    )
}
