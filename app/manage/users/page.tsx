'use client'

import { useState } from 'react'
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
    Filter,
    MoreHorizontal,
    Plus,
    UserPlus,
    Mail,
    Phone,
    MapPin,
    Calendar,
    Shield,
    Edit,
    Trash2,
    Eye,
    UserCheck,
    UserX,
} from 'lucide-react'
import { useOrganizationUsers } from '../hooks/useOrganizationUsers'
import { useUser } from '@clerk/nextjs'
import { SendOrganizationMembersInviteButton } from '../organizations/[organizationId]/componenets/SendOrganizationMembersInviteButton'
import { useOrganizationInfo } from '../hooks/useOrganizationInfo'
import { useRouter } from 'next/navigation'


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

export default function UsersPage() {
    const router = useRouter()

    const [searchTerm, setSearchTerm] = useState('')
    const [roleFilter, setRoleFilter] = useState('all')
    const [statusFilter, setStatusFilter] = useState('all')
    const [isAddUserOpen, setIsAddUserOpen] = useState(false)
    const [activeTab, setActiveTab] = useState('users')
    const { user } = useUser()
    const { data: users, isLoading, error } = useOrganizationUsers(user?.publicMetadata.organizationId as string)
    const { data: organizationInfo, refetch: refetchOrganizationInfo } = useOrganizationInfo(user?.publicMetadata.organizationId as string)

    if (isLoading) return <div>Loading...</div>
    if (error) return <div>Error: {error.message}</div>
    if (!users) return <div>No users found</div>
    if (users instanceof Error) return <div>Error: {users.message}</div>

    const filteredUsers = users?.members?.filter((user: any) => {
        const matchesSearch =
            user.users.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.users.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.users.email.toLowerCase().includes(searchTerm.toLowerCase())

        const matchesRole = roleFilter === 'all' || user.users.public_metadata.role === roleFilter
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
                <Dialog open={isAddUserOpen} onOpenChange={setIsAddUserOpen}>
                    <DialogTrigger asChild>
                        <SendOrganizationMembersInviteButton organizationId={user?.publicMetadata.organizationId as string} refetch={() => refetchOrganizationInfo()} role_types='hq' />
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[425px]">
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
                    <TabsTrigger value="invites">Pending Invites</TabsTrigger>
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
                                        <SelectTrigger className="w-[140px]">
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
                                        <SelectTrigger className="w-[140px]">
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
                                        {/* <TableHead>Status</TableHead> */}
                                        <TableHead>Last Login</TableHead>
                                        <TableHead>Join Date</TableHead>
                                        <TableHead className="w-[50px]"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredUsers?.map((user) => (
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
                                                    {user?.users?.public_metadata?.role}
                                                </Badge>
                                            </TableCell>
                                            {/* <TableCell>
                                        <Badge variant={statusColors[user.public_metadata.status as keyof typeof statusColors]}>
                                            {user.public_metadata.status}
                                        </Badge>
                                    </TableCell> */}
                                            {/* <TableCell className="text-sm">{formatDate(user.lastLogin)}</TableCell> */}
                                            <TableCell className="text-sm">{formatDate(user.created_at)}</TableCell>
                                            <TableCell>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon">
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                        <DropdownMenuItem>
                                                            <Eye className="mr-2 h-4 w-4" />
                                                            View Details
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem>
                                                            <Edit className="mr-2 h-4 w-4" />
                                                            Edit User
                                                        </DropdownMenuItem>
                                                        {/* <DropdownMenuSeparator />
                                                {user.public_metadata.status === 'Active' ? (
                                                    <DropdownMenuItem className="text-yellow-600">
                                                        <UserX className="mr-2 h-4 w-4" />
                                                        Deactivate
                                                    </DropdownMenuItem>
                                                ) : (
                                                    <DropdownMenuItem className="text-green-600">
                                                        <UserCheck className="mr-2 h-4 w-4" />
                                                        Activate
                                                    </DropdownMenuItem>
                                                )}
                                                <DropdownMenuItem className="text-red-600">
                                                    <Trash2 className="mr-2 h-4 w-4" />
                                                    Delete User
                                                </DropdownMenuItem> */}
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
                                    <CardTitle>Pending Invites</CardTitle>
                                    <CardDescription>Manage pending role invitations</CardDescription>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Input placeholder="Search invites..." className="w-72" />
                                    <SendOrganizationMembersInviteButton organizationId={user?.publicMetadata.organizationId as string} />
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {(!organizationInfo?.pending_org_admin_invites?.length && !organizationInfo?.pending_org_member_invites?.length) && (
                                <div className="flex flex-col items-center justify-center space-y-2 py-8 text-center">
                                    <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                                        <Mail className="h-6 w-6 text-muted-foreground" />
                                    </div>
                                    <div className="text-sm text-muted-foreground">No pending invites.</div>
                                </div>
                            )}

                            {organizationInfo?.pending_org_admin_invites?.length > 0 && (
                                <div className="mb-6">
                                    <div className="text-sm font-medium mb-3">Admin Invites</div>
                                    <div className="divide-y rounded-md border">
                                        {organizationInfo.pending_org_admin_invites.map((inv: any) => (
                                            <div key={inv.id} className="flex items-center justify-between p-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
                                                        {(inv.email?.[0] || 'A').toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <div className={`font-medium ${inv.status === 'pending' ? 'text-yellow-500' :
                                                            inv.status === 'revoked' ? 'text-red-500' :
                                                                inv.status === 'accepted' ? 'text-green-500' :
                                                                    inv.status === 'expired' ? 'text-red-500' :
                                                                        inv.status === 'cancelled' ? 'text-red-500' :
                                                                            inv.status === 'failed' ? 'text-red-500' : 'text-red-500'
                                                            }`}>
                                                            {inv.status === 'pending' ? 'Pending Invitation' :
                                                                inv.status === 'revoked' ? 'Invitation Revoked' :
                                                                    inv.status === 'accepted' ? 'Invitation Accepted' :
                                                                        inv.status === 'expired' ? 'Invitation Expired' :
                                                                            inv.status === 'cancelled' ? 'Invitation Cancelled' :
                                                                                inv.status === 'failed' ? 'Invitation Failed' : 'Invitation Revoked'
                                                            }
                                                        </div>
                                                        <div className="text-sm text-muted-foreground">{inv.email}</div>
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
            </Tabs >
        </div >
    )
}
