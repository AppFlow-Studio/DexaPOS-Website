'use client'

import { useMemo, useState, type SyntheticEvent } from 'react'
import Link from 'next/link'
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
    DropdownMenuLabel,
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
    Check,
    AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useOrganizationUsers } from '../hooks/useOrganizationUsers'
import { useAuth, useUser } from '@clerk/nextjs'
import { useOrganizationInfo } from '../hooks/useOrganizationInfo'
import { useRouter } from 'next/navigation'
import { AdminInviteWizard } from '../organizations/[organizationId]/components/AdminInviteWizard'
import { useAdminPermissions } from '@/lib/hooks/useAdminPermissions'
import { ClerkResendInvitationAdmin } from '../organizations/actions/clerk-resend-invitation-admin'
import { ClerkRevokeInvitation } from '../organizations/actions/clerk-revoke-invitation'
import { toast } from 'sonner'
import {
    activateAdminUser,
    changeAdminUserRole,
    deactivateAdminUser,
    resetAdminUserPassword,
} from '../actions/admin-user-management'
import { HQ_ROLES, type HQRoleCode } from '@/types/admin'
import { DataPageSkeleton } from '@/components/dashboard/loading/DataPageSkeleton'
import { PageHeader, PageShell, Panel, StatRow, StatTile } from '@/components/dashboard/shell'
import { PaginationBar } from '@/components/dashboard/PaginationBar'
import { useClientPagination } from '@/lib/hooks/useClientPagination'

const DEXA_HQ_ORG_ID = process.env.NEXT_PUBLIC_DEXA_POS_INTERNAL_TEAM_ID ?? ''

/** Account states as stored in Clerk `public_metadata.status`. A missing value reads as Active. */
const STATUS_OPTIONS = ['Active', 'Inactive', 'Pending'] as const

/**
 * HQ roles, highest level first. `members.role` holds the role *code*
 * (`hq.super_admin` …), so the filter matches on codes — the old options
 * ("Admin", "Manager", …) matched no row at all.
 */
const ROLES_BY_LEVEL = Object.values(HQ_ROLES).sort((a, b) => b.level - a.level)

const USER_TABS = [
    { value: 'users', label: 'Users' },
    { value: 'invites', label: 'Invites' },
] as const

/* Filter selects are spelled out until `select.tsx` ships the muted material
   itself (§11): a bare trigger still renders bordered. */
const FILTER_TRIGGER =
    'h-9 w-full min-w-0 border-0 bg-muted/60 px-3 text-[0.8125rem] shadow-none dark:bg-muted/60 sm:w-44'

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

export default function UsersPage() {
    const router = useRouter()
    const { orgId } = useAuth()
    const { role_level, isSuperAdmin, isAtLeast, isLoading: permissionsLoading } = useAdminPermissions()
    // Any HQ admin may view this list; role, password, activation and invite
    // actions need super admin or level 8+.
    const canManage = isSuperAdmin || isAtLeast(8)
    const [searchTerm, setSearchTerm] = useState('')
    const [roleFilter, setRoleFilter] = useState('all')
    const [statusFilter, setStatusFilter] = useState('all')
    const [inviteSearch, setInviteSearch] = useState('')
    const [activeTab, setActiveTab] = useState('users')
    const [isAdminInviteOpen, setIsAdminInviteOpen] = useState(false)
    const [inviteActionId, setInviteActionId] = useState<string | null>(null)
    const [isEditRoleDialogOpen, setIsEditRoleDialogOpen] = useState(false)
    const [selectedMemberForRoleEdit, setSelectedMemberForRoleEdit] = useState<any | null>(null)
    const [selectedRoleCode, setSelectedRoleCode] = useState<HQRoleCode>('hq.manager')
    const [userActionId, setUserActionId] = useState<string | null>(null)
    const [resetPasswordResult, setResetPasswordResult] = useState<{
        userName: string
        userEmail: string
        tempPassword: string
    } | null>(null)
    const [isResetPasswordDialogOpen, setIsResetPasswordDialogOpen] = useState(false)
    const { user } = useUser()
    const fallbackOrgId = user?.publicMetadata?.organizationId as string | undefined
    const resolvedOrganizationId = DEXA_HQ_ORG_ID || fallbackOrgId || (orgId as string)
    const { data: users, isLoading, error, refetch: refetchUsers } = useOrganizationUsers(resolvedOrganizationId as string)
    const { data: organizationInfo, refetch: refetchOrganizationInfo } = useOrganizationInfo(resolvedOrganizationId as string)

    // The action returns an `Error` instead of throwing, so it arrives as data.
    const usersData = users instanceof Error ? null : users
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
    const matchesInvite = (invite: any) =>
        !inviteQuery ||
        invite?.email?.toLowerCase().includes(inviteQuery) ||
        inviteDisplayName(invite).toLowerCase().includes(inviteQuery) ||
        roleName(invite?.role).toLowerCase().includes(inviteQuery)
    const allAdminInvites: any[] = organizationInfo?.pending_org_admin_invites ?? []
    const allMemberInvites: any[] = organizationInfo?.pending_org_member_invites ?? []
    const filteredAdminInvites = allAdminInvites.filter(matchesInvite)
    const filteredMemberInvites = allMemberInvites.filter(matchesInvite)

    // §5.7: 10 per page, table and card grid alike. Called above the early
    // returns so the hook order is fixed.
    const userPage = useClientPagination(filteredUsers, 10)
    const adminInvitePage = useClientPagination(filteredAdminInvites, 10)
    const memberInvitePage = useClientPagination(filteredMemberInvites, 10)

    if (permissionsLoading || isLoading)
        return (
            <DataPageSkeleton
                variant="report"
                report={{ stats: 3, tabs: 2, body: 'table' }}
                shell="plain"
                label="Loading the HQ user directory"
            />
        )

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
    const pendingInviteCount = (usersData?.pending_org_admin_invites ?? []).filter(
        (invite: any) => invite.status === 'pending'
    ).length
    const filtersActive = searchTerm.trim() !== '' || roleFilter !== 'all' || statusFilter !== 'all'

    const resetUserPage = () => userPage.setPage(1)
    const clearFilters = () => {
        setSearchTerm('')
        setRoleFilter('all')
        setStatusFilter('all')
        resetUserPage()
    }

    const openEditRoleDialog = (member: any) => {
        const currentRole = member?.role as HQRoleCode | undefined
        setSelectedMemberForRoleEdit(member)
        setSelectedRoleCode(
            currentRole && HQ_ROLES[currentRole] ? currentRole : 'hq.manager'
        )
        setIsEditRoleDialogOpen(true)
    }

    const handleSaveRole = async () => {
        if (!selectedMemberForRoleEdit?.users?.id) return
        const actionId = `role:${selectedMemberForRoleEdit.users.id}`
        setUserActionId(actionId)
        try {
            const result = await changeAdminUserRole({
                userId: selectedMemberForRoleEdit.users.id,
                roleCode: selectedRoleCode,
                organizationId: resolvedOrganizationId,
            })
            if (!result.success) {
                toast.error(result.message || 'Failed to update role')
                return
            }
            toast.success('Role updated successfully')
            setIsEditRoleDialogOpen(false)
            setSelectedMemberForRoleEdit(null)
            await refetchUsers()
        } catch (error) {
            console.error('[UsersPage] Failed to update role:', error)
            toast.error('Failed to update role')
        } finally {
            setUserActionId(null)
        }
    }

    const handleDeactivateUser = async (member: any) => {
        const userIdToDeactivate = member?.users?.id as string | undefined
        if (!userIdToDeactivate) return

        const confirmed = window.confirm(`Deactivate ${memberName(member)}? They will no longer be able to sign in.`)
        if (!confirmed) return

        const actionId = `deactivate:${userIdToDeactivate}`
        setUserActionId(actionId)
        try {
            const result = await deactivateAdminUser({
                userId: userIdToDeactivate,
                organizationId: resolvedOrganizationId,
            })
            if (!result.success) {
                toast.error(result.message || 'Failed to deactivate user')
                return
            }
            toast.success('User deactivated')
            await refetchUsers()
        } catch (error) {
            console.error('[UsersPage] Failed to deactivate user:', error)
            toast.error('Failed to deactivate user')
        } finally {
            setUserActionId(null)
        }
    }

    const handleActivateUser = async (member: any) => {
        const userIdToActivate = member?.users?.id as string | undefined
        if (!userIdToActivate) return

        const actionId = `activate:${userIdToActivate}`
        setUserActionId(actionId)
        try {
            const result = await activateAdminUser({
                userId: userIdToActivate,
                organizationId: resolvedOrganizationId,
            })
            if (!result.success) {
                toast.error(result.message || 'Failed to activate user')
                return
            }
            toast.success(result.message || 'User activated')
            await refetchUsers()
        } catch (error) {
            console.error('[UsersPage] Failed to activate user:', error)
            toast.error('Failed to activate user')
        } finally {
            setUserActionId(null)
        }
    }

    const handleResetPassword = async (member: any) => {
        const userIdToReset = member?.users?.id as string | undefined
        if (!userIdToReset) return

        const actionId = `reset:${userIdToReset}`
        setUserActionId(actionId)
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
            setIsResetPasswordDialogOpen(true)
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

    const handleResendInvite = async (invitationId: string) => {
        setInviteActionId(invitationId)
        try {
            const result = await ClerkResendInvitationAdmin(invitationId)
            if (result?.success) {
                toast.success('Invitation resent')
                await refetchOrganizationInfo()
                return
            }
            toast.error(result?.message || 'Failed to resend invitation')
        } catch (error) {
            console.error('[UsersPage] Resend invite failed:', error)
            toast.error('Failed to resend invitation')
        } finally {
            setInviteActionId(null)
        }
    }

    const handleRevokeInvite = async (invitationId: string) => {
        setInviteActionId(invitationId)
        try {
            const result = await ClerkRevokeInvitation(invitationId)
            if (result?.success) {
                toast.success('Invitation revoked')
                await refetchOrganizationInfo()
                return
            }
            toast.error(result?.message || 'Failed to revoke invitation')
        } catch (error) {
            console.error('[UsersPage] Revoke invite failed:', error)
            toast.error('Failed to revoke invitation')
        } finally {
            setInviteActionId(null)
        }
    }

    const rowMenu = (member: any) => (
        <UserRowMenu
            member={member}
            canManage={canManage}
            busyActionId={userActionId}
            onEditRole={() => openEditRoleDialog(member)}
            onResetPassword={() => void handleResetPassword(member)}
            onActivate={() => void handleActivateUser(member)}
            onDeactivate={() => void handleDeactivateUser(member)}
        />
    )

    const usersEmpty = members.length === 0
        ? { title: 'No HQ users yet', hint: 'Invite an admin to add someone to the HQ team.' }
        : { title: 'No users match these filters', hint: 'Clear the search or filters to widen the results.' }

    const noInvites = filteredAdminInvites.length === 0 && filteredMemberInvites.length === 0

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
                            Invite Admin
                        </Button>
                    )
                }
            />

            {/* Headline figures for both tabs, so they sit above the rail. The
                old metas ("+2 from last month", "85% of total users") were
                hardcoded; the active share is now computed. */}
            <Panel>
                <div className="px-4 py-6 sm:px-6">
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
                            value={pendingInviteCount}
                            meta="Awaiting acceptance"
                            icon={<Mail />}
                        />
                    </StatRow>
                </div>
            </Panel>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
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
                            <div className="relative min-w-0 lg:w-72">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
                                <Input
                                    aria-label="Search users"
                                    placeholder="Search by name or email"
                                    value={searchTerm}
                                    onChange={(e) => {
                                        setSearchTerm(e.target.value)
                                        resetUserPage()
                                    }}
                                    className="h-9 pl-9 text-[0.8125rem]"
                                />
                            </div>
                            <div className="grid min-w-0 grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
                                <Select
                                    value={roleFilter}
                                    onValueChange={(value) => {
                                        setRoleFilter(value)
                                        resetUserPage()
                                    }}
                                >
                                    <SelectTrigger aria-label="Role" className={FILTER_TRIGGER}>
                                        <SelectValue placeholder="All roles" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All roles</SelectItem>
                                        {ROLES_BY_LEVEL.map((role) => (
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
                                        resetUserPage()
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
                            {/* §5.3: seven columns need ~800px, which fits the
                                content column from `xl`; cards below that. */}
                            <Table
                                variant="data"
                                bounded={false}
                                containerClassName="hidden xl:block"
                                className="min-w-[800px]"
                            >
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>User</TableHead>
                                        <TableHead>Role</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Merchants</TableHead>
                                        <TableHead>Joined</TableHead>
                                        {/* Was "Last Active", but the value is the
                                            profile's `updated_at`, not a sign-in time. */}
                                        <TableHead>Updated</TableHead>
                                        <TableHead className="w-12">
                                            <span className="sr-only">Actions</span>
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {userPage.pageRows.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={7} className="h-24 text-center">
                                                <p className="text-sm font-medium">{usersEmpty.title}</p>
                                                <p className="mt-1 text-xs text-muted-foreground">{usersEmpty.hint}</p>
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        userPage.pageRows.map((member: any) => {
                                            const href = `/manage/users/${member.users?.id}`
                                            const updatedAt = member?.users?.updated_at || member.created_at
                                            return (
                                                <TableRow
                                                    key={member.id}
                                                    className="cursor-pointer"
                                                    onClick={() => router.push(href)}
                                                >
                                                    <TableCell className="max-w-[280px]">
                                                        <div className="flex min-w-0 items-center gap-3">
                                                            <Avatar className="h-8 w-8 shrink-0">
                                                                <AvatarImage src={member?.users?.avatar_url || ''} alt="" />
                                                                <AvatarFallback>{initials(member)}</AvatarFallback>
                                                            </Avatar>
                                                            <div className="min-w-0">
                                                                {/* A real link, so the row is reachable by keyboard. */}
                                                                <Link
                                                                    href={href}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    className="block truncate font-medium hover:underline"
                                                                >
                                                                    {memberName(member)}
                                                                </Link>
                                                                <div className="truncate text-sm text-muted-foreground">{member?.users?.email}</div>
                                                            </div>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline">{roleName(member?.role)}</Badge>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline">{memberStatus(member)}</Badge>
                                                    </TableCell>
                                                    <TableCell className="text-right tabular-nums">
                                                        {member?.assigned_merchant_count ?? 0}
                                                    </TableCell>
                                                    <TableCell
                                                        className="text-sm text-muted-foreground tabular-nums"
                                                        title={formatTimestamp(member.created_at)}
                                                    >
                                                        {formatDay(member.created_at)}
                                                    </TableCell>
                                                    <TableCell
                                                        className="text-sm text-muted-foreground tabular-nums"
                                                        title={formatTimestamp(updatedAt)}
                                                    >
                                                        {formatDay(updatedAt)}
                                                    </TableCell>
                                                    <TableCell className="text-right">{rowMenu(member)}</TableCell>
                                                </TableRow>
                                            )
                                        })
                                    )}
                                </TableBody>
                            </Table>

                            {/* §5.3 mobile: record cards, never a scrolling table. */}
                            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:hidden">
                                {userPage.pageRows.length === 0 ? (
                                    <div className="col-span-full flex min-h-40 flex-col items-center justify-center gap-2 rounded-2xl bg-muted/30 px-4 text-center">
                                        <p className="text-sm font-medium">{usersEmpty.title}</p>
                                        <p className="text-xs text-muted-foreground">{usersEmpty.hint}</p>
                                    </div>
                                ) : (
                                    userPage.pageRows.map((member: any) => {
                                        const href = `/manage/users/${member.users?.id}`
                                        const updatedAt = member?.users?.updated_at || member.created_at
                                        return (
                                            <div
                                                key={member.id}
                                                className="relative min-w-0 rounded-2xl border-0 bg-muted/45 p-4 transition-colors hover:bg-muted"
                                            >
                                                {/* Stretched link: the whole card opens the
                                                    user; the menu sits above it. */}
                                                <Link
                                                    href={href}
                                                    aria-label={`View ${memberName(member)}`}
                                                    className="absolute inset-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                />
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="flex min-w-0 items-center gap-3">
                                                        {/* Avatars drop below `sm` (§13.4). */}
                                                        <Avatar className="hidden h-8 w-8 shrink-0 sm:flex">
                                                            <AvatarImage src={member?.users?.avatar_url || ''} alt="" />
                                                            <AvatarFallback>{initials(member)}</AvatarFallback>
                                                        </Avatar>
                                                        <div className="min-w-0">
                                                            <p className="truncate font-semibold">{memberName(member)}</p>
                                                            <p className="truncate text-xs text-muted-foreground">{member?.users?.email}</p>
                                                        </div>
                                                    </div>
                                                    <div className="relative z-10 shrink-0">{rowMenu(member)}</div>
                                                </div>

                                                {/* Values are plain text on the tinted card (§3.5). */}
                                                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                                    <CardField label="Role" value={roleName(member?.role)} />
                                                    <CardField label="Status" value={memberStatus(member)} />
                                                    <CardField label="Merchants" value={member?.assigned_merchant_count ?? 0} />
                                                    <CardField label="Joined" value={formatDay(member.created_at)} />
                                                    <CardField label="Updated" value={formatDay(updatedAt)} />
                                                </div>
                                            </div>
                                        )
                                    })
                                )}
                            </div>

                            <PaginationBar
                                pagination={userPage.pagination}
                                onPageChange={userPage.setPage}
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
                        <div className="relative min-w-0 sm:w-72">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
                            <Input
                                aria-label="Search invites"
                                placeholder="Search by name, email or role"
                                value={inviteSearch}
                                onChange={(e) => {
                                    setInviteSearch(e.target.value)
                                    adminInvitePage.setPage(1)
                                    memberInvitePage.setPage(1)
                                }}
                                className="h-9 pl-9 text-[0.8125rem]"
                            />
                        </div>

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
                                            : 'Invitations you send to new admins will appear here.'}
                                    </p>
                                </div>
                            )}

                            {filteredAdminInvites.length > 0 && (
                                <section>
                                    <h3 className="mb-3 text-sm text-muted-foreground">Admin invites</h3>
                                    <div className="space-y-2">
                                        {adminInvitePage.pageRows.map((inv: any) => {
                                            const isPending = inv.status === 'pending'
                                            const canAct = canManage && !!inv.clerk_invite_id && isPending && inviteActionId !== inv.clerk_invite_id
                                            return (
                                                <div
                                                    key={inv.id}
                                                    className="flex min-w-0 items-start justify-between gap-3 rounded-2xl bg-muted/45 p-4"
                                                >
                                                    <div className="flex min-w-0 items-center gap-3">
                                                        {/* The initial disc is decorative; it gives
                                                            up its column on a phone (§13.4). */}
                                                        <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium sm:flex">
                                                            {(inv.email?.[0] || 'A').toUpperCase()}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="truncate font-medium">{inviteDisplayName(inv)}</p>
                                                            <p className="truncate text-sm text-muted-foreground">{inv.email}</p>
                                                            {/* Status is a word, not a pill: the card is
                                                                already tinted (§3.5). */}
                                                            <p className="mt-1 text-xs text-muted-foreground">
                                                                <span className="font-medium text-foreground">{inviteStatusLabel(inv.status)}</span>
                                                                <span className="sm:hidden"> · {roleName(inv.role)}</span>
                                                                {' · '}Invited by {inv.invited_by_user?.first_name || inv.invited_by || 'Unknown'}
                                                                {' · '}
                                                                <span className="tabular-nums" title={formatTimestamp(inv.created_at)}>
                                                                    {formatDay(inv.created_at)}
                                                                </span>
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="flex shrink-0 items-center gap-4">
                                                        <span className="hidden text-sm text-muted-foreground sm:block">{roleName(inv.role)}</span>
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button
                                                                    variant="ghost"
                                                                    aria-label={`Actions for the invite to ${inv.email}`}
                                                                    className="h-8 w-8 rounded-full p-0"
                                                                >
                                                                    <MoreHorizontal className="h-4 w-4" />
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end">
                                                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                                <DropdownMenuItem>Copy invite link</DropdownMenuItem>
                                                                {canManage && (
                                                                    <>
                                                                        <DropdownMenuItem
                                                                            disabled={!canAct}
                                                                            onClick={() => void handleResendInvite(inv.clerk_invite_id)}
                                                                        >
                                                                            Resend
                                                                        </DropdownMenuItem>
                                                                        <DropdownMenuSeparator />
                                                                        <DropdownMenuItem
                                                                            variant="destructive"
                                                                            disabled={!canAct}
                                                                            onClick={() => void handleRevokeInvite(inv.clerk_invite_id)}
                                                                        >
                                                                            Revoke
                                                                        </DropdownMenuItem>
                                                                    </>
                                                                )}
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                    <PaginationBar
                                        pagination={adminInvitePage.pagination}
                                        onPageChange={adminInvitePage.setPage}
                                        itemLabel="admin invites"
                                    />
                                </section>
                            )}

                            {filteredMemberInvites.length > 0 && (
                                <section>
                                    <h3 className="mb-3 text-sm text-muted-foreground">Member invites</h3>
                                    <div className="space-y-2">
                                        {memberInvitePage.pageRows.map((inv: any) => (
                                            <div
                                                key={inv.id}
                                                className="flex min-w-0 items-start justify-between gap-3 rounded-2xl bg-muted/45 p-4"
                                            >
                                                <div className="flex min-w-0 items-center gap-3">
                                                    <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium sm:flex">
                                                        {(inv.email?.[0] || 'M').toUpperCase()}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="font-medium">Pending invitation</p>
                                                        <p className="truncate text-sm text-muted-foreground">{inv.email}</p>
                                                        <p className="mt-1 text-xs text-muted-foreground sm:hidden">Member</p>
                                                    </div>
                                                </div>
                                                <div className="flex shrink-0 items-center gap-4">
                                                    <span className="hidden text-sm text-muted-foreground sm:block">Member</span>
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button
                                                                variant="ghost"
                                                                aria-label={`Actions for the invite to ${inv.email}`}
                                                                className="h-8 w-8 rounded-full p-0"
                                                            >
                                                                <MoreHorizontal className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                            <DropdownMenuItem>Copy invite link</DropdownMenuItem>
                                                            <DropdownMenuItem>Resend</DropdownMenuItem>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem variant="destructive">Revoke</DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </div>
                                            </div>
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

            {/* Admin Invite Wizard */}
            <AdminInviteWizard
                organizationId={DEXA_HQ_ORG_ID}
                orgType="hq"
                open={isAdminInviteOpen}
                onOpenChange={setIsAdminInviteOpen}
                onSuccess={() => {
                    refetchOrganizationInfo()
                    refetchUsers()
                }}
            />

            {/* A list the user works through, so it goes full screen below `sm`
                (the dialog default). The dialog clips; only the list scrolls. */}
            <Dialog open={isEditRoleDialogOpen} onOpenChange={setIsEditRoleDialogOpen}>
                <DialogContent className="flex flex-col gap-0 overflow-hidden p-0 max-sm:overflow-hidden sm:max-h-[85vh] sm:max-w-lg">
                    <DialogHeader className="shrink-0 px-6 pb-4 pr-14 pt-6 text-left">
                        <DialogTitle>Edit user role</DialogTitle>
                        <DialogDescription className="truncate">
                            {selectedMemberForRoleEdit?.users?.email || 'selected user'}
                        </DialogDescription>
                    </DialogHeader>

                    <div
                        role="radiogroup"
                        aria-label="HQ role"
                        className="thin-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto px-6 pb-2"
                    >
                        {ROLES_BY_LEVEL
                            .filter((role) => role.level <= role_level)
                            .map((role) => {
                                const isSelected = selectedRoleCode === role.code
                                const isCurrent = selectedMemberForRoleEdit?.role === role.code
                                const isSaving = userActionId === `role:${selectedMemberForRoleEdit?.users?.id}`

                                return (
                                    <button
                                        key={role.code}
                                        type="button"
                                        role="radio"
                                        aria-checked={isSelected}
                                        disabled={isSaving}
                                        onClick={() => setSelectedRoleCode(role.code)}
                                        className={cn(
                                            'w-full rounded-2xl px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
                                            // Selected is a ring on a deeper fill, never a hue (§3.5, §5.3).
                                            isSelected ? 'bg-muted ring-1 ring-border' : 'bg-muted/45 hover:bg-muted'
                                        )}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-x-2">
                                                    <span className="text-sm font-semibold">{role.name}</span>
                                                    {isCurrent && (
                                                        <span className="text-xs text-muted-foreground">Current</span>
                                                    )}
                                                </div>
                                                <p className="mt-1 text-xs leading-snug text-muted-foreground">
                                                    {role.description}
                                                </p>
                                                <p className="mt-1.5 font-mono text-[0.6875rem] text-muted-foreground">
                                                    {role.code} · level {role.level}
                                                </p>
                                            </div>
                                            <span
                                                aria-hidden
                                                className={cn(
                                                    'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                                                    isSelected
                                                        ? 'border-foreground bg-foreground text-background'
                                                        : 'border-muted-foreground/40'
                                                )}
                                            >
                                                {isSelected && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                                            </span>
                                        </div>
                                    </button>
                                )
                            })}
                    </div>

                    <DialogFooter className="shrink-0 gap-2 px-6 pb-6 pt-4 sm:justify-between">
                        <Button variant="outline" onClick={() => setIsEditRoleDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={() => void handleSaveRole()}
                            disabled={
                                !selectedMemberForRoleEdit ||
                                !selectedRoleCode ||
                                selectedRoleCode === selectedMemberForRoleEdit?.role ||
                                userActionId === `role:${selectedMemberForRoleEdit?.users?.id}`
                            }
                        >
                            {userActionId === `role:${selectedMemberForRoleEdit?.users?.id}` ? 'Saving...' : 'Save role'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog
                open={isResetPasswordDialogOpen}
                onOpenChange={(open) => {
                    setIsResetPasswordDialogOpen(open)
                    if (!open) {
                        setResetPasswordResult(null)
                    }
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Temporary Password Generated</DialogTitle>
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
                        <Button onClick={() => setIsResetPasswordDialogOpen(false)}>
                            Done
                        </Button>
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
    canManage,
    busyActionId,
    onEditRole,
    onResetPassword,
    onActivate,
    onDeactivate,
}: {
    member: any
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
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuItem asChild>
                    <Link href={`/manage/users/${id}`}>
                        <Eye className="mr-2 h-4 w-4" />
                        View details
                    </Link>
                </DropdownMenuItem>
                {canManage && (
                    <>
                        <DropdownMenuItem onClick={onEditRole} disabled={busyActionId === `role:${id}`}>
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
                                {busyActionId === `activate:${id}` ? 'Activating...' : 'Activate'}
                            </DropdownMenuItem>
                        ) : (
                            <DropdownMenuItem
                                variant="destructive"
                                onClick={onDeactivate}
                                disabled={busyActionId === `deactivate:${id}`}
                            >
                                <UserX className="mr-2 h-4 w-4" />
                                {busyActionId === `deactivate:${id}` ? 'Deactivating...' : 'Deactivate'}
                            </DropdownMenuItem>
                        )}
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
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
