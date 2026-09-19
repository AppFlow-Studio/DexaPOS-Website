'use client'

import Link from 'next/link'
import { useOrganizationInfo } from "../../hooks/useOrganizationInfo"
import {
    PageHeader,
    PageShell,
    Panel,
    PanelSection,
    StatRow,
    StatTile,
} from '@/components/dashboard/shell'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { MoreHorizontal, Shield, Settings, UserPlus2, Users, AlertTriangle, Trash2, Building2 } from 'lucide-react'
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react'
import { SendAdminInviteButton } from './components/SendAdminInviteButton'
import { SendOrganizationMembersInviteButton } from './components/SendOrganizationMembersInviteButton'
import { MerchantsModel, PendingOrgAdminInvitesModel, UsersModel } from '@/types/db-modles'
import { RevokeAdminInvitePopup } from './components/RevokeAdminInvitePopup'
import { RemoveUserPopup } from './components/RemoveUserPopup'
import { ResendAdminInvitePopup } from './components/ResendAdminInvitePopup'
import { AddMerchantButton } from './components/AddMerchantButtons'
import { MerchantsTable } from './components/MerchantsTable'
import { DeleteOrganizationDialog } from './components/DeleteOrganizationDialog'
import { AdminInviteWizard } from './components/AdminInviteWizard'
/**
 * The tab set, in render order. Hoisted so the `?tab=` deep link can validate
 * against the same list the strip renders from — two copies would drift.
 */
const ORG_TABS = [
    { value: 'overview', label: 'Overview' },
    { value: 'members', label: 'Members' },
    { value: 'merchants', label: 'Merchants' },
    { value: 'roles', label: 'Roles' },
    { value: 'invites', label: 'Invites' },
    { value: 'audit', label: 'Audit Logs' },
    { value: 'settings', label: 'Settings' },
] as const

/**
 * The role catalogue shown on the Roles tab.
 *
 * Hoisted so the table and the mobile card grid render from one list rather
 * than two copies of the same literal. Note these are hardcoded, not queried —
 * the tab is a static reference view, and its buttons link out to
 * `/manage/roles-permissions` where roles are actually managed.
 */
const ORG_ROLES = [
    { name: 'Member', slug: 'member', desc: 'Default user role', perms: [] as string[] },
    { name: 'Admin', slug: 'admin', desc: 'Manage all organization resources', perms: ['pos:stores:manage'] },
    { name: 'Store Manager', slug: 'store-manager', desc: 'Manage assigned store, products, staff', perms: ['pos:store:manage'] },
    { name: 'Cashier', slug: 'cashier', desc: 'Process sales and refunds', perms: ['pos:sales:create'] },
]

/**
 * Renders a permission code with `|` separators for display.
 *
 * The stored form keeps `:` — that is the canonical separator used by
 * `user_has_location_permission` and the rest of the permission system — so
 * this is a presentation concern only and is applied at the render site rather
 * than in the data above.
 */
const formatPermission = (code: string) => code.split(':').join(' | ')

export default function OrganizationInfoPage() {
    const { organizationId } = useParams()
    const router = useRouter()
    const { data, isLoading, error, refetch: refetchOrganizationInfo } = useOrganizationInfo(organizationId as string)
    const [revokeAdminInvitePopup, setRevokeAdminInvitePopup] = useState<PendingOrgAdminInvitesModel | null>(null)
    const [openRevokeAdminInvitePopup, setOpenRevokeAdminInvitePopup] = useState(false)
    const [removeUserPopup, setRemoveUserPopup] = useState<UsersModel | null>(null)
    const [openRemoveUserPopup, setOpenRemoveUserPopup] = useState(false)
    const [resendAdminInvitePopup, setResendAdminInvitePopup] = useState<PendingOrgAdminInvitesModel | null>(null)
    const [openResendAdminInvitePopup, setOpenResendAdminInvitePopup] = useState(false)
    const [openDeleteOrganizationDialog, setOpenDeleteOrganizationDialog] = useState(false)
    /**
     * `?tab=` seeds the initial tab, so a direct link can open one (e.g.
     * `…?tab=members`). Read on mount only — the tab is local state
     * afterwards, so clicking a tab does not push a history entry per tab.
     *
     * ⚠️ Deep-linking here is reliable on a **direct page load** but not from a
     * client-side navigation elsewhere in the app: the query string is dropped
     * in transit, and the page falls back to Overview. That is why the
     * organizations list's row menu does not link to a tab. Fix the query loss
     * before relying on this from another route.
     */
    const searchParams = useSearchParams()
    const requestedTab = searchParams.get('tab')
    const [activeTab, setActiveTab] = useState(
        requestedTab && ORG_TABS.some((t) => t.value === requestedTab)
            ? requestedTab
            : 'overview'
    )
    const [inviteSearch, setInviteSearch] = useState('')

    /**
     * Scroll the strip so the selected section sits centred in the rail —
     * moving right or left as the selection moves, and clamped at both ends so
     * the first and last tabs rest flush instead of leaving dead space.
     *
     * Scrolls the rail itself rather than calling `scrollIntoView` on the tab:
     * that walks up to every scrollable ancestor and would yank the whole page
     * vertically as well.
     *
     * Centring rather than nudging-into-view: a tab that is technically visible
     * but half-clipped at an edge still reads as cut off, and the neighbours on
     * both sides stay discoverable when the active pill is mid-rail.
     */
    const tabStripRef = useRef<HTMLDivElement | null>(null)
    const hasScrolledTabIntoView = useRef(false)
    useEffect(() => {
        const rail = tabStripRef.current
        // `isLoading` in the deps, not just `activeTab`: while the query is in
        // flight this component returns the skeleton early, so the rail has not
        // rendered and the ref is still null. Without re-running once the data
        // lands, the effect only ever saw that null and never scrolled.
        if (!rail) return

        // Measured via `ResizeObserver` rather than a single frame: on a cold
        // load the strip is not yet at its final width when the effect runs,
        // so a one-shot `requestAnimationFrame` measured the active tab as
        // already in view and never scrolled. The observer fires once the rail
        // has real width, which covers both first paint and later resizes.
        let aligned = false
        const align = () => {
            const maxScroll = rail.scrollWidth - rail.clientWidth
            if (aligned || maxScroll <= 0) return
            const tab = rail.querySelector<HTMLElement>(`[data-tab-value="${activeTab}"]`)
            if (!tab) return

            // `offsetLeft` is relative to the rail's content box, so it is
            // unaffected by the current scroll position — unlike a
            // `getBoundingClientRect()` delta, which has to be re-derived each
            // time the rail moves.
            const target = tab.offsetLeft - (rail.clientWidth - tab.offsetWidth) / 2
            const next = Math.max(0, Math.min(target, maxScroll))

            // No animation for the first positioning — a deep-linked tab should
            // already be in place rather than sliding in after the page settles.
            const behavior: ScrollBehavior = hasScrolledTabIntoView.current ? 'smooth' : 'auto'
            rail.scrollTo({ left: next, behavior })

            aligned = true
            hasScrolledTabIntoView.current = true
        }

        align()
        const observer = new ResizeObserver(align)
        observer.observe(rail)
        return () => observer.disconnect()
    }, [activeTab, isLoading, error])

    /* Shaped to the converted page: header block, then one panel. */
    if (isLoading) return (
        <PageShell as="div" className="animate-in fade-in-0 duration-300">
            <div className="h-5 w-56 animate-pulse rounded-md bg-muted" />
            <Panel padded>
                <div className="mb-6 flex items-center gap-4">
                    <div className="h-12 w-12 animate-pulse rounded-lg bg-muted" />
                    <div className="space-y-2">
                        <div className="h-6 w-40 animate-pulse rounded-md bg-muted" />
                        <div className="h-4 w-64 max-w-full animate-pulse rounded-md bg-muted" />
                    </div>
                </div>
                <div className="h-10 w-full animate-pulse rounded-full bg-muted" />
            </Panel>
        </PageShell>
    )

    /* The spinning ring read as "still loading" in an error state; a static
       glyph on the inset material states the failure instead, and the recovery
       controls are real `Button`s rather than bare `<button>`s (§4.2). */
    if (error) return (
        <PageShell as="div" className="animate-in fade-in-0 duration-300">
            <div className="flex flex-col items-center justify-center gap-4 rounded-2xl bg-muted/30 px-4 py-20">
                <Shield className="h-12 w-12 text-muted-foreground" />
                <div className="space-y-2 text-center">
                    <h2 className="text-lg font-semibold">Unable to load organization details</h2>
                    <p className="text-sm text-muted-foreground">{error.message}</p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                    <Button onClick={() => window.location.reload()}>Retry</Button>
                    <Button variant="outline" onClick={() => history.back()}>Go Back</Button>
                </div>
            </div>
        </PageShell>
    )

    const org: any = data
    const orgName = org?.name || 'Organization'
    const orgId = org?.id
    const orgImage = org?.imageURL
    const orgDomain = org?.domain || org?.domains?.[0]
    const createdAt = org?.created_at
    const members = org?.members || []
    const carrierId = org?.carriers?.id

    const inviteQuery = inviteSearch.trim().toLowerCase()
    const matchesInvite = (inv: any) =>
        !inviteQuery ||
        inv?.email?.toLowerCase().includes(inviteQuery) ||
        inv?.role?.toLowerCase?.().includes(inviteQuery)
    const filteredAdminInvites = (org?.pending_org_admin_invites || []).filter(matchesInvite)
    const filteredMemberInvites = (org?.pending_org_member_invites || []).filter(matchesInvite)

    return (
        /* `as="div"`: app/manage/layout.tsx already owns this surface's <main>. */
        <PageShell as="div">
            {/* The hand-rolled breadcrumb becomes the standard back pill (D-04). */}
            <PageHeader
                title={orgName}
                backHref="/manage/organizations"
                backLabel="Back to Organizations"
                actions={
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setActiveTab('settings')}
                        className="h-9 border-0 bg-muted/60 px-3 text-[0.8125rem] text-muted-foreground shadow-none hover:bg-muted hover:text-foreground"
                    >
                        <Settings className="mr-2 h-4 w-4" /> Settings
                    </Button>
                }
            />

            {/* Identity row: the logo and the org's metadata badges. Previously
                this was a `CardHeader` whose `CardTitle` competed with the page
                title; the name now lives in `PageHeader` and this row carries
                only the identifiers. */}
            <div className="flex min-w-0 items-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary/10">
                    {orgImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={orgImage} alt={orgName} className="h-full w-full object-cover" />
                    ) : (
                        <Shield className="h-6 w-6 text-primary" />
                    )}
                </div>
                <div className="min-w-0 flex-1">
                    {orgId && (
                        <Badge
                            variant="secondary"
                            className="flex max-w-full rounded-full border-0 font-mono text-xs sm:max-w-none"
                        >
                            <span className="block truncate">{orgId}</span>
                        </Badge>
                    )}
                    <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
                        {orgDomain && (
                            <Badge variant="secondary" className="rounded-full border-0 px-2.5 text-xs font-medium">
                                {orgDomain}
                            </Badge>
                        )}
                        {createdAt && (
                            <span className="text-xs text-muted-foreground">Created {new Date(createdAt).toLocaleDateString()}</span>
                        )}
                    </div>
                </div>
            </div>

            {/* Tabs — the canonical pill strip on muted material, replacing the
                bordered `TabsList` inside a card. The strip scrolls the active
                tab into view (`no-scrollbar` keeps the rail invisible), so the
                selected tab is never left off-screen on a phone. */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <div ref={tabStripRef} className="no-scrollbar -mx-1 overflow-x-auto px-1">
                    <TabsList className="inline-flex h-auto w-max flex-nowrap gap-0.5 rounded-full bg-muted/70 p-1">
                        {ORG_TABS.map(({ value, label }) => (
                            <TabsTrigger
                                key={value}
                                value={value}
                                data-tab-value={value}
                                className="shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border"
                            >
                                {label}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </div>

                {/* Overview */}
                <TabsContent value="overview" className="mt-6">
                    <Panel>
                        <div className="px-4 py-6 sm:px-6">
                            <StatRow columns={2}>
                                <StatTile
                                    label="Stores"
                                    value={org?.stores_count ?? 0}
                                    meta="Total active POS locations"
                                    icon={<Building2 />}
                                />
                                <StatTile
                                    label="Members"
                                    value={members?.length ?? 0}
                                    meta="Includes owners, managers and cashiers"
                                    icon={<Users />}
                                />
                            </StatRow>
                        </div>
                    </Panel>
                </TabsContent>

                {/* Roles */}
                <TabsContent value="roles" className="mt-6">
                    <div className="space-y-6">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                                <h2 className="text-[1.0625rem] font-semibold text-[#0C4FD1] dark:text-[#6CA0FF]">
                                    Organization roles
                                </h2>
                                <p className="mt-1 text-sm text-muted-foreground">Assign POS roles to manage access for merchants and staff.</p>
                            </div>
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                                <Button variant="outline" size="sm" onClick={() => router.push('/manage/roles-permissions')}>Edit priority</Button>
                                <Button size="sm" onClick={() => router.push('/manage/roles-permissions')}>Create role</Button>
                            </div>
                        </div>

                        {/* §5.3: the data table from `lg`, a card grid below it. */}
                        <Table
                            variant="data"
                            containerClassName="hidden lg:block"
                            className="min-w-[640px]"
                        >
                            <TableHeader className="[&_tr]:border-0">
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Slug</TableHead>
                                    <TableHead>Permissions</TableHead>
                                    <TableHead className="w-10"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {ORG_ROLES.map((r) => (
                                    <TableRow key={r.slug}>
                                        <TableCell>
                                            <div className="font-medium">{r.name}</div>
                                            <div className="text-sm text-muted-foreground">{r.desc}</div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="secondary" className="w-fit rounded-full border-0 px-2.5 font-mono text-xs font-medium">
                                                {r.slug}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            {r.perms.length ? r.perms.map((p) => (
                                                <Badge key={p} variant="secondary" className="mb-1 mr-2 w-fit rounded-full border-0 px-2.5 text-xs font-medium">{formatPermission(p)}</Badge>
                                            )) : <span className="text-muted-foreground">—</span>}
                                        </TableCell>
                                        <TableCell className="text-right"><RoleRowMenu /></TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>

                        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
                            {ORG_ROLES.map((r) => (
                                <div
                                    key={r.slug}
                                    className="min-w-0 rounded-2xl border-0 bg-muted/45 p-4"
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="truncate font-semibold">{r.name}</p>
                                            <p className="text-xs text-muted-foreground">{r.desc}</p>
                                        </div>
                                        <div className="shrink-0">
                                            <RoleRowMenu />
                                        </div>
                                    </div>

                                    {/* Values render as plain text, not filled pills: the
                                        card already sits on `bg-muted/45`, so a tinted
                                        badge on a tinted surface reads as a box inside a
                                        box. The table keeps its badges, where there is no
                                        card fill behind them. */}
                                    <div className="mt-3 space-y-2">
                                        <div className="min-w-0">
                                            <p className="text-xs text-muted-foreground">Slug</p>
                                            <p className="mt-0.5 truncate font-mono text-sm font-medium">{r.slug}</p>
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-xs text-muted-foreground">Permissions</p>
                                            {r.perms.length ? (
                                                <ul className="mt-0.5 space-y-0.5">
                                                    {r.perms.map((p) => (
                                                        <li key={p} className="truncate font-mono text-sm font-medium">{formatPermission(p)}</li>
                                                    ))}
                                                </ul>
                                            ) : (
                                                <p className="mt-0.5 text-sm text-muted-foreground">—</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <Panel>
                            <PanelSection
                                label="Role assignment in Admin Portal"
                                caption="Map identity provider groups to POS roles per environment."
                            >
                                {/* Centred on a phone, left-aligned from `sm` up. */}
                                <div className="flex justify-center sm:justify-start">
                                    <Button variant="outline" size="sm" className="w-full sm:w-auto">
                                        Customize for this organization
                                    </Button>
                                </div>
                            </PanelSection>
                        </Panel>
                    </div>
                </TabsContent>

                        {/* Users */}
                        <TabsContent value="members" className="mt-6">
                            <div className="space-y-6">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="min-w-0">
                                        <h2 className="text-[1.0625rem] font-semibold text-[#0C4FD1] dark:text-[#6CA0FF]">Members</h2>
                                        <p className="mt-1 text-sm text-muted-foreground">People with access to this organization</p>
                                    </div>
                                    {members.length > 1 && (
                                        <div className="min-w-0 max-w-full">
                                            <SendOrganizationMembersInviteButton organizationId={organizationId as string} refetch={refetchOrganizationInfo} role_types='carrier' />
                                        </div>
                                    )}
                                </div>
                                <div className="min-w-0">
                                    {members.length > 0 && (
                                        <>
                                        {/* §5.3: the data table from `lg`, cards below. */}
                                        <Table
                                            variant="data"
                                            containerClassName="hidden lg:block"
                                            className="min-w-[640px]"
                                        >
                                            <TableHeader className="[&_tr]:border-0">
                                                <TableRow>
                                                    <TableHead>User</TableHead>
                                                    <TableHead>Role</TableHead>
                                                    <TableHead>Joined</TableHead>
                                                    <TableHead className="w-10"></TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {(members || []).map((m: any) => (
                                                    <TableRow key={m.id}>
                                                        <TableCell>
                                                            <div className="flex min-w-0 items-center gap-3">
                                                                <Avatar className="h-8 w-8 shrink-0">
                                                                    <AvatarImage src={m?.users?.avatar_url || ''} alt={m?.users?.first_name || 'User'} />
                                                                    <AvatarFallback>{(m?.users?.first_name || 'U')[0]}{(m?.users?.last_name || 'N')[0]}</AvatarFallback>
                                                                </Avatar>
                                                                <div className="min-w-0">
                                                                    <div className="font-medium">{m?.users?.first_name} {m?.users?.last_name}</div>
                                                                    <div className="text-sm text-muted-foreground">{m?.users?.email}</div>
                                                                </div>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Badge variant="secondary" className="w-fit rounded-full border-0 px-2.5 text-xs font-medium capitalize">
                                                                {m?.users?.public_metadata?.role || 'member'}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell className="text-sm text-muted-foreground">{m?.created_at ? new Date(m.created_at).toLocaleDateString() : '-'}</TableCell>
                                                        <TableCell className="text-right">
                                                            <MemberRowMenu member={m} onRemove={() => {
                                                                setRemoveUserPopup(m?.users)
                                                                setOpenRemoveUserPopup(true)
                                                            }} />
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>

                                        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
                                            {(members || []).map((m: any) => (
                                                <div key={m.id} className="min-w-0 rounded-2xl border-0 bg-muted/45 p-4">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="flex min-w-0 items-center gap-3">
                                                            <Avatar className="h-8 w-8 shrink-0">
                                                                <AvatarImage src={m?.users?.avatar_url || ''} alt={m?.users?.first_name || 'User'} />
                                                                <AvatarFallback>{(m?.users?.first_name || 'U')[0]}{(m?.users?.last_name || 'N')[0]}</AvatarFallback>
                                                            </Avatar>
                                                            <div className="min-w-0">
                                                                <p className="truncate font-semibold">{m?.users?.first_name} {m?.users?.last_name}</p>
                                                                <p className="truncate text-xs text-muted-foreground">{m?.users?.email}</p>
                                                            </div>
                                                        </div>
                                                        <div className="shrink-0">
                                                            <MemberRowMenu member={m} onRemove={() => {
                                                                setRemoveUserPopup(m?.users)
                                                                setOpenRemoveUserPopup(true)
                                                            }} />
                                                        </div>
                                                    </div>

                                                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                                        <div className="min-w-0">
                                                            <p className="text-xs text-muted-foreground">Role</p>
                                                            <Badge variant="secondary" className="mt-1 w-fit rounded-full border-0 px-2.5 text-xs font-medium capitalize">
                                                                {m?.users?.public_metadata?.role || 'member'}
                                                            </Badge>
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="text-xs text-muted-foreground">Joined</p>
                                                            <p className="font-medium tabular-nums">{m?.created_at ? new Date(m.created_at).toLocaleDateString() : '-'}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        </>
                                    )}
                                    {
                                        members.length === 0 &&
                                        <div className="flex flex-col items-center justify-center space-y-4 rounded-2xl bg-muted/30 px-4 py-12">
                                            <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center">
                                                <Users className="h-8 w-8 text-muted-foreground" />
                                            </div>
                                            <div className="space-y-2 text-center">
                                                <h3 className="text-lg font-semibold">No users in this organization</h3>
                                                <p className="text-sm text-muted-foreground max-w-md">
                                                    This organization has no users. Invite an admin to get started.
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                {/* <Button size="sm">
                                                    <UserPlus2 className="h-4 w-4 mr-2" />
                                                    Create Admin Account
                                                </Button> */}
                                                {/* <Button variant="outline" size="sm">
                                                    <UserPlus2 className="h-4 w-4 mr-2" />
                                                    Send Invitation
                                                </Button> */}
                                                <SendAdminInviteButton organizationId={organizationId as string} refetch={refetchOrganizationInfo} role_types='carrier' />
                                            </div>
                                        </div>
                                    }
                                </div>
                            </div>
                        </TabsContent>

                        {/* Merchants */}
                        <TabsContent value="merchants" className="mt-6">
                            <div className="space-y-6">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="min-w-0">
                                        <h2 className="text-[1.0625rem] font-semibold text-[#0C4FD1] dark:text-[#6CA0FF]">Merchants</h2>
                                        <p className="mt-1 text-sm text-muted-foreground">Manage and view all merchants associated with this carrier.</p>
                                    </div>
                                    <div className="min-w-0 max-w-full">
                                        <AddMerchantButton carrierId={carrierId as string} organizationId={organizationId as string} refetch={refetchOrganizationInfo} />
                                    </div>
                                </div>
                                <div className="min-w-0">
                                    <MerchantsTable merchants={org?.carriers?.merchants as MerchantsModel[]} />
                                </div>
                            </div>
                        </TabsContent>

                        {/* Invites */}
                        <TabsContent value="invites" className="mt-6">
                            <div className="space-y-6">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                        <div className="min-w-0">
                                            <h2 className="text-[1.0625rem] font-semibold text-[#0C4FD1] dark:text-[#6CA0FF]">Invites</h2>
                                            <p className="mt-1 text-sm text-muted-foreground">Pending invitations</p>
                                        </div>
                                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                                            <Input
                                                placeholder="Search..."
                                                className="h-9 min-w-[160px] flex-1 border-0 bg-muted/60 text-[0.8125rem] shadow-none focus-visible:bg-background sm:w-60 sm:flex-none"
                                                value={inviteSearch}
                                                onChange={(e) => setInviteSearch(e.target.value)}
                                            />
                                            {org.members.length > 1 ?
                                                <SendOrganizationMembersInviteButton organizationId={organizationId as string} refetch={refetchOrganizationInfo} role_types='carrier' /> :
                                                <SendAdminInviteButton organizationId={organizationId as string} refetch={refetchOrganizationInfo} role_types='carrier' />
                                            }
                                        </div>
                                </div>
                                <div className="min-w-0">
                                    {(!filteredAdminInvites.length && !filteredMemberInvites.length) && (
                                        <div className="flex flex-col items-center justify-center space-y-2 rounded-2xl bg-muted/30 px-4 py-8 text-center">
                                            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                                                <Users className="h-6 w-6 text-muted-foreground" />
                                            </div>
                                            <div className="text-sm text-muted-foreground">
                                                {inviteQuery ? 'No invites match your search.' : 'No pending invites.'}
                                            </div>
                                        </div>
                                    )}

                                    {filteredAdminInvites.length > 0 && (
                                        <div className="mb-6">
                                            <div className="mb-3 text-sm text-muted-foreground">Admin invite</div>
                                            <div className="space-y-2">
                                                {/* No `flex-wrap` on the invite row: wrapping pushed the
                                                    role + menu group onto a second line, so the 3-dot
                                                    button sat under the name on a phone. The menu now
                                                    stays pinned to the name's row and the role label
                                                    drops beneath the email instead. */}
                                                {filteredAdminInvites.map((inv: PendingOrgAdminInvitesModel) => (
                                                    <div key={inv.id} className="flex min-w-0 items-start justify-between gap-3 rounded-2xl bg-muted/45 p-4">
                                                        <div className="flex min-w-0 items-center gap-3">
                                                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
                                                                {(inv.email?.[0] || 'A').toUpperCase()}
                                                            </div>
                                                            <div className="min-w-0">
                                                                {/* Status is stated in words, not colour (D-03). The
                                                                    previous class string also opened with a stray `*`,
                                                                    which emitted a bogus `*` class. */}
                                                                <div className="font-medium">{
                                                                        inv.status === 'pending' ? 'Pending Invitation' :
                                                                            inv.status === 'revoked' ? 'Invitation Revoked' :
                                                                                inv.status === 'accepted' ? 'Invitation Accepted' :
                                                                                    inv.status === 'expired' ? 'Invitation Expired' :
                                                                                        inv.status === 'cancelled' ? 'Invitation Cancelled' :
                                                                                            inv.status === 'failed' ? 'Invitation Failed' :
                                                                                                inv.status === 'pending' ? 'Pending Invitation' : 'Invitation Revoked'
                                                                    }</div>
                                                                <div className="truncate text-sm text-muted-foreground">{inv.email}</div>
                                                                <div className="mt-1 text-sm text-muted-foreground sm:hidden">{inv.role}</div>
                                                            </div>
                                                        </div>
                                                        <div className="flex shrink-0 items-center gap-4">
                                                            <div className="hidden text-muted-foreground sm:block">{inv.role}</div>
                                                            <DropdownMenu>
                                                                <DropdownMenuTrigger asChild>
                                                                    <Button variant="ghost" aria-label="Invite actions" className="h-8 w-8 rounded-full p-0"><MoreHorizontal className="h-4 w-4" /></Button>
                                                                </DropdownMenuTrigger>
                                                                <DropdownMenuContent align="end">
                                                                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                                    <DropdownMenuItem>Copy invite link</DropdownMenuItem>
                                                                    <DropdownMenuItem onClick={() => {
                                                                        setResendAdminInvitePopup(inv)
                                                                        setOpenResendAdminInvitePopup(true)
                                                                    }}>Resend</DropdownMenuItem>
                                                                    <DropdownMenuSeparator />
                                                                    <DropdownMenuItem variant="destructive" onClick={() => {
                                                                        setRevokeAdminInvitePopup(inv)
                                                                        setOpenRevokeAdminInvitePopup(true)
                                                                    }}>
                                                                        Revoke
                                                                    </DropdownMenuItem>
                                                                </DropdownMenuContent>
                                                            </DropdownMenu>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {filteredMemberInvites.length > 0 && (
                                        <div>
                                            <div className="mb-3 text-sm text-muted-foreground">Member invites</div>
                                            <div className="space-y-2">
                                                {filteredMemberInvites.map((inv: any) => (
                                                    <div key={inv.id} className="flex min-w-0 items-start justify-between gap-3 rounded-2xl bg-muted/45 p-4">
                                                        <div className="flex min-w-0 items-center gap-3">
                                                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
                                                                {(inv.email?.[0] || 'M').toUpperCase()}
                                                            </div>
                                                            <div className="min-w-0">
                                                                <div className="font-medium">Pending Invitation</div>
                                                                <div className="truncate text-sm text-muted-foreground">{inv.email}</div>
                                                                <div className="mt-1 text-sm text-muted-foreground sm:hidden">Member</div>
                                                            </div>
                                                        </div>
                                                        <div className="flex shrink-0 items-center gap-4">
                                                            <div className="hidden text-muted-foreground sm:block">Member</div>
                                                            <DropdownMenu>
                                                                <DropdownMenuTrigger asChild>
                                                                    <Button variant="ghost" aria-label="Invite actions" className="h-8 w-8 rounded-full p-0"><MoreHorizontal className="h-4 w-4" /></Button>
                                                                </DropdownMenuTrigger>
                                                                <DropdownMenuContent align="end">
                                                                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                                    <DropdownMenuItem>Copy invite link</DropdownMenuItem>
                                                                    <DropdownMenuItem >Resend</DropdownMenuItem>
                                                                    <DropdownMenuSeparator />
                                                                    <DropdownMenuItem variant="destructive">Revoke</DropdownMenuItem>
                                                                </DropdownMenuContent>
                                                            </DropdownMenu>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </TabsContent>

                        {/* Audit logs */}
                        <TabsContent value="audit" className="mt-6">
                            <Panel>
                                <PanelSection
                                    label="Audit logs"
                                    caption="Security activity for this organization"
                                >
                                    <p className="text-sm text-muted-foreground">No events to display.</p>
                                </PanelSection>
                            </Panel>
                        </TabsContent>

                        {/* Settings */}
                        <TabsContent value="settings" className="mt-6">
                            <div className="space-y-6">
                                {/* General Settings */}
                                <Panel>
                                    <PanelSection
                                        label="General Settings"
                                        caption="Organization configuration and preferences"
                                    >
                                        <div className="rounded-2xl bg-muted/30 px-4 py-12 text-center">
                                            <Settings className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                                            <p className="text-sm text-muted-foreground">
                                                Organization configuration and settings panel coming soon.
                                            </p>
                                        </div>
                                    </PanelSection>
                                </Panel>

                                {/* Danger Zone — the section heading keeps the standard
                                    brand-blue treatment rather than being recoloured:
                                    `PanelSection` owns that colour, and overriding it
                                    took a brittle descendant selector that silently
                                    stopped matching. The destructive signal lives on
                                    the action row below, which is where the
                                    irreversible thing actually happens (§6 ex. 2). */}
                                <Panel>
                                    <PanelSection
                                        icon={AlertTriangle}
                                        label="Danger Zone"
                                        caption="Irreversible and destructive actions. Please proceed with caution."
                                    >
                                        <div className="space-y-4">
                                            <div className="flex min-w-0 flex-col gap-3 rounded-2xl border-0 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                                                <div className="min-w-0 space-y-1">
                                                    <h4 className="font-medium text-destructive">Delete Organization</h4>
                                                    <p className="text-sm text-muted-foreground">
                                                        Permanently delete this organization and all associated data.
                                                        This action cannot be undone.
                                                    </p>
                                                </div>
                                                <Button
                                                    variant="destructive"
                                                    onClick={() => setOpenDeleteOrganizationDialog(true)}
                                                    className="shrink-0 w-full sm:w-auto"
                                                >
                                                    <Trash2 className="h-4 w-4 mr-2" />
                                                    Delete Organization
                                                </Button>
                                            </div>
                                        </div>
                                    </PanelSection>
                                </Panel>
                            </div>
                        </TabsContent>
            </Tabs>

            <RemoveUserPopup user={removeUserPopup!} open={openRemoveUserPopup} setOpen={setOpenRemoveUserPopup} refetch={refetchOrganizationInfo} />
            <RevokeAdminInvitePopup invitation={revokeAdminInvitePopup!} open={openRevokeAdminInvitePopup} setOpen={setOpenRevokeAdminInvitePopup} refetch={refetchOrganizationInfo} />
            <ResendAdminInvitePopup invitation={resendAdminInvitePopup!} open={openResendAdminInvitePopup} setOpen={setOpenResendAdminInvitePopup} refetch={refetchOrganizationInfo} />
            <DeleteOrganizationDialog
                organizationId={organizationId as string}
                organizationName={orgName}
                open={openDeleteOrganizationDialog}
                setOpen={setOpenDeleteOrganizationDialog}
                onSuccess={() => refetchOrganizationInfo()}
            />
        </PageShell>
    )
}

function RoleRowMenu() {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" aria-label="Role actions" className="h-8 w-8 rounded-full p-0">
                    <MoreHorizontal className="h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuLabel>Role actions</DropdownMenuLabel>
                <DropdownMenuItem>Edit</DropdownMenuItem>
                <DropdownMenuItem>Duplicate</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive">Delete</DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

/**
 * Member row actions. Extracted so the table row and the mobile card render
 * the same menu rather than two copies that can drift apart.
 */
function MemberRowMenu({ member, onRemove }: { member: any; onRemove: () => void }) {
    const name = `${member?.users?.first_name || ''} ${member?.users?.last_name || ''}`.trim() || 'member'
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" aria-label={`Actions for ${name}`} className="h-8 w-8 rounded-full p-0">
                    <MoreHorizontal className="h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuItem>View profile</DropdownMenuItem>
                <DropdownMenuItem>Change role</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={onRemove}>
                    Remove
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}