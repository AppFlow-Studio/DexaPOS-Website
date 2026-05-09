'use client'

import { useParams, useRouter } from 'next/navigation'
import { useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { RemoveUser } from '../../actions/remove-user'
import { toast } from 'sonner'
import { useGetInfoOfUser } from '../../hooks/useGetInfoOfUser'
import { useAdminAuth } from '@/lib/hooks/useAdminAuth'
import { useAdminMerchantAccess, useGrantMerchantAccess, useRevokeMerchantAccess } from '../../hooks/useAdminMerchantAccess'
import { useMerchants } from '@/lib/queries/use-merchants'
import { HQ_ROLES, HQRoleCode } from '@/types/admin'
import { DEFAULT_MERCHANT_FILTERS } from '@/types/merchant'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import {
    User,
    Mail,
    Shield,
    MoreHorizontal,
    Edit,
    Trash2,
    CheckCircle,
    AlertTriangle,
    Building2,
    Calendar,
    ExternalLink,
    Store,
    Plus,
    X,
    Lock,
} from 'lucide-react'
import Link from 'next/link'
import { EditUserDetailsDialog } from './components/edit-user-details-dialog'
import { EditMembershipDialog } from './components/edit-membership-dialog'
import { GrantMerchantAccessDialog } from './components/grant-merchant-access-dialog'
import { PageLoader } from '@/components/ui/page-loader'

export default function UserInfoPage() {
    const { userId: targetUserId } = useParams()
    const { userId: currentUserId } = useAuth()
    const router = useRouter()
    const { role: currentUserRole, isSuperAdmin } = useAdminAuth()
    const [isDeletingUser, setIsDeletingUser] = useState(false)
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
    const { data: user, isLoading, error } = useGetInfoOfUser(targetUserId as string)
    
    // Merchant access management state
    const [isGrantDialogOpen, setIsGrantDialogOpen] = useState(false)

    // Edit dialog state
    const [isEditDetailsOpen, setIsEditDetailsOpen] = useState(false)
    const [editingMembership, setEditingMembership] = useState<{
        organizationId: string
        organizationName: string
        role: string | null
    } | null>(null)
    
    // Fetch target user's merchant access
    const { data: targetUserMerchantAccess, isLoading: accessLoading } = useAdminMerchantAccess(targetUserId as string)
    
    // Fetch all merchants for the grant dropdown (only super admins need this)
    const { data: allMerchantsData } = useMerchants(DEFAULT_MERCHANT_FILTERS, 1, undefined)
    
    // Mutations for granting/revoking access
    const grantAccessMutation = useGrantMerchantAccess()
    const revokeAccessMutation = useRevokeMerchantAccess()

    if (isLoading) return <PageLoader />

    if (error) {
        return (
            <div className="flex h-screen items-center justify-center">
                <div className="text-center">
                    <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                    <p className="text-red-600">Error: {error.message}</p>
                </div>
            </div>
        )
    }

    if (!user) {
        return (
            <div className="flex h-screen items-center justify-center">
                <div className="text-center">
                    <User className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">No user found</p>
                </div>
            </div>
        )
    }

    // Get target user's HQ role from their membership
    const targetUserHQMembership = user.members?.find((m: any) =>
        m.role && (m.role.startsWith('hq.') || Object.keys(HQ_ROLES).includes(m.role))
    )
    const targetUserRoleCode = targetUserHQMembership?.role as HQRoleCode | undefined
    const targetUserRoleLevel = targetUserRoleCode ? (HQ_ROLES[targetUserRoleCode]?.level || 0) : 0
    const currentUserRoleLevel = currentUserRole?.level || 0
    
    // Only super admins can assign merchants. They also cannot assign merchants
    // to themselves — that prevents a super admin from silently scoping their
    // own access via this UI.
    const isSelf = !!currentUserId && currentUserId === targetUserId
    const canEditMerchantAccess = isSuperAdmin && !isSelf
    const isTargetSuperAdmin = targetUserRoleCode === 'hq.super_admin'
    // Suppress unused warnings for legacy variables left in place for context.
    void currentUserRoleLevel; void targetUserRoleLevel
    
    // Filter out merchants the target user already has access to
    const availableMerchantsToGrant = allMerchantsData?.merchants?.filter(
        (merchant) => !targetUserMerchantAccess?.some((access) => access.merchantId === merchant.id)
    ) || []

    const handleGrantAccess = async (merchantId: string) => {
        if (!merchantId) return

        try {
            await grantAccessMutation.mutateAsync({
                adminUserId: targetUserId as string,
                merchantId,
                grantedBy: currentUserId || undefined,
            })
            setIsGrantDialogOpen(false)
        } catch (error) {
            console.error('Error granting merchant access:', error)
        }
    }

    const handleDeleteUser = async () => {
        setIsDeletingUser(true)
        try {
            const result = await RemoveUser(targetUserId as string)
            if (result && 'success' in result && result.success) {
                toast.success('User deleted successfully')
                setDeleteDialogOpen(false)
                router.push('/manage/users')
            } else {
                toast.error('Failed to delete user')
            }
        } catch {
            toast.error('An error occurred while deleting the user')
        } finally {
            setIsDeletingUser(false)
        }
    }

    const handleRevokeAccess = async (merchantId: string) => {
        try {
            await revokeAccessMutation.mutateAsync({
                adminUserId: targetUserId as string,
                merchantId,
            })
        } catch (error) {
            console.error('Error revoking merchant access:', error)
        }
    }

    const getInitials = (firstName: string, lastName: string) => {
        return `${firstName?.charAt(0) || ''}${lastName?.charAt(0) || ''}`.toUpperCase()
    }

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        })
    }

    const getStatusColor = (status: string) => {
        switch (status?.toLowerCase()) {
            case 'active':
                return 'text-green-600'
            case 'inactive':
                return 'text-red-600'
            case 'pending':
                return 'text-yellow-600'
            default:
                return 'text-gray-600'
        }
    }

    const getStatusDot = (status: string) => {
        switch (status?.toLowerCase()) {
            case 'active':
                return 'bg-green-500'
            case 'inactive':
                return 'bg-red-500'
            case 'pending':
                return 'bg-yellow-500'
            default:
                return 'bg-gray-500'
        }
    }

    return (
        <div className="space-y-6">
            {/* Breadcrumb */}
            <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                <Link href="/manage/users" className="hover:text-foreground">
                    Users
                </Link>
                <span>/</span>
                <span>User profile</span>
            </div>

            {/* User Profile Header */}
            <div className="flex items-start space-x-6">
                <Avatar className="h-20 w-20">
                    <AvatarImage src={user.avatar_url || ''} alt={`${user.first_name} ${user.last_name}`} />
                    <AvatarFallback className="text-2xl bg-orange-500 text-white">
                        {getInitials(user.first_name, user.last_name)}
                    </AvatarFallback>
                </Avatar>

                <div className="flex-1">
                    <div className="flex items-start justify-between">
                        <div>
                            <h1 className="text-3xl font-bold">{user.first_name} {user.last_name}</h1>
                            <div className="flex items-center space-x-3 mt-2">
                                <Badge variant="outline" className="text-xs">
                                    {targetUserId}
                                </Badge>
                                <span className="text-muted-foreground">{user.email}</span>
                            </div>
                        </div>
                    </div>

                    {/* Tabs */}
                    <Tabs defaultValue="details" className="mt-6">
                        <TabsList>
                            <TabsTrigger value="details">Details</TabsTrigger>
                            <TabsTrigger value="merchant-access">Merchant Access</TabsTrigger>
                            <TabsTrigger value="sessions">Sessions</TabsTrigger>
                            <TabsTrigger value="events">Events</TabsTrigger>
                        </TabsList>

                        <TabsContent value="details" className="mt-6">
                            {/* User Details Card */}
                            <Card>
                                <CardContent className="pt-6">
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm font-medium text-muted-foreground">Full name</span>
                                            <span className="text-sm">{user.first_name} {user.last_name}</span>
                                        </div>

                                        <div className="flex justify-between items-center">
                                            <span className="text-sm font-medium text-muted-foreground">Email address</span>
                                            <div className="flex items-center space-x-2">
                                                <span className="text-sm">{user.email}</span>
                                                <Badge variant="outline" className="text-xs bg-green-100 text-green-800 border-green-200">
                                                    Verified
                                                </Badge>
                                            </div>
                                        </div>

                                        <div className="flex justify-between items-center">
                                            <span className="text-sm font-medium text-muted-foreground">Status</span>
                                            <div className="flex items-center space-x-2">
                                                <div className={`w-2 h-2 rounded-full ${getStatusDot(user.public_metadata?.status || 'active')}`}></div>
                                                <span className={`text-sm capitalize ${getStatusColor(user.public_metadata?.status || 'active')}`}>
                                                    {user.public_metadata?.status || 'Active'}
                                                </span>
                                            </div>
                                        </div>

                                        {/* <div className="flex justify-between items-center">
                                            <span className="text-sm font-medium text-muted-foreground">Authentication</span>
                                            <div className="flex items-center space-x-2">
                                                <div className="w-4 h-4 bg-blue-500 rounded text-white text-xs flex items-center justify-center font-bold">G</div>
                                                <span className="text-sm">Google OAuth</span>
                                            </div>
                                        </div> */}

                                        <div className="flex justify-between items-center">
                                            <span className="text-sm font-medium text-muted-foreground">OAuth profile picture</span>
                                            <div className="flex items-center space-x-2">
                                                <span className="text-sm text-muted-foreground truncate max-w-xs">
                                                    {user.avatar_url || 'No profile picture'}
                                                </span>
                                                {user.avatar_url && (
                                                    <ExternalLink className="h-3 w-3 text-muted-foreground" />
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-6 pt-4 border-t">
                                        <Button
                                            variant="outline"
                                            onClick={() => setIsEditDetailsOpen(true)}
                                        >
                                            <Edit className="mr-2 h-4 w-4" />
                                            Edit user details
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Organization Memberships */}
                            <div className="mt-8">
                                <h2 className="text-lg font-semibold mb-4">Organization memberships</h2>
                                <div className="space-y-3">
                                    {user.members?.map((member: any) => (
                                        <Card key={member.id}>
                                            <CardContent className="pt-4">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center space-x-3">
                                                        <Avatar className="h-10 w-10">
                                                            <AvatarImage src={member.organizations?.imageURL || ''} alt={member.organizations?.name} />
                                                            <AvatarFallback className="bg-gray-500 text-white">
                                                                {member.organizations?.name?.substring(0, 2).toUpperCase()}
                                                            </AvatarFallback>
                                                        </Avatar>
                                                        <div>
                                                            <div className="font-medium">{member.organizations?.name}</div>
                                                            <div className="text-sm text-muted-foreground capitalize">
                                                                {member.role || 'Member'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center space-x-3">
                                                        <span className="text-sm text-muted-foreground">
                                                            Joined {formatDate(member.created_at)}
                                                        </span>
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                                                    <MoreHorizontal className="h-4 w-4" />
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end">
                                                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                                <DropdownMenuItem
                                                                    onSelect={(event) => {
                                                                        event.preventDefault()
                                                                        setEditingMembership({
                                                                            organizationId: member.organization_id,
                                                                            organizationName: member.organizations?.name || 'organization',
                                                                            role: member.role || null,
                                                                        })
                                                                    }}
                                                                >
                                                                    <Edit className="mr-2 h-4 w-4" />
                                                                    Edit membership
                                                                </DropdownMenuItem>
                                                                <DropdownMenuSeparator />
                                                                <DropdownMenuItem className="text-red-600">
                                                                    <Trash2 className="mr-2 h-4 w-4" />
                                                                    Remove from organization
                                                                </DropdownMenuItem>
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            </div>

                            {/* Danger Zone */}
                            <div className="mt-8">
                                <h2 className="text-lg font-semibold mb-4 text-red-600">Danger zone</h2>
                                <Card className="border-red-200">
                                    <CardContent className="pt-4">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h3 className="font-medium">Delete user account</h3>
                                                <p className="text-sm text-muted-foreground mt-1">
                                                    Deleting this user is permanent and cannot be undone.
                                                </p>
                                            </div>
                                            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                                                <DialogTrigger asChild>
                                                    <Button variant="destructive">
                                                        <Trash2 className="mr-2 h-4 w-4" />
                                                        Delete user
                                                    </Button>
                                                </DialogTrigger>
                                                <DialogContent>
                                                    <DialogHeader>
                                                        <DialogTitle>Delete user account</DialogTitle>
                                                        <DialogDescription>
                                                            Are you sure you want to delete <strong>{user.first_name} {user.last_name}</strong>? This action is permanent and cannot be undone.
                                                        </DialogDescription>
                                                    </DialogHeader>
                                                    <DialogFooter>
                                                        <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={isDeletingUser}>Cancel</Button>
                                                        <Button variant="destructive" onClick={handleDeleteUser} disabled={isDeletingUser}>
                                                            {isDeletingUser ? 'Deleting...' : 'Delete user'}
                                                        </Button>
                                                    </DialogFooter>
                                                </DialogContent>
                                            </Dialog>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        </TabsContent>

                        <TabsContent value="merchant-access" className="mt-6">
                            <Card>
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <CardTitle>Merchant Access</CardTitle>
                                            <CardDescription>
                                                Merchants this user can access and manage
                                                {!canEditMerchantAccess && !isTargetSuperAdmin && (
                                                    <span className="ml-2 text-yellow-600">(View only)</span>
                                                )}
                                            </CardDescription>
                                        </div>
                                        {canEditMerchantAccess && (
                                            <Button onClick={() => setIsGrantDialogOpen(true)}>
                                                <Plus className="mr-2 h-4 w-4" />
                                                Grant Access
                                            </Button>
                                        )}
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    {isTargetSuperAdmin ? (
                                        <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-blue-800">
                                            <Shield className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
                                            <div>
                                                <p className="font-medium text-sm">Super Admin — universal access</p>
                                                <p className="mt-1 text-sm text-blue-700">
                                                    Super Admins have access to all merchants on the platform. Individual grants are not required and are not tracked for this role.
                                                </p>
                                            </div>
                                        </div>
                                    ) : accessLoading ? (
                                        <div className="flex items-center justify-center py-8">
                                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                                        </div>
                                    ) : !targetUserMerchantAccess || targetUserMerchantAccess.length === 0 ? (
                                        <div className="text-center py-8 text-muted-foreground">
                                            <Store className="h-12 w-12 mx-auto mb-4" />
                                            <p>No merchant access assigned</p>
                                            {canEditMerchantAccess && (
                                                <p className="text-sm mt-2">
                                                    Click &quot;Grant Access&quot; to assign merchants to this user.
                                                </p>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {targetUserMerchantAccess.map((access) => (
                                                <div
                                                    key={access.id}
                                                    className="flex items-center justify-between p-4 rounded-lg border bg-muted/30"
                                                >
                                                    <div className="flex items-center space-x-3">
                                                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                                                            <Store className="h-5 w-5 text-primary" />
                                                        </div>
                                                        <div>
                                                            <div className="font-medium">{access.merchantName}</div>
                                                            <div className="text-sm text-muted-foreground">
                                                                Granted {access.grantedAt ? new Date(access.grantedAt).toLocaleDateString() : 'N/A'}
                                                                {access.grantedByName && ` by ${access.grantedByName}`}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center space-x-2">
                                                        <Badge variant="outline" className="bg-green-100 text-green-700">
                                                            Active
                                                        </Badge>
                                                        {canEditMerchantAccess ? (
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="text-red-600 hover:text-red-700 hover:bg-red-100"
                                                                onClick={() => handleRevokeAccess(access.merchantId)}
                                                                disabled={revokeAccessMutation.isPending}
                                                            >
                                                                <X className="h-4 w-4" />
                                                            </Button>
                                                        ) : (
                                                            <Lock className="h-4 w-4 text-muted-foreground" />
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {!canEditMerchantAccess && !isTargetSuperAdmin && targetUserMerchantAccess && targetUserMerchantAccess.length > 0 && (
                                        <div className="mt-4 p-3 rounded-lg bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm flex items-center gap-2">
                                            <Lock className="h-4 w-4" />
                                            <span>
                                                You can only view merchant access. Contact a user with a higher role level to make changes.
                                            </span>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="sessions" className="mt-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle>User Sessions</CardTitle>
                                    <CardDescription>Active and recent user sessions</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-center py-8 text-muted-foreground">
                                        <Shield className="h-12 w-12 mx-auto mb-4" />
                                        <p>No session data available</p>
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="events" className="mt-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle>User Events</CardTitle>
                                    <CardDescription>Recent user activity and events</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-center py-8 text-muted-foreground">
                                        <Calendar className="h-12 w-12 mx-auto mb-4" />
                                        <p>No event data available</p>
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </div>
            </div>

            <GrantMerchantAccessDialog
                open={isGrantDialogOpen}
                onOpenChange={setIsGrantDialogOpen}
                userName={`${user.first_name} ${user.last_name}`.trim()}
                availableMerchants={availableMerchantsToGrant}
                isPending={grantAccessMutation.isPending}
                onGrant={(merchantId) => void handleGrantAccess(merchantId)}
            />

            <EditUserDetailsDialog
                open={isEditDetailsOpen}
                onOpenChange={setIsEditDetailsOpen}
                userId={targetUserId as string}
                initialFirstName={user.first_name || ''}
                initialLastName={user.last_name || ''}
                email={user.email || ''}
            />

            {editingMembership && (
                <EditMembershipDialog
                    open={!!editingMembership}
                    onOpenChange={(open) => {
                        if (!open) setEditingMembership(null)
                    }}
                    userId={targetUserId as string}
                    organizationId={editingMembership.organizationId}
                    organizationName={editingMembership.organizationName}
                    currentRole={editingMembership.role}
                    actorRoleLevel={currentUserRoleLevel}
                    isSuperAdmin={isSuperAdmin}
                />
            )}
        </div>
    )
}