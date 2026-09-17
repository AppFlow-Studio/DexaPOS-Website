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
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react'
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
    const [activeTab, setActiveTab] = useState('overview')
    const [inviteSearch, setInviteSearch] = useState('')
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
                bordered `TabsList` inside a card. */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <div className="-mx-1 overflow-x-auto px-1">
                    <TabsList className="inline-flex h-auto w-max flex-nowrap gap-0.5 rounded-full bg-muted/70 p-1">
                        {[
                            ['overview', 'Overview'],
                            ['members', 'Members'],
                            ['merchants', 'Merchants'],
                            ['roles', 'Roles'],
                            ['invites', 'Invites'],
                            ['audit', 'Audit Logs'],
                            ['settings', 'Settings'],
                        ].map(([value, label]) => (
                            <TabsTrigger
                                key={value}
                                value={value}
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

                        <Table variant="data" className="min-w-[640px]">
                            <TableHeader className="[&_tr]:border-0">
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Slug</TableHead>
                                    <TableHead>Permissions</TableHead>
                                    <TableHead className="w-10"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {[
                                    { name: 'Member', slug: 'member', desc: 'Default user role', perms: [] },
                                    { name: 'Admin', slug: 'admin', desc: 'Manage all organization resources', perms: ['pos:stores:manage'] },
                                    { name: 'Store Manager', slug: 'store-manager', desc: 'Manage assigned store, products, staff', perms: ['pos:store:manage'] },
                                    { name: 'Cashier', slug: 'cashier', desc: 'Process sales and refunds', perms: ['pos:sales:create'] },
                                ].map((r) => (
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
                                                <Badge key={p} variant="secondary" className="mb-1 mr-2 w-fit rounded-full border-0 px-2.5 text-xs font-medium">{p}</Badge>
                                            )) : <span className="text-muted-foreground">—</span>}
                                        </TableCell>
                                        <TableCell className="text-right"><RoleRowMenu /></TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>

                        <Panel>
                            <PanelSection
                                label="Role assignment in Admin Portal"
                                caption="Map identity provider groups to POS roles per environment."
                            >
                                <Button variant="outline" size="sm">Customize for this organization</Button>
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
                                    {
                                        members.length > 0 &&
                                        <Table variant="data" className="min-w-[640px]">
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
                                                            <div className="flex items-center gap-3">
                                                                <Avatar className="h-8 w-8">
                                                                    <AvatarImage src={m?.users?.avatar_url || ''} alt={m?.users?.first_name || 'User'} />
                                                                    <AvatarFallback>{(m?.users?.first_name || 'U')[0]}{(m?.users?.last_name || 'N')[0]}</AvatarFallback>
                                                                </Avatar>
                                                                <div>
                                                                    <div className="font-medium">{m?.users?.first_name} {m?.users?.last_name}</div>
                                                                    <div className="text-sm text-muted-foreground">{m?.users?.email}</div>
                                                                </div>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Badge variant="outline">{m?.users?.public_metadata?.role || 'member'}</Badge>
                                                        </TableCell>
                                                        <TableCell className="text-sm text-muted-foreground">{m?.created_at ? new Date(m.created_at).toLocaleDateString() : '-'}</TableCell>
                                                        <TableCell className="text-right">
                                                            <DropdownMenu>
                                                                <DropdownMenuTrigger asChild>
                                                                    <Button variant="ghost" aria-label="Invite actions" className="h-8 w-8 rounded-full p-0"><MoreHorizontal className="h-4 w-4" /></Button>
                                                                </DropdownMenuTrigger>
                                                                <DropdownMenuContent align="end">
                                                                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                                    <DropdownMenuItem>View profile</DropdownMenuItem>
                                                                    <DropdownMenuItem>Change role</DropdownMenuItem>
                                                                    <DropdownMenuSeparator />
                                                                    <DropdownMenuItem className="text-red-600" onClick={() => {
                                                                        setRemoveUserPopup(m?.users)
                                                                        setOpenRemoveUserPopup(true)
                                                                    }}>Remove</DropdownMenuItem>
                                                                </DropdownMenuContent>
                                                            </DropdownMenu>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    }
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
                                                {filteredAdminInvites.map((inv: PendingOrgAdminInvitesModel) => (
                                                    <div key={inv.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-2xl bg-muted/45 p-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
                                                                {(inv.email?.[0] || 'A').toUpperCase()}
                                                            </div>
                                                            <div>
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
                                                                <div className="text-sm text-muted-foreground">{inv.email}</div>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-4">
                                                            <div className="text-muted-foreground">{inv.role}</div>
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
                                                    <div key={inv.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-2xl bg-muted/45 p-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
                                                                {(inv.email?.[0] || 'M').toUpperCase()}
                                                            </div>
                                                            <div>
                                                                <div className="font-medium">Pending Invitation</div>
                                                                <div className="text-sm text-muted-foreground">{inv.email}</div>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-4">
                                                            <div className="text-muted-foreground">Member</div>
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
                <Button variant="ghost" className="h-8 w-8 p-0">
                    <MoreHorizontal className="h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuLabel>Role actions</DropdownMenuLabel>
                <DropdownMenuItem>Edit</DropdownMenuItem>
                <DropdownMenuItem>Duplicate</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-red-600">Delete</DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}