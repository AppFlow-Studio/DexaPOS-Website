'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
    DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
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
    KeyRound,
    Copy,
} from 'lucide-react'
import { useOrganizationUsers } from '../hooks/useOrganizationUsers'
import { useAuth, useUser } from '@clerk/nextjs'
// import { SendOrganizationMembersInviteButton } from '../organizations/[organizationId]/components/SendOrganizationMembersInviteButton'
import { useOrganizationInfo } from '../hooks/useOrganizationInfo'
import { useRouter } from 'next/navigation'
import { AdminInviteWizard } from '../organizations/[organizationId]/components/AdminInviteWizard'
import { useAdminPermissions } from '@/lib/hooks/useAdminPermissions'
import { ClerkResendInvitationAdmin } from '../organizations/actions/clerk-resend-invitation-admin'
import { ClerkRevokeInvitation } from '../organizations/actions/clerk-revoke-invitation'
import { toast } from 'sonner'
import {
    changeAdminUserRole,
    deactivateAdminUser,
    resetAdminUserPassword,
} from '../actions/admin-user-management'
import { HQ_ROLES, type HQRoleCode } from '@/types/admin'

// HQ Organization ID for direct admin invites
const DEXA_HQ_ORG_ID = process.env.NEXT_PUBLIC_DEXA_POS_INTERNAL_TEAM_ID || 'org_33z36QibAMZy6kc2xZNYmDl5duh'


const roleColors = {
    Admin: 'destructive',
    Manager: 'default',
    User: 'secondary',
    Support: 'outline',
}

const statusColors = {
    Active: 'default',
    Inactive: 'secondary',
    Pending: 'outline',
}

const inviteStatusVariants: Record<string, "default" | "destructive" | "outline" | "secondary"> = {
    pending: 'outline',
    accepted: 'default',
    revoked: 'secondary',
    direct_created: 'default',
}

export default function UsersPage() {
    const router = useRouter()
    const { userId, orgId } = useAuth()
    const { hasPermission, role_level, isLoading: permissionsLoading } = useAdminPermissions()
    const canManageUsers = hasPermission('users.manage')
    const [searchTerm, setSearchTerm] = useState('')
    const [roleFilter, setRoleFilter] = useState('all')
    const [statusFilter, setStatusFilter] = useState('all')
    const [isAddUserOpen, setIsAddUserOpen] = useState(false)
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
    const adminInvites = organizationInfo?.pending_org_admin_invites || []

    useEffect(() => {
        if (permissionsLoading) return
        if (!canManageUsers) {
            router.replace('/manage?denied=1&required=users.manage')
        }
    }, [canManageUsers, permissionsLoading, router])

    if (permissionsLoading) return <div>Loading...</div>
    if (!canManageUsers) return <div>Redirecting...</div>

    if (isLoading) return <div>Loading...</div>
    if (error) return <div>Error: {error.message}</div>
    if (!users) return <div>No users found</div>
    if (users instanceof Error) return <div>Error: {users.message}</div>
    const filteredUsers = users?.members?.filter((user: any) => {
        const matchesSearch =
            user.users.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.users.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.users.email.toLowerCase().includes(searchTerm.toLowerCase())

        const matchesRole = roleFilter === 'all' || user.role === roleFilter
        const matchesStatus = statusFilter === 'all' || user.users.public_metadata.status === statusFilter

        return matchesSearch && matchesRole && matchesStatus
    })

    const formatDate = (dateString: string | null) => {
        if (!dateString) return 'Never'
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        })
    }

    const getInitials = (first_name: string, last_name: string) => {
        return `${first_name.charAt(0)}${last_name.charAt(0)}`.toUpperCase()
    }

    const getInviteDisplayName = (invite: any) => {
        const fullName = `${invite.first_name || ''} ${invite.last_name || ''}`.trim()
        if (fullName) return fullName
        return invite.email?.split('@')?.[0] || 'Pending admin'
    }

    const getInviteStatusLabel = (status?: string | null) => {
        if (!status) return 'Unknown'
        return status
            .split('_')
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ')
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

        const userName = `${member?.users?.first_name || ''} ${member?.users?.last_name || ''}`.trim() || member?.users?.email || 'this user'
        const confirmed = window.confirm(`Deactivate ${userName}? They will no longer be able to sign in.`)
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
                userName: `${member?.users?.first_name || ''} ${member?.users?.last_name || ''}`.trim() || member?.users?.email || userIdToReset,
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

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Users</h1>
                    <p className="text-muted-foreground">
                        Manage user accounts, roles, and permissions across your organization.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button 
                        variant="outline"
                        onClick={() => setIsAdminInviteOpen(true)}
                    >
                        <UserPlus className="h-4 w-4 mr-2" />
                        Invite Admin
                    </Button>
                </div>
                <Dialog open={isAddUserOpen} onOpenChange={setIsAddUserOpen}>
                    <DialogTrigger asChild>
                        <Button className="hidden">Add User</Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-106.25">
                        <DialogHeader>
                            <DialogTitle>Add New User</DialogTitle>
                            <DialogDescription>
                                Create a new user account and assign them to an organization.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="first_name">First Name</Label>
                                    <Input id="first_name" placeholder="John" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="last_name">Last Name</Label>
                                    <Input id="last_name" placeholder="Doe" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="email">Email</Label>
                                <Input id="email" type="email" placeholder="john.doe@example.com" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="role">Role</Label>
                                <Select>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select a role" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="admin">Admin</SelectItem>
                                        <SelectItem value="manager">Manager</SelectItem>
                                        <SelectItem value="user">User</SelectItem>
                                        <SelectItem value="support">Support</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="organization">Organization</Label>
                                <Select>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select organization" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="dexapos">DexaPOS HQ</SelectItem>
                                        <SelectItem value="retail">Retail Solutions Inc</SelectItem>
                                        <SelectItem value="techcorp">TechCorp</SelectItem>
                                        <SelectItem value="customer">Customer Care Ltd</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsAddUserOpen(false)}>
                                Cancel
                            </Button>
                            <Button onClick={() => setIsAddUserOpen(false)}>
                                Add User
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="users">Users</TabsTrigger>
                    <TabsTrigger value="invites">Invites</TabsTrigger>
                </TabsList>

                <TabsContent value="users" className="space-y-4">
                    {/* Stats Cards */}
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                                <UserCheck className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{users?.members?.length}</div>
                                <p className="text-xs text-muted-foreground">
                                    +2 from last month
                                </p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Active Users</CardTitle>
                                <UserCheck className="h-4 w-4 text-green-600" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {users?.members?.filter((u: any) => u.users?.public_metadata?.status === 'Active').length}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    85% of total users
                                </p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Pending Invites</CardTitle>
                                <Mail className="h-4 w-4 text-yellow-600" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {users?.pending_org_admin_invites?.filter((inv: any) => inv.status === 'pending').length}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Awaiting activation
                                </p>
                            </CardContent>
                        </Card>
                        {/* <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Admins</CardTitle>
                        <Shield className="h-4 w-4 text-red-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {users?.filter(u => u?.users?.public_metadata?.role === 'Admin').length}
                        </div> 
                        <p className="text-xs text-muted-foreground">
                            System administrators
                        </p>
                    </CardContent>
                </Card> */}
                    </div>

                    {/* Filters and Search */}
                    <Card>
                        <CardHeader>
                            <CardTitle>User Management</CardTitle>
                            <CardDescription>
                                Search and filter users by name, email, role, or status.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-col gap-4 md:flex-row md:items-center">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        placeholder="Search users..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="pl-9"
                                    />
                                </div>
                                <div className="flex gap-2">
                                    <Select value={roleFilter} onValueChange={setRoleFilter}>
                                        <SelectTrigger className="w-35">
                                            <SelectValue placeholder="Role" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Roles</SelectItem>
                                            <SelectItem value="Admin">Admin</SelectItem>
                                            <SelectItem value="Manager">Manager</SelectItem>
                                            <SelectItem value="User">User</SelectItem>
                                            <SelectItem value="Support">Support</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                                        <SelectTrigger className="w-35">
                                            <SelectValue placeholder="Status" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Status</SelectItem>
                                            <SelectItem value="Active">Active</SelectItem>
                                            <SelectItem value="Inactive">Inactive</SelectItem>
                                            <SelectItem value="Pending">Pending</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Users Table */}
                    <Card>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>User</TableHead>
                                        <TableHead>Role</TableHead>
                                        <TableHead>Assigned Merchants</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Last Active</TableHead>
                                        <TableHead>Join Date</TableHead>
                                        <TableHead className="w-12.5"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredUsers?.map((user ) => (
                                        <TableRow key={user.id} className="cursor-pointer" onClick={() => router.push(`/manage/users/${user.users.id}`)}>
                                            <TableCell>
                                                <div className="flex items-center space-x-3">
                                                    <Avatar className="h-8 w-8">
                                                        <AvatarImage src={user?.users?.avatar_url || ''} alt={`${user?.users?.first_name} ${user?.users?.last_name}`} />
                                                        <AvatarFallback>{getInitials(user?.users?.first_name, user?.users?.last_name)}</AvatarFallback>
                                                    </Avatar>
                                                    <div>
                                                        <div className="font-medium">{user?.users?.first_name} {user?.users?.last_name}</div>
                                                        <div className="text-sm text-muted-foreground">{user?.users?.email}</div>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={(roleColors[user?.users?.public_metadata?.role as keyof typeof roleColors] || 'secondary') as "default" | "destructive" | "outline" | "secondary"}>
                                                    {user?.role}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-sm">
                                                {user?.assigned_merchant_count || 0}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={(statusColors[(user?.users?.public_metadata?.status || 'Active') as keyof typeof statusColors] || 'secondary') as "default" | "destructive" | "outline" | "secondary"}>
                                                    {user?.users?.public_metadata?.status || 'Active'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-sm">{formatDate(user?.users?.updated_at || user.created_at)}</TableCell>
                                            <TableCell className="text-sm">{formatDate(user.created_at)}</TableCell>
                                            <TableCell>
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                onClick={(event) => event.stopPropagation()}
                                                            >
                                                                <MoreHorizontal className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                            <DropdownMenuItem
                                                                onClick={(event) => {
                                                                    event.stopPropagation()
                                                                    router.push(`/manage/users/${user.users.id}`)
                                                                }}
                                                            >
                                                                <Eye className="mr-2 h-4 w-4" />
                                                                View Details
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem
                                                                onClick={(event) => {
                                                                    event.stopPropagation()
                                                                    openEditRoleDialog(user)
                                                                }}
                                                                disabled={userActionId === `role:${user.users.id}`}
                                                            >
                                                                <Edit className="mr-2 h-4 w-4" />
                                                                Edit Role
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem
                                                                onClick={(event) => {
                                                                    event.stopPropagation()
                                                                    void handleResetPassword(user)
                                                                }}
                                                                disabled={userActionId === `reset:${user.users.id}`}
                                                            >
                                                                <KeyRound className="mr-2 h-4 w-4" />
                                                                Reset Password
                                                            </DropdownMenuItem>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem
                                                                className="text-yellow-600"
                                                                onClick={(event) => {
                                                                    event.stopPropagation()
                                                                    void handleDeactivateUser(user)
                                                                }}
                                                                disabled={
                                                                    userActionId === `deactivate:${user.users.id}` ||
                                                                    (user?.users?.public_metadata?.status || 'Active') === 'Inactive'
                                                                }
                                                            >
                                                        <UserX className="mr-2 h-4 w-4" />
                                                        Deactivate
                                                            </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent >

                <TabsContent value="invites" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle>Invites</CardTitle>
                                    <CardDescription>Manage admin and member invitations</CardDescription>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Input placeholder="Search invites..." className="w-72" />
                                    <Button 
                                        variant="outline"
                                        onClick={() => setIsAdminInviteOpen(true)}
                                    >
                                        <UserPlus className="h-4 w-4 mr-2" />
                                        Invite Admin
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {(!organizationInfo?.pending_org_admin_invites?.length && !organizationInfo?.pending_org_member_invites?.length) && (
                                <div className="flex flex-col items-center justify-center space-y-2 py-8 text-center">
                                    <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                                        <Mail className="h-6 w-6 text-muted-foreground" />
                                    </div>
                                    <div className="text-sm text-muted-foreground">No invites found.</div>
                                </div>
                            )}

                            {adminInvites.length > 0 && (
                                <div className="mb-6">
                                    <div className="text-sm font-medium mb-3">Admin Invites</div>
                                    <div className="divide-y rounded-md border">
                                        {adminInvites.map((inv: any) => (
                                            <div key={inv.id} className="flex items-center justify-between p-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
                                                        {(inv.email?.[0] || 'A').toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <div className="font-medium">
                                                            {getInviteDisplayName(inv)}
                                                        </div>
                                                        <div className="text-sm text-muted-foreground">{inv.email}</div>
                                                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                                            <span>Invited by {inv.invited_by_user?.first_name || inv.invited_by || 'Unknown'}</span>
                                                            <span>{formatDate(inv.created_at)}</span>
                                                            <Badge
                                                                variant={inviteStatusVariants[(inv.status || '').toLowerCase()] || 'secondary'}
                                                                className="text-[10px] uppercase tracking-wide"
                                                            >
                                                                {getInviteStatusLabel(inv.status)}
                                                            </Badge>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <div className="text-muted-foreground">{inv.role}</div>
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" className="h-8 w-8 p-0">
                                                                <MoreHorizontal className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                            <DropdownMenuItem>Copy invite link</DropdownMenuItem>
                                                            <DropdownMenuItem
                                                                disabled={
                                                                    !inv.clerk_invite_id ||
                                                                    inviteActionId === inv.clerk_invite_id ||
                                                                    inv.status !== 'pending'
                                                                }
                                                                onClick={() => void handleResendInvite(inv.clerk_invite_id)}
                                                            >
                                                                Resend
                                                            </DropdownMenuItem>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem
                                                                className="text-red-600"
                                                                disabled={
                                                                    !inv.clerk_invite_id ||
                                                                    inviteActionId === inv.clerk_invite_id ||
                                                                    inv.status !== 'pending'
                                                                }
                                                                onClick={() => void handleRevokeInvite(inv.clerk_invite_id)}
                                                            >
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

                            {organizationInfo?.pending_org_member_invites?.length > 0 && (
                                <div>
                                    <div className="text-sm font-medium mb-3">Member Invites</div>
                                    <div className="divide-y rounded-md border">
                                        {organizationInfo.pending_org_member_invites.map((inv: any) => (
                                            <div key={inv.id} className="flex items-center justify-between p-4">
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
                                                            <Button variant="ghost" className="h-8 w-8 p-0">
                                                                <MoreHorizontal className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                            <DropdownMenuItem>Copy invite link</DropdownMenuItem>
                                                            <DropdownMenuItem>Resend</DropdownMenuItem>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem className="text-red-600">Revoke</DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
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

            <Dialog open={isEditRoleDialogOpen} onOpenChange={setIsEditRoleDialogOpen}>
                <DialogContent onClick={(event) => event.stopPropagation()}>
                    <DialogHeader>
                        <DialogTitle>Edit User Role</DialogTitle>
                        <DialogDescription>
                            Update the HQ role for{' '}
                            <span className="font-medium">
                                {selectedMemberForRoleEdit?.users?.email || 'selected user'}
                            </span>
                            .
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 py-2">
                        <Label htmlFor="role-code">Role</Label>
                        <Select value={selectedRoleCode} onValueChange={(value) => setSelectedRoleCode(value as HQRoleCode)}>
                            <SelectTrigger id="role-code">
                                <SelectValue placeholder="Select role" />
                            </SelectTrigger>
                            <SelectContent>
                                {Object.values(HQ_ROLES)
                                    .filter((role) => role.level <= role_level)
                                    .sort((a, b) => b.level - a.level)
                                    .map((role) => (
                                        <SelectItem key={role.code} value={role.code}>
                                            {role.name} ({role.code})
                                        </SelectItem>
                                    ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsEditRoleDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={() => void handleSaveRole()}
                            disabled={!selectedMemberForRoleEdit || userActionId === `role:${selectedMemberForRoleEdit?.users?.id}`}
                        >
                            {userActionId === `role:${selectedMemberForRoleEdit?.users?.id}` ? 'Saving...' : 'Save Role'}
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
                <DialogContent onClick={(event) => event.stopPropagation()}>
                    <DialogHeader>
                        <DialogTitle>Temporary Password Generated</DialogTitle>
                        <DialogDescription>
                            Share this with{' '}
                            <span className="font-medium">{resetPasswordResult?.userName || 'the user'}</span>{' '}
                            securely. It is shown only once.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="rounded-md border bg-muted/40 p-3">
                        <div className="text-xs text-muted-foreground mb-1">{resetPasswordResult?.userEmail}</div>
                        <div className="font-mono text-sm break-all">{resetPasswordResult?.tempPassword}</div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => void handleCopyTempPassword()}>
                            <Copy className="h-4 w-4 mr-2" />
                            Copy
                        </Button>
                        <Button onClick={() => setIsResetPasswordDialogOpen(false)}>
                            Done
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}

