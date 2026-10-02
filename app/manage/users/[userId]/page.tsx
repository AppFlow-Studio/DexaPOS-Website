'use client'

import { Suspense, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { AlertCircle, Edit, MoreHorizontal, Plus, UserMinus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
    ConfirmDialog,
    PageHeader,
    PageShell,
    Panel,
    PanelSection,
    useRailAutoScroll,
} from '@/components/dashboard/shell'
import { PaginationBar } from '@/components/dashboard/PaginationBar'
import { useClientPagination } from '@/lib/hooks/useClientPagination'
import { useAdminAuth } from '@/lib/hooks/useAdminAuth'
import { HQ_ROLES, type HQRoleCode } from '@/types/admin'
import type { PaginationMeta } from '@/types/pagination'
import { RemoveUser } from '../../actions/remove-user'
import { removeUserFromOrganization } from '../../actions/admin-user-management'
import {
    getAdminUserEvents,
    getAdminUserSessions,
    revokeAdminUserSession,
    type AdminUserSession,
} from '../../actions/admin-user-activity'
import type { PlatformAuditLogRow } from '../../actions/hq-platform/analytics'
import { useGetInfoOfUser } from '../../hooks/useGetInfoOfUser'
import { useAdminMerchantAccess, useGrantMerchantAccess, useRevokeMerchantAccess } from '../../hooks/useAdminMerchantAccess'
import { EditRoleDialog, HQ_ROLES_BY_LEVEL } from '../components/EditRoleDialog'
import { RecordListSkeleton, UserProfileSkeleton } from '../components/skeletons'
import { EditUserDetailsDialog } from './components/edit-user-details-dialog'
import { GrantMerchantAccessDialog } from './components/grant-merchant-access-dialog'

const DEXA_HQ_ORG_ID = process.env.NEXT_PUBLIC_DEXA_POS_INTERNAL_TEAM_ID ?? ''
const PAGE_SIZE = 10

const PROFILE_TABS = [
    { value: 'details', label: 'Details' },
    { value: 'merchant-access', label: 'Merchant access' },
    { value: 'sessions', label: 'Sessions' },
    { value: 'events', label: 'Events' },
] as const
type ProfileTab = (typeof PROFILE_TABS)[number]['value']

const TAB_TRIGGER =
    'shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border'

function roleName(code?: string | null) {
    if (!code) return 'Member'
    return HQ_ROLES[code as HQRoleCode]?.name ?? code
}

function isHqRole(code?: string | null) {
    return !!code && (code.startsWith('hq.') || code in HQ_ROLES)
}

/** A day: `Sep 28, 2026`. Unknown renders `—` (§4.9). */
function formatDay(value?: string | null) {
    if (!value) return '—'
    return new Date(value).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

/** The full timestamp, for a `title`. */
function formatTimestamp(value?: string | null) {
    if (!value) return undefined
    return new Date(value).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    })
}

function relative(value?: string | null) {
    if (!value) return '—'
    return formatDistanceToNow(new Date(value), { addSuffix: true })
}

function capitalize(value: string) {
    return value.charAt(0).toUpperCase() + value.slice(1)
}

/** `admin.role_changed` → `Admin role changed`. */
function eventLabel(action: string) {
    return capitalize(action.replace(/[._]+/g, ' ').trim()) || 'Unknown event'
}

function eventResult(row: PlatformAuditLogRow) {
    return row.status === 'failed' || row.status === 'error' ? 'Failed' : 'Success'
}

/** `useSearchParams` needs a Suspense boundary above it. */
export default function UserProfilePage() {
    return (
        <Suspense fallback={<UserProfileSkeleton />}>
            <UserProfile />
        </Suspense>
    )
}

function UserProfile() {
    const { userId: rawUserId } = useParams()
    const targetUserId = rawUserId as string
    const { userId: currentUserId } = useAuth()
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const queryClient = useQueryClient()
    const { isSuperAdmin } = useAdminAuth()
    const { data: user, isLoading, error, refetch } = useGetInfoOfUser(targetUserId)

    // The tab lives in the URL so a reload or a shared link opens the same view.
    const requestedTab = searchParams.get('tab')
    const activeTab: ProfileTab = PROFILE_TABS.some((tab) => tab.value === requestedTab)
        ? (requestedTab as ProfileTab)
        : 'details'
    // Keeps the active tab centred in the rail on narrow screens (§13.2, D-24).
    const tabRailRef = useRailAutoScroll(activeTab)
    const setTab = (tab: string) => {
        const next = new URLSearchParams(searchParams.toString())
        if (tab === 'details') next.delete('tab')
        else next.set('tab', tab)
        const query = next.toString()
        window.history.replaceState(null, '', query ? `${pathname}?${query}` : pathname)
    }

    // The list passes its own state in `back`, so "Back to Users" returns to the
    // same page and filters (§5.9). It is only ever a query on the list's path.
    const back = searchParams.get('back')
    const backHref = back ? `/manage/users?${back}` : '/manage/users'

    const isSelf = !!currentUserId && currentUserId === targetUserId
    // Role changes, removals, deletion, session revocation and merchant grants
    // are super-admin actions server-side; never on your own account.
    const canAdminister = isSuperAdmin && !isSelf

    const [isEditDetailsOpen, setIsEditDetailsOpen] = useState(false)
    const [editingMembership, setEditingMembership] = useState<{
        organizationId: string
        organizationName: string
        role: string | null
    } | null>(null)
    const [removingMembership, setRemovingMembership] = useState<{
        organizationId: string
        organizationName: string
    } | null>(null)
    const [removedOrgIds, setRemovedOrgIds] = useState<ReadonlySet<string>>(new Set())
    const [membershipPending, setMembershipPending] = useState(false)
    const [deleteOpen, setDeleteOpen] = useState(false)
    const [deletePending, setDeletePending] = useState(false)

    if (isLoading) return <UserProfileSkeleton />

    const profile = user instanceof Error ? null : user
    const loadError = error ?? (user instanceof Error ? user : null)

    if (loadError || !profile) {
        return (
            <PageShell as="div">
                <PageHeader title="User profile" backHref={backHref} backLabel="Back to Users" />
                {/* A neutral well that says what failed, not red text (§4.9). */}
                <div className="flex flex-col items-center justify-center gap-4 rounded-2xl bg-muted/30 px-4 py-20 text-center">
                    <AlertCircle className="h-10 w-10 text-muted-foreground" />
                    <div className="space-y-1">
                        <h2 className="text-lg font-semibold">
                            {loadError ? 'We hit a snag loading this user' : 'This user does not exist'}
                        </h2>
                        <p className="text-sm text-muted-foreground">
                            {loadError ? loadError.message : 'They may have been deleted. Go back to the user list.'}
                        </p>
                    </div>
                    {loadError && <Button onClick={() => void refetch()}>Retry</Button>}
                </div>
            </PageShell>
        )
    }

    const fullName = `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim()
    const displayName = fullName || profile.email || 'Unnamed user'
    const status: string = (profile.public_metadata as any)?.status || 'Active'
    const memberships: any[] = (profile.members ?? []).filter(
        (member: any) => !removedOrgIds.has(member.organization_id)
    )
    const hqMembership = memberships.find((member) => isHqRole(member.role))
    const isTargetSuperAdmin = hqMembership?.role === 'hq.super_admin'

    const handleRemoveMembership = async () => {
        if (!removingMembership) return
        setMembershipPending(true)
        try {
            const result = await removeUserFromOrganization({
                userId: targetUserId,
                organizationId: removingMembership.organizationId,
            })
            if (!result.success) {
                toast.error(result.message)
                return
            }
            toast.success(`Removed from ${removingMembership.organizationName}`)
            // Clerk's webhook deletes the members row a moment later; hide it now.
            setRemovedOrgIds((prev) => new Set(prev).add(removingMembership.organizationId))
            setRemovingMembership(null)
            void queryClient.invalidateQueries({ queryKey: ['userInfo', targetUserId] })
        } catch (err) {
            console.error('[UserProfile] Remove membership failed:', err)
            toast.error('Failed to remove membership')
        } finally {
            setMembershipPending(false)
        }
    }

    const handleDeleteUser = async () => {
        setDeletePending(true)
        try {
            const result = await RemoveUser(targetUserId)
            if (!result.success) {
                toast.error(result.message)
                return
            }
            toast.success(`${displayName} was deleted`)
            setDeleteOpen(false)
            router.push(backHref)
        } catch {
            toast.error('An error occurred while deleting the user')
        } finally {
            setDeletePending(false)
        }
    }

    return (
        /* `as="div"`: app/manage/layout.tsx already owns this surface's <main>. */
        <PageShell as="div">
            {/* The email is the record's scope, so it stays on phones (§13.4). */}
            <PageHeader
                title={displayName}
                subtitle={profile.email ?? undefined}
                showSubtitleOnMobile
                backHref={backHref}
                backLabel="Back to Users"
                titleBadge={<Badge variant="outline">{status}</Badge>}
                actions={
                    <Button variant="outline" className="h-9 px-4" onClick={() => setIsEditDetailsOpen(true)}>
                        <Edit className="mr-2 h-4 w-4" />
                        Edit details
                    </Button>
                }
            />

            <Tabs value={activeTab} onValueChange={setTab}>
                {/* Pill rail (§4.5). Four labels overflow a phone, so the rail
                    scrolls sideways (D-15) with its bar hidden, and the active
                    tab is kept centred (§13.2). */}
                <div ref={tabRailRef} className="no-scrollbar w-full min-w-0 overflow-x-auto">
                    <TabsList className="inline-flex h-auto w-max flex-nowrap gap-0.5 rounded-full bg-muted/70 p-1">
                        {PROFILE_TABS.map((tab) => (
                            <TabsTrigger key={tab.value} value={tab.value} data-tab-value={tab.value} className={TAB_TRIGGER}>
                                {tab.label}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </div>

                <TabsContent value="details" className="mt-6 space-y-6">
                    <Panel>
                        <PanelSection label="Profile">
                            <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
                                <ProfileField label="Full name" value={fullName || '—'} />
                                <ProfileField label="Email" value={profile.email || '—'} />
                                <ProfileField label="Status" value={status} />
                                <ProfileField label="HQ role" value={hqMembership ? roleName(hqMembership.role) : '—'} />
                                <ProfileField label="Joined" value={formatDay(profile.created_at)} title={formatTimestamp(profile.created_at)} />
                                <ProfileField label="Last updated" value={formatDay(profile.updated_at)} title={formatTimestamp(profile.updated_at)} />
                                <ProfileField label="User ID" value={targetUserId} mono />
                            </dl>
                        </PanelSection>

                        <PanelSection label="Organization memberships">
                            {memberships.length === 0 ? (
                                <p className="rounded-2xl bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
                                    Not a member of any organization.
                                </p>
                            ) : (
                                <div className="space-y-2">
                                    {memberships.map((member: any) => {
                                        const orgName = member.organizations?.name || 'Unnamed organization'
                                        return (
                                            <div
                                                key={member.id}
                                                className="flex min-w-0 items-center justify-between gap-3 rounded-2xl bg-muted/45 px-4 py-3"
                                            >
                                                <div className="min-w-0">
                                                    <p className="truncate font-medium">{orgName}</p>
                                                    <p className="truncate text-xs text-muted-foreground">
                                                        {roleName(member.role)} · Joined{' '}
                                                        <span className="tabular-nums">{formatDay(member.created_at)}</span>
                                                    </p>
                                                </div>
                                                {canAdminister && (
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button
                                                                variant="ghost"
                                                                aria-label={`Actions for the ${orgName} membership`}
                                                                className="h-8 w-8 shrink-0 rounded-full p-0"
                                                            >
                                                                <MoreHorizontal className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuItem
                                                                onSelect={() =>
                                                                    setEditingMembership({
                                                                        organizationId: member.organization_id,
                                                                        organizationName: orgName,
                                                                        role: member.role || null,
                                                                    })
                                                                }
                                                            >
                                                                <Edit className="mr-2 h-4 w-4" />
                                                                Edit role
                                                            </DropdownMenuItem>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem
                                                                variant="destructive"
                                                                onSelect={() =>
                                                                    setRemovingMembership({
                                                                        organizationId: member.organization_id,
                                                                        organizationName: orgName,
                                                                    })
                                                                }
                                                            >
                                                                <UserMinus className="mr-2 h-4 w-4" />
                                                                Remove from organization
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </PanelSection>
                    </Panel>

                    {canAdminister && (
                        <Panel padded>
                            {/* The Danger Zone is one of the four places colour is
                                allowed (§3.5 use 3), via the destructive token. */}
                            <h2 className="text-[1.0625rem] font-semibold text-destructive">Danger zone</h2>
                            <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <p className="font-medium">Delete user account</p>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        Removes them from every organization and deletes their sign-in. This cannot be undone.
                                    </p>
                                </div>
                                <Button variant="destructive" className="shrink-0" onClick={() => setDeleteOpen(true)}>
                                    Delete user
                                </Button>
                            </div>
                        </Panel>
                    )}
                </TabsContent>

                <TabsContent value="merchant-access" className="mt-6">
                    <MerchantAccessTab
                        userId={targetUserId}
                        userName={displayName}
                        canEdit={canAdminister}
                        isTargetSuperAdmin={isTargetSuperAdmin}
                    />
                </TabsContent>

                <TabsContent value="sessions" className="mt-6">
                    <SessionsTab userId={targetUserId} canRevoke={canAdminister} />
                </TabsContent>

                <TabsContent value="events" className="mt-6">
                    <EventsTab userId={targetUserId} />
                </TabsContent>
            </Tabs>

            <EditUserDetailsDialog
                open={isEditDetailsOpen}
                onOpenChange={setIsEditDetailsOpen}
                userId={targetUserId}
                initialFirstName={profile.first_name || ''}
                initialLastName={profile.last_name || ''}
                email={profile.email || ''}
            />

            <EditRoleDialog
                open={!!editingMembership}
                onOpenChange={(open) => !open && setEditingMembership(null)}
                userId={targetUserId}
                organizationId={editingMembership?.organizationId ?? ''}
                subject={editingMembership?.organizationName ?? ''}
                currentRole={editingMembership?.role}
                roles={HQ_ROLES_BY_LEVEL}
                notice={
                    editingMembership && editingMembership.organizationId !== DEXA_HQ_ORG_ID && !isHqRole(editingMembership.role)
                        ? 'HQ roles apply only to the HQ organization. Change merchant roles from the merchant’s staff settings.'
                        : undefined
                }
                onSaved={() => void queryClient.invalidateQueries({ queryKey: ['userInfo', targetUserId] })}
            />

            <ConfirmDialog
                open={!!removingMembership}
                onOpenChange={(open) => !open && setRemovingMembership(null)}
                title="Remove from organization?"
                description={`${displayName} loses access to ${removingMembership?.organizationName ?? 'this organization'}. Their account stays, and they can be invited back.`}
                confirmLabel="Remove"
                pendingLabel="Removing…"
                destructive
                pending={membershipPending}
                onConfirm={() => void handleRemoveMembership()}
            />

            <ConfirmDialog
                open={deleteOpen}
                onOpenChange={setDeleteOpen}
                title="Delete user account?"
                description={`${displayName} is removed from every organization and can no longer sign in. This cannot be undone.`}
                confirmLabel="Delete user"
                pendingLabel="Deleting…"
                destructive
                pending={deletePending}
                onConfirm={() => void handleDeleteUser()}
            />
        </PageShell>
    )
}

function ProfileField({
    label,
    value,
    title,
    mono = false,
}: {
    label: string
    value: string
    title?: string
    mono?: boolean
}) {
    return (
        <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd
                className={mono ? 'mt-0.5 break-all font-mono text-[0.8125rem]' : 'mt-0.5 truncate text-sm font-medium tabular-nums'}
                title={title}
            >
                {value}
            </dd>
        </div>
    )
}

/** A label/value pair inside a mobile record card. */
function CardField({ label, value, title }: { label: string; value: string; title?: string }) {
    return (
        <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="truncate font-medium tabular-nums" title={title}>
                {value}
            </p>
        </div>
    )
}

/** A sentence in the footprint of the missing list (§4.9). */
function ListEmpty({ title, hint }: { title: string; hint?: string }) {
    return (
        <div className="flex min-h-40 flex-col items-center justify-center gap-1 rounded-2xl bg-muted/30 px-4 text-center">
            <p className="text-sm font-medium">{title}</p>
            {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
    )
}

function ListError({ message, onRetry }: { message: string; onRetry: () => void }) {
    return (
        <div className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-2xl bg-muted/30 px-4 text-center">
            <p className="text-sm font-medium">{message}</p>
            <Button variant="outline" size="sm" onClick={onRetry}>
                Retry
            </Button>
        </div>
    )
}


function MerchantAccessTab({
    userId,
    userName,
    canEdit,
    isTargetSuperAdmin,
}: {
    userId: string
    userName: string
    canEdit: boolean
    isTargetSuperAdmin: boolean
}) {
    const { data: access = [], isLoading, error, refetch } = useAdminMerchantAccess(userId)
    const grantAccess = useGrantMerchantAccess()
    const revokeAccess = useRevokeMerchantAccess()
    const [isGrantOpen, setIsGrantOpen] = useState(false)
    const [revoking, setRevoking] = useState<{ merchantId: string; merchantName: string } | null>(null)
    const accessPage = useClientPagination(access, PAGE_SIZE)
    const grantedIds = useMemo(() => new Set(access.map((row) => row.merchantId)), [access])

    const handleGrant = async (merchantId: string) => {
        try {
            await grantAccess.mutateAsync({ adminUserId: userId, merchantId })
            toast.success('Merchant access granted')
            setIsGrantOpen(false)
        } catch (err) {
            toast.error((err as Error).message || 'Failed to grant access')
        }
    }

    const handleRevoke = async () => {
        if (!revoking) return
        try {
            await revokeAccess.mutateAsync({ adminUserId: userId, merchantId: revoking.merchantId })
            toast.success(`Access to ${revoking.merchantName} revoked`)
            setRevoking(null)
        } catch (err) {
            toast.error((err as Error).message || 'Failed to revoke access')
        }
    }

    const revokeButton = (merchantId: string, merchantName: string) =>
        canEdit && (
            <Button
                variant="ghost"
                size="sm"
                className="h-8 px-3 text-destructive hover:text-destructive"
                aria-label={`Revoke access to ${merchantName}`}
                onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    setRevoking({ merchantId, merchantName })
                }}
            >
                Revoke
            </Button>
        )

    return (
        <Panel>
            <PanelSection
                label="Merchant access"
                caption="Merchants this user can open and manage."
                action={
                    canEdit &&
                    !isTargetSuperAdmin && (
                        <Button className="h-9 px-4" onClick={() => setIsGrantOpen(true)}>
                            <Plus className="mr-2 h-4 w-4" />
                            Grant access
                        </Button>
                    )
                }
            >
                {isTargetSuperAdmin ? (
                    <p className="rounded-2xl bg-muted/60 px-4 py-3 text-sm">
                        <span className="font-medium">Super admins can open every merchant.</span>{' '}
                        <span className="text-muted-foreground">Individual grants are not needed or tracked for this role.</span>
                    </p>
                ) : isLoading ? (
                    <RecordListSkeleton rows={5} columns={4} cardPairs={1} />
                ) : error ? (
                    <ListError message="Merchant access could not be loaded." onRetry={() => void refetch()} />
                ) : access.length === 0 ? (
                    <ListEmpty
                        title="No merchant access yet"
                        hint={canEdit ? 'Grant access to let this user open a merchant.' : undefined}
                    />
                ) : (
                    <>
                        <Table variant="data" bounded={false} containerClassName="hidden md:block">
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Merchant</TableHead>
                                    <TableHead>Granted</TableHead>
                                    <TableHead className="hidden lg:table-cell">Granted by</TableHead>
                                    {canEdit && (
                                        <TableHead className="w-24">
                                            <span className="sr-only">Actions</span>
                                        </TableHead>
                                    )}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {accessPage.pageRows.map((row) => (
                                    <TableRow key={row.id}>
                                        <TableCell className="max-w-[320px]">
                                            <Link
                                                href={`/manage/merchants/${row.merchantId}`}
                                                className="block truncate font-medium hover:underline"
                                            >
                                                {row.merchantName}
                                            </Link>
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground tabular-nums" title={formatTimestamp(row.grantedAt)}>
                                            {formatDay(row.grantedAt)}
                                        </TableCell>
                                        <TableCell className="hidden max-w-[220px] truncate text-sm text-muted-foreground lg:table-cell">
                                            {row.grantedByName || '—'}
                                        </TableCell>
                                        {canEdit && (
                                            <TableCell className="text-right">{revokeButton(row.merchantId, row.merchantName ?? 'this merchant')}</TableCell>
                                        )}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>

                        {/* Phones: the merchant and when access was granted (D-27). */}
                        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 md:hidden">
                            {accessPage.pageRows.map((row) => (
                                <div key={row.id} className="relative min-w-0 rounded-2xl bg-muted/45 p-4">
                                    <Link
                                        href={`/manage/merchants/${row.merchantId}`}
                                        aria-label={`Open ${row.merchantName}`}
                                        className="absolute inset-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    />
                                    <p className="truncate font-semibold">{row.merchantName}</p>
                                    <div className="mt-3 flex items-end justify-between gap-3">
                                        <CardField label="Granted" value={formatDay(row.grantedAt)} />
                                        <div className="relative z-10 shrink-0">{revokeButton(row.merchantId, row.merchantName ?? 'this merchant')}</div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <PaginationBar pagination={accessPage.pagination} onPageChange={accessPage.setPage} itemLabel="merchants" />
                        {accessPage.pagination.totalPages <= 1 && (
                            <p className="mt-4 text-xs text-muted-foreground tabular-nums sm:text-sm">
                                {access.length} {access.length === 1 ? 'merchant' : 'merchants'}
                                {!canEdit && ' · Only a super admin can change this list.'}
                            </p>
                        )}
                    </>
                )}
            </PanelSection>

            <GrantMerchantAccessDialog
                open={isGrantOpen}
                onOpenChange={setIsGrantOpen}
                userName={userName}
                excludeMerchantIds={grantedIds}
                isPending={grantAccess.isPending}
                onGrant={(merchantId) => void handleGrant(merchantId)}
            />

            <ConfirmDialog
                open={!!revoking}
                onOpenChange={(open) => !open && setRevoking(null)}
                title="Revoke merchant access?"
                description={`${userName} can no longer open ${revoking?.merchantName ?? 'this merchant'}. You can grant it again later.`}
                confirmLabel="Revoke"
                pendingLabel="Revoking…"
                destructive
                pending={revokeAccess.isPending}
                onConfirm={() => void handleRevoke()}
            />
        </Panel>
    )
}

function sessionDevice(session: AdminUserSession) {
    const device = session.device || (session.isMobile ? 'Mobile' : null)
    return [session.browser, device].filter(Boolean).join(' · ') || 'Unknown device'
}

/** Radix mounts a tab's content only while it is open, so this fetches on first open, not on every profile visit. */
function SessionsTab({ userId, canRevoke }: { userId: string; canRevoke: boolean }) {
    const { data, isLoading, refetch } = useQuery({
        queryKey: ['admin-user-sessions', userId],
        queryFn: () => getAdminUserSessions(userId),
    })
    const sessions = data?.data ?? []
    const sessionPage = useClientPagination(sessions, PAGE_SIZE)
    const [revoking, setRevoking] = useState<AdminUserSession | null>(null)
    const [revokePending, setRevokePending] = useState(false)

    const handleRevoke = async () => {
        if (!revoking) return
        setRevokePending(true)
        try {
            const result = await revokeAdminUserSession({ userId, sessionId: revoking.id })
            if (!result.success) {
                toast.error(result.message)
                return
            }
            toast.success(result.message)
            setRevoking(null)
            void refetch()
        } catch {
            toast.error('Failed to revoke session')
        } finally {
            setRevokePending(false)
        }
    }

    const revokeButton = (session: AdminUserSession) =>
        canRevoke &&
        session.status === 'active' &&
        !session.isViewerSession && (
            <Button
                variant="ghost"
                size="sm"
                className="h-8 px-3 text-destructive hover:text-destructive"
                aria-label={`Revoke the ${sessionDevice(session)} session`}
                onClick={() => setRevoking(session)}
            >
                Revoke
            </Button>
        )

    const activeCount = sessions.filter((session) => session.status === 'active').length

    return (
        <Panel>
            <PanelSection
                label="Sessions"
                caption="Where this user is signed in, from Clerk. Revoking a session signs them out on that device."
            >
                {isLoading ? (
                    <RecordListSkeleton rows={5} columns={7} cardPairs={1} />
                ) : data?.error ? (
                    <ListError message={`Sessions could not be loaded: ${data.error}`} onRetry={() => void refetch()} />
                ) : sessions.length === 0 ? (
                    <ListEmpty title="No sessions yet" hint="Sessions appear here once this user signs in." />
                ) : (
                    <>
                        <Table variant="data" bounded={false} containerClassName="hidden md:block">
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Device</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Last active</TableHead>
                                    <TableHead className="hidden lg:table-cell">Location</TableHead>
                                    <TableHead className="hidden xl:table-cell">IP address</TableHead>
                                    <TableHead className="hidden xl:table-cell">Started</TableHead>
                                    {canRevoke && (
                                        <TableHead className="w-24">
                                            <span className="sr-only">Actions</span>
                                        </TableHead>
                                    )}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {sessionPage.pageRows.map((session) => (
                                    <TableRow key={session.id}>
                                        <TableCell className="max-w-[260px] truncate font-medium">
                                            {sessionDevice(session)}
                                            {session.isViewerSession && (
                                                <span className="ml-2 text-xs font-normal text-muted-foreground">This device</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline">{capitalize(session.status)}</Badge>
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground tabular-nums" title={formatTimestamp(session.lastActiveAt)}>
                                            {relative(session.lastActiveAt)}
                                        </TableCell>
                                        <TableCell className="hidden max-w-[200px] truncate text-sm text-muted-foreground lg:table-cell">
                                            {session.location || '—'}
                                        </TableCell>
                                        <TableCell className="hidden font-mono text-[0.8125rem] text-muted-foreground xl:table-cell">
                                            {session.ipAddress || '—'}
                                        </TableCell>
                                        <TableCell className="hidden text-sm text-muted-foreground tabular-nums xl:table-cell" title={formatTimestamp(session.createdAt)}>
                                            {formatDay(session.createdAt)}
                                        </TableCell>
                                        {canRevoke && <TableCell className="text-right">{revokeButton(session)}</TableCell>}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>

                        {/* Phones: the essential columns only, device, status and last active (D-27). */}
                        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 md:hidden">
                            {sessionPage.pageRows.map((session) => (
                                <div key={session.id} className="min-w-0 rounded-2xl bg-muted/45 p-4">
                                    <div className="flex min-w-0 items-baseline gap-2">
                                        <p className="truncate font-semibold">{sessionDevice(session)}</p>
                                        <span className="shrink-0 text-xs text-muted-foreground">{capitalize(session.status)}</span>
                                    </div>
                                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                        <CardField label="Last active" value={relative(session.lastActiveAt)} title={formatTimestamp(session.lastActiveAt)} />
                                    </div>
                                    {revokeButton(session) && <div className="mt-3 flex justify-end">{revokeButton(session)}</div>}
                                </div>
                            ))}
                        </div>

                        <PaginationBar pagination={sessionPage.pagination} onPageChange={sessionPage.setPage} itemLabel="sessions" />
                        {sessionPage.pagination.totalPages <= 1 && (
                            <p className="mt-4 text-xs text-muted-foreground tabular-nums sm:text-sm">
                                {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'} · {activeCount} active
                            </p>
                        )}
                    </>
                )}
            </PanelSection>

            <ConfirmDialog
                open={!!revoking}
                onOpenChange={(open) => !open && setRevoking(null)}
                title="Revoke this session?"
                description={`They are signed out on ${revoking ? sessionDevice(revoking) : 'that device'} and must sign in again there.`}
                confirmLabel="Revoke"
                pendingLabel="Revoking…"
                destructive
                pending={revokePending}
                onConfirm={() => void handleRevoke()}
            />
        </Panel>
    )
}

function EventsTab({ userId }: { userId: string }) {
    const [page, setPage] = useState(1)

    const { data, isLoading, isFetching, refetch } = useQuery({
        queryKey: ['admin-user-events', userId, page],
        queryFn: () => getAdminUserEvents(userId, page, PAGE_SIZE),
        placeholderData: keepPreviousData,
    })
    const rows = data?.data ?? []
    const total = data?.total ?? 0
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
    const pagination: PaginationMeta = {
        page,
        pageSize: PAGE_SIZE,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
    }

    const actorLabel = (row: PlatformAuditLogRow) =>
        row.actor_user_id === userId ? 'This user' : row.actor_name || row.actor_email || 'System'

    return (
        <Panel>
            <PanelSection
                label="Events"
                caption="Actions this user took, and actions taken on their account, from the audit log."
                action={
                    <Button asChild variant="outline" className="h-9 px-4">
                        <Link href="/manage/audit-logs">Open audit logs</Link>
                    </Button>
                }
            >
                {isLoading ? (
                    <RecordListSkeleton rows={10} columns={5} cardPairs={1} />
                ) : data?.error === 'forbidden' ? (
                    <ListEmpty
                        title="You need audit-log access to see events"
                        hint="Ask a super admin for the system.audit.view permission."
                    />
                ) : data?.error ? (
                    <ListError message={`Events could not be loaded: ${data.error}`} onRetry={() => void refetch()} />
                ) : rows.length === 0 ? (
                    <ListEmpty
                        title="No events yet"
                        hint="Changes this user makes, and changes made to their account, appear here."
                    />
                ) : (
                    <>
                        <Table variant="data" bounded={false} containerClassName="hidden md:block">
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Event</TableHead>
                                    <TableHead className="hidden xl:table-cell">On</TableHead>
                                    <TableHead className="hidden lg:table-cell">By</TableHead>
                                    <TableHead>Result</TableHead>
                                    <TableHead>When</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rows.map((row) => (
                                    <TableRow key={row.id}>
                                        <TableCell className="max-w-[280px] truncate font-medium" title={row.action}>
                                            {eventLabel(row.action)}
                                        </TableCell>
                                        <TableCell className="hidden max-w-[220px] truncate text-sm text-muted-foreground xl:table-cell">
                                            {row.resource_name || row.merchant_name || '—'}
                                        </TableCell>
                                        <TableCell className="hidden max-w-[200px] truncate text-sm text-muted-foreground lg:table-cell">
                                            {actorLabel(row)}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline">{eventResult(row)}</Badge>
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground tabular-nums" title={formatTimestamp(row.created_at)}>
                                            {relative(row.created_at)}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>

                        {/* Phones: the essential columns only, event, result and when (D-27). */}
                        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 md:hidden">
                            {rows.map((row) => (
                                <div key={row.id} className="min-w-0 rounded-2xl bg-muted/45 p-4">
                                    <div className="flex min-w-0 items-baseline gap-2">
                                        <p className="truncate font-semibold">{eventLabel(row.action)}</p>
                                        <span className="shrink-0 text-xs text-muted-foreground">{eventResult(row)}</span>
                                    </div>
                                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                        <CardField label="When" value={relative(row.created_at)} title={formatTimestamp(row.created_at)} />
                                    </div>
                                </div>
                            ))}
                        </div>

                        <PaginationBar
                            pagination={pagination}
                            onPageChange={setPage}
                            isLoading={isFetching}
                            itemLabel="events"
                        />
                        {totalPages <= 1 && (
                            <p className="mt-4 text-xs text-muted-foreground tabular-nums sm:text-sm">
                                {total} {total === 1 ? 'event' : 'events'}
                            </p>
                        )}
                    </>
                )}
            </PanelSection>
        </Panel>
    )
}
