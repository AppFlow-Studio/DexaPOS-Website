'use client'

import { Suspense, useMemo, useState, type SyntheticEvent } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
    Search,
    MoreHorizontal,
    UserPlus,
    Mail,
    Edit,
    Eye,
    UserCheck,
    UserX,
    Users,
    KeyRound,
    Copy,
    AlertCircle,
    Link2,
    RotateCw,
    Ban,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useOrganizationUsers } from '../hooks/useOrganizationUsers'
import { useAuth, useUser } from '@clerk/nextjs'
import { useOrganizationInfo } from '../hooks/useOrganizationInfo'
import { AdminInviteWizard } from '../organizations/[organizationId]/components/AdminInviteWizard'
import { useAdminPermissions } from '@/lib/hooks/useAdminPermissions'
import { ClerkResendInvitationAdmin } from '../organizations/actions/clerk-resend-invitation-admin'
import { ClerkRevokeInvitation } from '../organizations/actions/clerk-revoke-invitation'
import {
    getOrgInvitationLink,
    getOrgMemberInvites,
    resendOrgMemberInvite,
    revokeOrgMemberInvite,
} from '../actions/org-invitations'
import { toast } from 'sonner'
import {
    activateAdminUser,
    deactivateAdminUser,
    resetAdminUserPassword,
} from '../actions/admin-user-management'
import { HQ_ROLES, type HQRoleCode } from '@/types/admin'
import {
    CENTRED_DIALOG,
    ConfirmDialog,
    PageHeader,
    PageShell,
    Panel,
    StatRow,
    StatTile,
} from '@/components/dashboard/shell'
import { PaginationBar } from '@/components/dashboard/PaginationBar'
import { useClientPagination } from '@/lib/hooks/useClientPagination'
import { EditRoleDialog, HQ_ROLES_BY_LEVEL } from './components/EditRoleDialog'
import { UsersDirectorySkeleton } from './components/skeletons'

const DEXA_HQ_ORG_ID = process.env.NEXT_PUBLIC_DEXA_POS_INTERNAL_TEAM_ID ?? ''

/** Account states as stored in Clerk `public_metadata.status`. A missing value reads as Active. */
const STATUS_OPTIONS = ['Active', 'Inactive', 'Pending'] as const

/** List state kept in the URL (§5.9), and the value each key takes when absent. */
const URL_DEFAULTS = { tab: 'users', q: '', role: 'all', status: 'all', page: '1' } as const

const USER_TABS = [
    { value: 'users', label: 'Users' },
    { value: 'invites', label: 'Invites' },
] as const

/* Filter selects are spelled out until `select.tsx` ships the muted material
   itself (§11): a bare trigger still renders bordered. */
const FILTER_TRIGGER =
    'h-9 w-full min-w-0 border-0 bg-muted/60 px-3 text-[0.8125rem] shadow-none dark:bg-muted/60 sm:w-44'

const USERS_LOADING = <UsersDirectorySkeleton />

function roleName(code?: string | null) {
    if (!code) return '—'
    return HQ_ROLES[code as HQRoleCode]?.name ?? code
}

function memberStatus(member: any): string {
    return member?.users?.public_metadata?.status || 'Active'
}

function memberName(member: any): string {
    const name = `${member?.users?.first_name || ''} ${member?.users?.last_name || ''}`.trim()
    return name || member?.users?.email || 'Unnamed user'
}

function initials(member: any): string {
    const first = member?.users?.first_name?.charAt(0) || ''
    const last = member?.users?.last_name?.charAt(0) || ''
    return (first + last).toUpperCase() || (member?.users?.email?.charAt(0) || '?').toUpperCase()
}

/** A day, for table cells: `Sep 28, 2026`. Unknown renders `—` (§4.9). */
function formatDay(value?: string | null) {
    if (!value) return '—'
    return new Date(value).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

/** The full timestamp, for a cell's `title`. */
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

function inviteDisplayName(invite: any) {
    const fullName = `${invite.first_name || ''} ${invite.last_name || ''}`.trim()
    if (fullName) return fullName
    return invite.email?.split('@')?.[0] || 'Pending admin'
}

function inviteStatusLabel(status?: string | null) {
    if (!status) return 'Unknown'
    return status
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ')
}

/** An invite the menu acts on: admin invites live in Supabase, member invites only in Clerk. */
type InviteTarget = { kind: 'admin' | 'member'; id: string; organizationId: string; email: string }

/** `useSearchParams` needs a Suspense boundary above it. */
export default function UsersPage() {
    return (
        <Suspense fallback={USERS_LOADING}>
            <UsersDirectory />
        </Suspense>
    )
}

function UsersDirectory() {
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const { orgId } = useAuth()
    const { role_level, isSuperAdmin, isAtLeast, isLoading: permissionsLoading } = useAdminPermissions()
    // Any HQ admin may view this list; role, password, activation and invite
    // actions need super admin or level 8+.
    const canManage = isSuperAdmin || isAtLeast(8)

    // The tab, search, filters and page live in the URL, so "back" from a user
    // lands on the same page of the same filtered list (§5.9).
    const [searchTerm, setSearchTerm] = useState(() => searchParams.get('q') ?? '')
    const [roleFilter, setRoleFilter] = useState(() => searchParams.get('role') ?? 'all')
    const [statusFilter, setStatusFilter] = useState(() => searchParams.get('status') ?? 'all')
    const [activeTab, setActiveTab] = useState(() =>
        searchParams.get('tab') === 'invites' ? 'invites' : 'users'
    )
    const [inviteSearch, setInviteSearch] = useState('')

    const writeParams = (updates: Partial<Record<keyof typeof URL_DEFAULTS, string | number | null>>) => {
        const next = new URLSearchParams(searchParams.toString())
        for (const [key, value] of Object.entries(updates)) {
            // Defaults stay out of the URL, so a plain visit keeps a clean address.
            const isDefault = value === null || value === '' || String(value) === URL_DEFAULTS[key as keyof typeof URL_DEFAULTS]
            if (isDefault) next.delete(key)
            else next.set(key, String(value))
        }
        const query = next.toString()
        // `replaceState` is tracked by the Next router (useSearchParams stays in
        // sync) but, unlike router.replace, never round-trips to the server, so
        // typing in the search box costs nothing.
        window.history.replaceState(null, '', query ? `${pathname}?${query}` : pathname)
    }

    const [isAdminInviteOpen, setIsAdminInviteOpen] = useState(false)
    const [inviteActionId, setInviteActionId] = useState<string | null>(null)
    const [revokeTarget, setRevokeTarget] = useState<InviteTarget | null>(null)
    const [roleEditMember, setRoleEditMember] = useState<any | null>(null)
    const [deactivateMember, setDeactivateMember] = useState<any | null>(null)
    const [userActionId, setUserActionId] = useState<string | null>(null)
    const [resetPasswordResult, setResetPasswordResult] = useState<{
        userName: string
        userEmail: string
        tempPassword: string
    } | null>(null)
    const { user } = useUser()
    const fallbackOrgId = user?.publicMetadata?.organizationId as string | undefined
    const resolvedOrganizationId = DEXA_HQ_ORG_ID || fallbackOrgId || (orgId as string)
    const { data: users, isLoading, error, refetch: refetchUsers } = useOrganizationUsers(resolvedOrganizationId as string)
    const { data: organizationInfo, refetch: refetchOrganizationInfo } = useOrganizationInfo(resolvedOrganizationId as string)
    const memberInvitesQuery = useQuery({
        queryKey: ['hq-member-invites', resolvedOrganizationId],
        queryFn: () => getOrgMemberInvites(resolvedOrganizationId),
        enabled: !!resolvedOrganizationId,
    })

    // The action returns an `Error` instead of throwing, so it arrives as data.
    const usersData = !users || users instanceof Error
        ? null
        : (users as { members?: any[]; pending_org_admin_invites?: any[] })
    const loadError = error ?? (users instanceof Error ? users : null)

    const members: any[] = useMemo(() => usersData?.members ?? [], [usersData])

    const filteredUsers = useMemo(() => {
        const query = searchTerm.trim().toLowerCase()
        return members.filter((member) => {
            const matchesSearch =
                !query ||
                (member?.users?.first_name || '').toLowerCase().includes(query) ||
                (member?.users?.last_name || '').toLowerCase().includes(query) ||
                (member?.users?.email || '').toLowerCase().includes(query)
            const matchesRole = roleFilter === 'all' || member?.role === roleFilter
            const matchesStatus = statusFilter === 'all' || memberStatus(member) === statusFilter
            return matchesSearch && matchesRole && matchesStatus
        })
    }, [members, searchTerm, roleFilter, statusFilter])

    const inviteQuery = inviteSearch.trim().toLowerCase()
    const matchesInvite = (email?: string | null, ...labels: string[]) =>
        !inviteQuery ||
        !!email?.toLowerCase().includes(inviteQuery) ||
        labels.some((label) => label.toLowerCase().includes(inviteQuery))
    const orgInfo = organizationInfo instanceof Error ? null : organizationInfo
    const allAdminInvites: any[] = orgInfo?.pending_org_admin_invites ?? []
    const allMemberInvites = memberInvitesQuery.data?.data ?? []
    const filteredAdminInvites = allAdminInvites.filter((invite) =>
        matchesInvite(invite?.email, inviteDisplayName(invite), roleName(invite?.role))
    )
    const filteredMemberInvites = allMemberInvites.filter((invite) =>
        matchesInvite(invite.email, roleName(invite.role))
    )

    // §5.7: 10 per page, table and card grid alike. Called above the early
    // returns so the hook order is fixed.
    const userPage = useClientPagination(filteredUsers, 10, Number(searchParams.get('page')) || 1)
    const adminInvitePage = useClientPagination(filteredAdminInvites, 10)
    const memberInvitePage = useClientPagination(filteredMemberInvites, 10)

    if (permissionsLoading || isLoading) return USERS_LOADING

    if (loadError)
        return (
            <PageShell as="div">
                <PageHeader title="Users" />
                {/* A neutral well with Retry, not red text (§4.9). */}
                <div className="flex flex-col items-center justify-center gap-4 rounded-2xl bg-muted/30 px-4 py-20">
                    <AlertCircle className="h-12 w-12 text-muted-foreground" />
                    <div className="space-y-2 text-center">
                        <h2 className="text-lg font-semibold">We hit a snag loading HQ users</h2>
                        <p className="text-sm text-muted-foreground">{loadError.message}</p>
                    </div>
                    <Button onClick={() => void refetchUsers()}>Retry</Button>
                </div>
            </PageShell>
        )

    const activeCount = members.filter((member) => memberStatus(member) === 'Active').length
    // Pending invites only, from the same two sources the Invites tab lists. The
    // tab also shows accepted and revoked admin invites; the tile does not count them.
    const pendingInviteCount =
        allAdminInvites.filter((invite) => invite.status === 'pending').length + allMemberInvites.length
    const filtersActive = searchTerm.trim() !== '' || roleFilter !== 'all' || statusFilter !== 'all'

    // A user's page links back here with this exact list state (§5.9).
    const listQuery = searchParams.toString()
    const userHref = (id?: string) =>
        `/manage/users/${id}${listQuery ? `?back=${encodeURIComponent(listQuery)}` : ''}`

    const setUserPage = (page: number) => {
        userPage.setPage(page)
        writeParams({ page })
    }
    const clearFilters = () => {
        setSearchTerm('')
        setRoleFilter('all')
        setStatusFilter('all')
        userPage.setPage(1)
        writeParams({ q: null, role: null, status: null, page: null })
    }

    const refetchInvites = () => {
        void refetchOrganizationInfo()
        void memberInvitesQuery.refetch()
    }

    /** Runs a user action with its busy flag, toast and refetch. */
    const runUserAction = async (
        actionId: string,
        action: () => Promise<{ success: boolean; message?: string }>,
        fallbackError: string
    ) => {
        setUserActionId(actionId)
        try {
            const result = await action()
            if (!result.success) {
                toast.error(result.message || fallbackError)
                return false
            }
            toast.success(result.message || 'Done')
            await refetchUsers()
            return true
        } catch (error) {
            console.error(`[UsersPage] ${fallbackError}:`, error)
            toast.error(fallbackError)
            return false
        } finally {
            setUserActionId(null)
        }
    }

    const handleDeactivateUser = async () => {
        const id = deactivateMember?.users?.id as string | undefined
        if (!id) return
        const done = await runUserAction(
            `deactivate:${id}`,
            () => deactivateAdminUser({ userId: id, organizationId: resolvedOrganizationId }),
            'Failed to deactivate user'
        )
        if (done) setDeactivateMember(null)
    }

    const handleActivateUser = (member: any) => {
        const id = member?.users?.id as string | undefined
        if (!id) return
        void runUserAction(
            `activate:${id}`,
            () => activateAdminUser({ userId: id, organizationId: resolvedOrganizationId }),
            'Failed to activate user'
        )
    }

    const handleResetPassword = async (member: any) => {
        const userIdToReset = member?.users?.id as string | undefined
        if (!userIdToReset) return

        setUserActionId(`reset:${userIdToReset}`)
        try {
            const result = await resetAdminUserPassword({
                userId: userIdToReset,
                organizationId: resolvedOrganizationId,
            })
            if (!result.success || !result.tempPassword) {
                toast.error(result.message || 'Failed to reset password')
                return
            }
            setResetPasswordResult({
                userName: memberName(member),
                userEmail: member?.users?.email || '',
                tempPassword: result.tempPassword,
            })
            await refetchUsers()
        } catch (error) {
            console.error('[UsersPage] Failed to reset password:', error)
            toast.error('Failed to reset password')
        } finally {
            setUserActionId(null)
        }
    }

    const handleCopyTempPassword = async () => {
        if (!resetPasswordResult?.tempPassword) return
        try {
            await navigator.clipboard.writeText(resetPasswordResult.tempPassword)
            toast.success('Temporary password copied')
        } catch (error) {
            console.error('[UsersPage] Failed to copy temp password:', error)
            toast.error('Failed to copy password')
        }
    }

    /** Runs an invite action with its busy flag, toast and refetch. */
    const runInviteAction = async (
        invitationId: string,
        action: () => Promise<{ success: boolean; message?: string }>,
        success: string,
        fallbackError: string
    ) => {
        setInviteActionId(invitationId)
        try {
            const result = await action()
            if (!result?.success) {
                toast.error(result?.message || fallbackError)
                return false
            }
            toast.success(success)
            return true
        } catch (error) {
            console.error(`[UsersPage] ${fallbackError}:`, error)
            toast.error(fallbackError)
            return false
        } finally {
            setInviteActionId(null)
            // Also after a failure: a resend can revoke the old invite and then
            // fail to send the new one, and the list must show that.
            refetchInvites()
        }
    }

    const handleResendInvite = (target: InviteTarget) =>
        void runInviteAction(
            target.id,
            () =>
                target.kind === 'admin'
                    ? ClerkResendInvitationAdmin(target.id)
                    : resendOrgMemberInvite(target.organizationId, target.id),
            'Invitation resent',
            'Failed to resend invitation'
        )

    const handleRevokeInvite = async () => {
        if (!revokeTarget) return
        const target = revokeTarget
        const done = await runInviteAction(
            target.id,
            () =>
                target.kind === 'admin'
                    ? ClerkRevokeInvitation(target.id)
                    : revokeOrgMemberInvite(target.organizationId, target.id),
            'Invitation revoked',
            'Failed to revoke invitation'
        )
        if (done) setRevokeTarget(null)
    }

    const handleCopyInviteLink = async (target: InviteTarget) => {
        setInviteActionId(target.id)
        try {
            const result = await getOrgInvitationLink(target.organizationId, target.id)
            if (!result.success || !result.url) {
                toast.error(result.message || 'Could not get the invite link')
                return
            }
            try {
                await navigator.clipboard.writeText(result.url)
                toast.success('Invite link copied')
            } catch {
                // Some browsers refuse clipboard writes after an await; show the link instead.
                toast.message('Copy this invite link', { description: result.url, duration: 20000 })
            }
        } catch (error) {
            console.error('[UsersPage] Copy invite link failed:', error)
            toast.error('Could not get the invite link')
        } finally {
            setInviteActionId(null)
        }
    }

    const rowMenu = (member: any) => (
        <UserRowMenu
            member={member}
            href={userHref(member?.users?.id)}
            canManage={canManage}
            busyActionId={userActionId}
            onEditRole={() => setRoleEditMember(member)}
            onResetPassword={() => void handleResetPassword(member)}
            onActivate={() => handleActivateUser(member)}
            onDeactivate={() => setDeactivateMember(member)}
        />
    )

    const inviteMenu = (target: InviteTarget, status: string | null | undefined) => (
        <InviteRowMenu
            email={target.email}
            status={status}
            canManage={canManage}
            disabled={inviteActionId === target.id}
            onCopyLink={() => void handleCopyInviteLink(target)}
            onResend={() => handleResendInvite(target)}
            onRevoke={() => setRevokeTarget(target)}
        />
    )

    const usersEmpty = members.length === 0
        ? { title: 'No HQ users yet', hint: 'Invite an admin to add someone to the HQ team.' }
        : { title: 'No users match these filters', hint: 'Clear the search or filters to widen the results.' }

    const memberInvitesLoaded = !memberInvitesQuery.isLoading
    const noInvites =
        memberInvitesLoaded && filteredAdminInvites.length === 0 && filteredMemberInvites.length === 0

    return (
        /* `as="div"`: app/manage/layout.tsx already owns this surface's <main>. */
        <PageShell as="div">
            <PageHeader
                title="Users"
                subtitle="Manage user accounts, roles, and permissions across your organization."
                actions={
                    canManage && (
                        <Button className="h-9 px-4" onClick={() => setIsAdminInviteOpen(true)}>
                            <UserPlus className="mr-2 h-4 w-4" />
                            Invite user
                        </Button>
                    )
                }
            />

            {/* Headline figures for both tabs, so they sit above the rail. */}
            <Panel padded>
                <StatRow columns={3}>
                    <StatTile
                        label="Total users"
                        value={members.length}
                        meta="Everyone on the HQ team"
                        icon={<Users />}
                    />
                    <StatTile
                        label="Active users"
                        value={activeCount}
                        meta={
                            members.length > 0
                                ? `${Math.round((activeCount / members.length) * 100)}% of all users`
                                : 'No users yet'
                        }
                        icon={<UserCheck />}
                    />
                    <StatTile
                        label="Pending invites"
                        value={memberInvitesLoaded ? pendingInviteCount : '—'}
                        meta="Awaiting acceptance"
                        icon={<Mail />}
                    />
                </StatRow>
            </Panel>

            <Tabs
                value={activeTab}
                onValueChange={(value) => {
                    setActiveTab(value)
                    writeParams({ tab: value })
                }}
            >
                {/* Pill rail (§4.5). Two short labels always fit at 320px, so the
                    §13.2 auto-scroll has nothing to do here. */}
                <div className="w-full min-w-0 overflow-x-auto pb-1">
                    <TabsList className="inline-flex h-auto w-max flex-nowrap gap-0.5 rounded-full bg-muted/70 p-1">
                        {USER_TABS.map((tab) => (
                            <TabsTrigger
                                key={tab.value}
                                value={tab.value}
                                className="shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border"
                            >
                                {tab.label}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </div>

                <TabsContent value="users" className="mt-6">
                    {/* Skeleton A: toolbar, table well and pager share one panel. */}
                    <Panel padded>
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <SearchField
                                name="user-search"
                                label="Search users"
                                placeholder="Search by name or email"
                                value={searchTerm}
                                onChange={(value) => {
                                    setSearchTerm(value)
                                    userPage.setPage(1)
                                    writeParams({ q: value.trim(), page: null })
                                }}
                                className="lg:w-72"
                            />
                            <div className="grid min-w-0 grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
                                <Select
                                    value={roleFilter}
                                    onValueChange={(value) => {
                                        setRoleFilter(value)
                                        userPage.setPage(1)
                                        writeParams({ role: value, page: null })
                                    }}
                                >
                                    <SelectTrigger aria-label="Role" className={FILTER_TRIGGER}>
                                        <SelectValue placeholder="All roles" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All roles</SelectItem>
                                        {HQ_ROLES_BY_LEVEL.map((role) => (
                                            <SelectItem key={role.code} value={role.code}>
                                                {role.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Select
                                    value={statusFilter}
                                    onValueChange={(value) => {
                                        setStatusFilter(value)
                                        userPage.setPage(1)
                                        writeParams({ status: value, page: null })
                                    }}
                                >
                                    <SelectTrigger aria-label="Status" className={FILTER_TRIGGER}>
                                        <SelectValue placeholder="All statuses" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All statuses</SelectItem>
                                        {STATUS_OPTIONS.map((status) => (
                                            <SelectItem key={status} value={status}>
                                                {status}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {filtersActive && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={clearFilters}
                                        className="col-span-2 h-9 px-3 text-[0.8125rem] text-muted-foreground hover:text-foreground"
                                    >
                                        Clear filters
                                    </Button>
                                )}
                            </div>
                        </div>

                        <div className="mt-5 min-w-0">
                            {/* §5.3: the table from `md`, with columns joining as
                                they fit; essential-only cards below `md`. Rows are
                                one line and the table never scrolls inside itself
                                (§5.7). */}
                            <Table variant="data" bounded={false} containerClassName="hidden md:block">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>User</TableHead>
                                        <TableHead className="hidden xl:table-cell">Email</TableHead>
                                        <TableHead>Role</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="hidden text-right lg:table-cell">Merchants</TableHead>
                                        <TableHead className="hidden lg:table-cell">Joined</TableHead>
                                        {/* The profile's `updated_at`, not a sign-in time. */}
                                        <TableHead className="hidden 2xl:table-cell">Updated</TableHead>
                                        <TableHead className="w-12">
                                            <span className="sr-only">Actions</span>
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {userPage.pageRows.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={8} className="h-24 text-center">
                                                <p className="text-sm font-medium">{usersEmpty.title}</p>
                                                <p className="mt-1 text-xs text-muted-foreground">{usersEmpty.hint}</p>
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        userPage.pageRows.map((member: any) => {
                                            const href = userHref(member.users?.id)
                                            const updatedAt = member?.users?.updated_at || member.created_at
                                            return (
                                                <TableRow key={member.id} className="relative">
                                                    <TableCell className="max-w-[240px]">
                                                        {/* The whole row is one real link (§5.9): it
                                                            opens in a new tab and takes keyboard focus.
                                                            The action menu sits above it. */}
                                                        <Link
                                                            href={href}
                                                            aria-label={`View ${memberName(member)}`}
                                                            className="absolute inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                                                        />
                                                        <div className="flex min-w-0 items-center gap-3" title={member?.users?.email || undefined}>
                                                            <Avatar className="h-7 w-7 shrink-0">
                                                                <AvatarImage src={member?.users?.avatar_url || ''} alt="" />
                                                                <AvatarFallback className="text-xs">{initials(member)}</AvatarFallback>
                                                            </Avatar>
                                                            <span className="min-w-0 truncate font-medium">{memberName(member)}</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="hidden max-w-[260px] truncate text-sm text-muted-foreground xl:table-cell">
                                                        {member?.users?.email || '—'}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline">{roleName(member?.role)}</Badge>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline">{memberStatus(member)}</Badge>
                                                    </TableCell>
                                                    <TableCell className="hidden text-right tabular-nums lg:table-cell">
                                                        {member?.assigned_merchant_count ?? 0}
                                                    </TableCell>
                                                    <TableCell
                                                        className="hidden text-sm text-muted-foreground tabular-nums lg:table-cell"
                                                        title={formatTimestamp(member.created_at)}
                                                    >
                                                        {formatDay(member.created_at)}
                                                    </TableCell>
                                                    <TableCell
                                                        className="hidden text-sm text-muted-foreground tabular-nums 2xl:table-cell"
                                                        title={formatTimestamp(updatedAt)}
                                                    >
                                                        {formatDay(updatedAt)}
                                                    </TableCell>
                                                    <TableCell className="relative z-10 text-right">{rowMenu(member)}</TableCell>
                                                </TableRow>
                                            )
                                        })
                                    )}
                                </TableBody>
                            </Table>

                            {/* Phones: cards with the essentials only (§5.3, D-27).
                                Email and dates are on the user's page. */}
                            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 md:hidden">
                                {userPage.pageRows.length === 0 ? (
                                    <div className="col-span-full flex min-h-40 flex-col items-center justify-center gap-2 rounded-2xl bg-muted/30 px-4 text-center">
                                        <p className="text-sm font-medium">{usersEmpty.title}</p>
                                        <p className="text-xs text-muted-foreground">{usersEmpty.hint}</p>
                                    </div>
                                ) : (
                                    userPage.pageRows.map((member: any) => (
                                        <div
                                            key={member.id}
                                            className="relative min-w-0 rounded-2xl border-0 bg-muted/45 p-4 transition-colors hover:bg-muted"
                                        >
                                            {/* Stretched link: the whole card opens the
                                                user; the menu sits above it. */}
                                            <Link
                                                href={userHref(member.users?.id)}
                                                aria-label={`View ${memberName(member)}`}
                                                className="absolute inset-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                            />
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex min-w-0 items-baseline gap-2">
                                                    <p className="truncate font-semibold">{memberName(member)}</p>
                                                    <span className="shrink-0 text-xs text-muted-foreground">
                                                        {memberStatus(member)}
                                                    </span>
                                                </div>
                                                <div className="relative z-10 -mr-1 -mt-1 shrink-0">{rowMenu(member)}</div>
                                            </div>

                                            {/* Values are plain text on the tinted card (§3.5). */}
                                            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                                <CardField label="Role" value={roleName(member?.role)} />
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>

                            <PaginationBar
                                pagination={userPage.pagination}
                                onPageChange={setUserPage}
                                itemLabel="users"
                            />
                            {/* The pager hides when everything fits on one page;
                                the count still shows (§5.2). */}
                            {userPage.pagination.totalPages <= 1 && filteredUsers.length > 0 && (
                                <p className="mt-4 text-xs text-muted-foreground tabular-nums sm:text-sm">
                                    {filtersActive
                                        ? `${filteredUsers.length} of ${members.length} users`
                                        : `${members.length} ${members.length === 1 ? 'user' : 'users'}`}
                                </p>
                            )}
                        </div>
                    </Panel>
                </TabsContent>

                <TabsContent value="invites" className="mt-6">
                    <Panel padded>
                        <SearchField
                            name="invite-search"
                            label="Search invites"
                            placeholder="Search by name, email or role"
                            value={inviteSearch}
                            onChange={(value) => {
                                setInviteSearch(value)
                                adminInvitePage.setPage(1)
                                memberInvitePage.setPage(1)
                            }}
                            className="sm:w-72"
                        />

                        <div className="mt-5 min-w-0 space-y-6">
                            {noInvites && (
                                <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-2xl bg-muted/30 px-4 text-center">
                                    <Mail className="h-6 w-6 text-muted-foreground" />
                                    <p className="text-sm font-medium">
                                        {inviteQuery ? 'No invites match your search' : 'No invites yet'}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {inviteQuery
                                            ? 'Clear the search to see every invite.'
                                            : 'Invitations you send to new team members will appear here.'}
                                    </p>
                                </div>
                            )}

                            {filteredAdminInvites.length > 0 && (
                                <section>
                                    <h3 className="mb-3 text-sm text-muted-foreground">Admin invites</h3>
                                    <div className="space-y-2">
                                        {adminInvitePage.pageRows.map((inv: any) => (
                                            <InviteRow
                                                key={inv.id}
                                                name={inviteDisplayName(inv)}
                                                email={inv.email}
                                                role={roleName(inv.role)}
                                                status={inviteStatusLabel(inv.status)}
                                                invitedBy={inv.invited_by_user?.first_name || inv.invited_by || 'Unknown'}
                                                invitedAt={inv.created_at}
                                                menu={
                                                    inv.clerk_invite_id && inv.organization_id
                                                        ? inviteMenu(
                                                              {
                                                                  kind: 'admin',
                                                                  id: inv.clerk_invite_id,
                                                                  organizationId: inv.organization_id,
                                                                  email: inv.email,
                                                              },
                                                              inv.status
                                                          )
                                                        : null
                                                }
                                            />
                                        ))}
                                    </div>
                                    <PaginationBar
                                        pagination={adminInvitePage.pagination}
                                        onPageChange={adminInvitePage.setPage}
                                        itemLabel="admin invites"
                                    />
                                </section>
                            )}

                            {memberInvitesQuery.data?.error && (
                                <p className="rounded-2xl bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                                    Member invites could not be loaded: {memberInvitesQuery.data.error}
                                </p>
                            )}

                            {filteredMemberInvites.length > 0 && (
                                <section>
                                    <h3 className="mb-3 text-sm text-muted-foreground">Member invites</h3>
                                    <div className="space-y-2">
                                        {memberInvitePage.pageRows.map((inv) => (
                                            <InviteRow
                                                key={inv.id}
                                                name={inv.email.split('@')[0] || 'Pending member'}
                                                email={inv.email}
                                                role={roleName(inv.role)}
                                                status="Pending"
                                                invitedAt={inv.createdAt}
                                                menu={inviteMenu(
                                                    {
                                                        kind: 'member',
                                                        id: inv.id,
                                                        organizationId: resolvedOrganizationId,
                                                        email: inv.email,
                                                    },
                                                    'pending'
                                                )}
                                            />
                                        ))}
                                    </div>
                                    <PaginationBar
                                        pagination={memberInvitePage.pagination}
                                        onPageChange={memberInvitePage.setPage}
                                        itemLabel="member invites"
                                    />
                                </section>
                            )}
                        </div>
                    </Panel>
                </TabsContent>
            </Tabs>

            <AdminInviteWizard
                organizationId={DEXA_HQ_ORG_ID}
                orgType="hq"
                open={isAdminInviteOpen}
                onOpenChange={setIsAdminInviteOpen}
                onSuccess={() => {
                    refetchInvites()
                    void refetchUsers()
                }}
            />

            <EditRoleDialog
                open={!!roleEditMember}
                onOpenChange={(open) => !open && setRoleEditMember(null)}
                userId={roleEditMember?.users?.id ?? ''}
                organizationId={resolvedOrganizationId}
                subject={roleEditMember?.users?.email || memberName(roleEditMember)}
                currentRole={roleEditMember?.role}
                roles={HQ_ROLES_BY_LEVEL.filter((role) => role.level <= role_level)}
                onSaved={() => void refetchUsers()}
            />

            <ConfirmDialog
                open={!!deactivateMember}
                onOpenChange={(open) => !open && setDeactivateMember(null)}
                title="Deactivate user?"
                description={`${memberName(deactivateMember)} will be signed out and can no longer sign in. You can activate them again later.`}
                confirmLabel="Deactivate"
                pendingLabel="Deactivating…"
                destructive
                pending={!!deactivateMember && userActionId === `deactivate:${deactivateMember?.users?.id}`}
                onConfirm={() => void handleDeactivateUser()}
            />

            <ConfirmDialog
                open={!!revokeTarget}
                onOpenChange={(open) => !open && setRevokeTarget(null)}
                title="Revoke invitation?"
                description={`The invite to ${revokeTarget?.email ?? 'this address'} stops working. You can send a new one later.`}
                confirmLabel="Revoke"
                pendingLabel="Revoking…"
                destructive
                pending={!!revokeTarget && inviteActionId === revokeTarget.id}
                onConfirm={() => void handleRevokeInvite()}
            />

            {/* Short and two-button: a centred card on phones too (§13.1). */}
            <Dialog open={!!resetPasswordResult} onOpenChange={(open) => !open && setResetPasswordResult(null)}>
                <DialogContent className={CENTRED_DIALOG}>
                    <DialogHeader className="pr-10 text-left">
                        <DialogTitle>Temporary password generated</DialogTitle>
                        <DialogDescription>
                            Share this with{' '}
                            <span className="font-medium">{resetPasswordResult?.userName || 'the user'}</span>{' '}
                            securely. It is shown only once.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="rounded-2xl bg-muted/60 px-4 py-3">
                        <div className="mb-1 text-xs text-muted-foreground">{resetPasswordResult?.userEmail}</div>
                        <div className="break-all font-mono text-sm">{resetPasswordResult?.tempPassword}</div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => void handleCopyTempPassword()}>
                            <Copy className="mr-2 h-4 w-4" />
                            Copy
                        </Button>
                        <Button onClick={() => setResetPasswordResult(null)}>Done</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </PageShell>
    )
}

/**
 * Row actions, shared by the table row and the mobile card so the two cannot
 * drift apart. Clicks stop at the menu: React bubbles portal events through
 * the tree, so an item click would otherwise also fire the row's navigation.
 */
function UserRowMenu({
    member,
    href,
    canManage,
    busyActionId,
    onEditRole,
    onResetPassword,
    onActivate,
    onDeactivate,
}: {
    member: any
    /** The user's page, carrying the list state for the back link (§5.9). */
    href: string
    canManage: boolean
    busyActionId: string | null
    onEditRole: () => void
    onResetPassword: () => void
    onActivate: () => void
    onDeactivate: () => void
}) {
    const id = member?.users?.id
    const isInactive = memberStatus(member) === 'Inactive'
    const stop = (event: SyntheticEvent) => event.stopPropagation()

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    aria-label={`Actions for ${memberName(member)}`}
                    className="h-8 w-8 rounded-full p-0"
                    onClick={stop}
                >
                    <MoreHorizontal className="h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={stop}>
                <DropdownMenuItem asChild>
                    <Link href={href}>
                        <Eye className="mr-2 h-4 w-4" />
                        View details
                    </Link>
                </DropdownMenuItem>
                {canManage && (
                    <>
                        <DropdownMenuItem onClick={onEditRole}>
                            <Edit className="mr-2 h-4 w-4" />
                            Edit role
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={onResetPassword} disabled={busyActionId === `reset:${id}`}>
                            <KeyRound className="mr-2 h-4 w-4" />
                            Reset password
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {/* Activate is neutral; deactivate is the destructive action (§3.5 use 3). */}
                        {isInactive ? (
                            <DropdownMenuItem onClick={onActivate} disabled={busyActionId === `activate:${id}`}>
                                <UserCheck className="mr-2 h-4 w-4" />
                                {busyActionId === `activate:${id}` ? 'Activating…' : 'Activate'}
                            </DropdownMenuItem>
                        ) : (
                            <DropdownMenuItem variant="destructive" onClick={onDeactivate}>
                                <UserX className="mr-2 h-4 w-4" />
                                Deactivate
                            </DropdownMenuItem>
                        )}
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

/** One pending invite. A list, not a table: it reads the same at every width. */
function InviteRow({
    name,
    email,
    role,
    status,
    invitedBy,
    invitedAt,
    menu,
}: {
    name: string
    email: string
    role: string
    status: string
    invitedBy?: string
    invitedAt?: string | null
    menu: React.ReactNode
}) {
    return (
        <div className="flex min-w-0 items-start justify-between gap-3 rounded-2xl bg-muted/45 p-4">
            <div className="min-w-0">
                {/* Identity and status lead (§5.3). Status is a word, not a
                    pill: the row is already tinted (§3.5). */}
                <div className="flex min-w-0 items-baseline gap-2">
                    <p className="truncate font-medium">{name}</p>
                    <span className="shrink-0 text-xs font-medium">{status}</span>
                </div>
                <p className="truncate text-sm text-muted-foreground">{email}</p>
                {/* Phones keep the role; who sent it and when join from `md` (D-27). */}
                <p className="mt-1 text-xs text-muted-foreground">
                    {role}
                    {invitedBy && <span className="max-md:hidden"> · Invited by {invitedBy}</span>}
                    {invitedAt && (
                        <span className="max-md:hidden">
                            {' · '}
                            <span className="tabular-nums" title={formatTimestamp(invitedAt)}>
                                {formatDay(invitedAt)}
                            </span>
                        </span>
                    )}
                </p>
            </div>
            <div className="-mr-1 -mt-1 shrink-0">{menu}</div>
        </div>
    )
}

/**
 * What can be done with an invite depends on its state, so the menu only lists
 * what works: a pending invite can be copied, resent or revoked; a revoked or
 * expired one can only be sent again; an accepted one has nothing left to do.
 */
function InviteRowMenu({
    email,
    status,
    canManage,
    disabled,
    onCopyLink,
    onResend,
    onRevoke,
}: {
    email: string
    status: string | null | undefined
    canManage: boolean
    /** True while an action on this invite is running. */
    disabled: boolean
    onCopyLink: () => void
    onResend: () => void
    onRevoke: () => void
}) {
    // Every action needs manage rights: an invite link lets anyone join HQ.
    if (!canManage) return null
    // Accepted (or created directly): the person is a user now.
    if (status === 'accepted' || status === 'direct_created') return null
    const isPending = status === 'pending'
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    aria-label={`Actions for the invite to ${email}`}
                    className="h-8 w-8 rounded-full p-0"
                >
                    <MoreHorizontal className="h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                {isPending && (
                    <DropdownMenuItem disabled={disabled} onClick={onCopyLink}>
                        <Link2 className="mr-2 h-4 w-4" />
                        Copy invite link
                    </DropdownMenuItem>
                )}
                <DropdownMenuItem disabled={disabled} onClick={onResend}>
                    <RotateCw className="mr-2 h-4 w-4" />
                    {isPending ? 'Resend' : 'Send again'}
                </DropdownMenuItem>
                {isPending && (
                    <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" disabled={disabled} onClick={onRevoke}>
                            <Ban className="mr-2 h-4 w-4" />
                            Revoke
                        </DropdownMenuItem>
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

/**
 * A toolbar search box in its own `<form>`. Browsers autofill one form at a
 * time, and every input outside a form counts as one shared form, so without
 * this Chrome wrote a saved email into the search box whenever the invite
 * wizard's name and email fields were autofilled ("…or email" in the
 * placeholder makes it look like an email field).
 */
function SearchField({
    name,
    label,
    placeholder,
    value,
    onChange,
    className,
}: {
    name: string
    label: string
    placeholder: string
    value: string
    onChange: (value: string) => void
    className?: string
}) {
    return (
        <form
            role="search"
            className={cn('relative min-w-0', className)}
            onSubmit={(event) => event.preventDefault()}
        >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
            <Input
                name={name}
                autoComplete="off"
                aria-label={label}
                placeholder={placeholder}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className="h-9 pl-9 text-[0.8125rem]"
            />
        </form>
    )
}

/** A label/value pair inside a mobile record card. */
function CardField({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="truncate font-medium tabular-nums">{value}</p>
        </div>
    )
}
