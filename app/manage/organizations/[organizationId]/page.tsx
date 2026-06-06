'use client'

import Link from 'next/link'
import { useOrganizationInfo } from "../../hooks/useOrganizationInfo"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { MoreHorizontal, Shield, Settings, UserPlus2, Users, AlertTriangle, Trash2 } from 'lucide-react'
import { useParams } from 'next/navigation';
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
    const { data, isLoading, error, refetch: refetchOrganizationInfo } = useOrganizationInfo(organizationId as string)
    const [revokeAdminInvitePopup, setRevokeAdminInvitePopup] = useState<PendingOrgAdminInvitesModel | null>(null)
    const [openRevokeAdminInvitePopup, setOpenRevokeAdminInvitePopup] = useState(false)
    const [removeUserPopup, setRemoveUserPopup] = useState<UsersModel | null>(null)
    const [openRemoveUserPopup, setOpenRemoveUserPopup] = useState(false)
    const [resendAdminInvitePopup, setResendAdminInvitePopup] = useState<PendingOrgAdminInvitesModel | null>(null)
    const [openResendAdminInvitePopup, setOpenResendAdminInvitePopup] = useState(false)
    const [openDeleteOrganizationDialog, setOpenDeleteOrganizationDialog] = useState(false)
    console.log('organization info data', data)
    if (isLoading) return (
        <div className="space-y-6 animate-in fade-in-0 duration-300">
            <div className="h-5 w-56 bg-muted rounded-md animate-pulse" />
            <div className="border rounded-xl p-6">
                <div className="flex items-center gap-4 mb-6">
                    <div className="h-12 w-12 rounded-full bg-muted animate-pulse" />
                    <div className="space-y-2">
                        <div className="h-6 w-40 bg-muted rounded-md animate-pulse" />
                        <div className="h-4 w-64 bg-muted rounded-md animate-pulse" />
                    </div>
                </div>
                <div className="h-10 w-full bg-muted rounded-md animate-pulse" />
            </div>
        </div>
    )

    if (error) return (
        <div className="flex flex-col items-center justify-center py-20 gap-4 animate-in fade-in-0 duration-300">
            <div className="relative">
                <div className="absolute inset-0 rounded-full bg-destructive/20 blur-2xl animate-pulse" />
                <div className="h-14 w-14 rounded-full border-4 border-destructive border-t-transparent animate-spin" />
            </div>
            <div className="text-center space-y-2">
                <h3 className="text-lg font-semibold">Unable to load organization details</h3>
                <p className="text-sm text-muted-foreground">{error.message}</p>
            </div>
            <div className="flex items-center gap-2">
                <button onClick={() => window.location.reload()} className="h-9 px-4 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">Retry</button>
                <button onClick={() => history.back()} className="h-9 px-4 rounded-md border border-border hover:bg-muted transition-colors">Go Back</button>
            </div>
        </div>
    )

    const org: any = data
    const orgName = org?.name || 'Organization'
    const orgId = org?.id
    const orgImage = org?.imageURL
    const orgDomain = org?.domain || org?.domains?.[0]
    const createdAt = org?.created_at
    const members = org?.members || []
    const carrierId = org?.carriers?.id

    return (
        <div className="space-y-6">
            {/* Breadcrumb */}
            <div className="text-sm text-muted-foreground">
                <Link href="/manage/organizations" className="hover:underline">Organizations</Link>
                <span className="mx-2">/</span>
                <span className="text-foreground">Organization details</span>
            </div>

            {/* Header */}
            <Card>
                <CardHeader className="pb-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-4 min-w-0">
                            <div className="h-12 w-12 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center overflow-hidden">
                                {orgImage ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={orgImage} alt={orgName} className="h-full w-full object-cover" />
                                ) : (
                                    <Shield className="h-6 w-6 text-primary" />
                                )}
                            </div>
                            <div className="min-w-0">
                                <CardTitle className="text-2xl font-semibold">{orgName}</CardTitle>
                                <div className="flex flex-wrap items-center gap-2 mt-1">
                                    {orgId && <Badge variant="outline" className="font-mono text-xs max-w-[180px] truncate sm:max-w-none">{orgId}</Badge>}
                                    {orgDomain && <Badge variant="secondary">{orgDomain}</Badge>}
                                    {createdAt && (
                                        <span className="text-xs text-muted-foreground">Created {new Date(createdAt).toLocaleDateString()}</span>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
                            <Button variant="outline" size="sm">
                                <Settings className="h-4 w-4 mr-2" /> Settings
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {/* Tabs */}
                    <Tabs defaultValue="overview" className="w-full">
                        <TabsList className="flex flex-wrap">
                            <TabsTrigger value="overview">Overview</TabsTrigger>
                            <TabsTrigger value="members">Members</TabsTrigger>
                            <TabsTrigger value="merchants">Merchants</TabsTrigger>
                            <TabsTrigger value="roles">Roles</TabsTrigger>
                            <TabsTrigger value="invites">Invites</TabsTrigger>
                            <TabsTrigger value="audit">Audit Logs</TabsTrigger>
                            <TabsTrigger value="settings">Settings</TabsTrigger>
                        </TabsList>

                        {/* Overview */}
                        <TabsContent value="overview" className="mt-6">
                            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                {/* <Card>
                                    <CardHeader>
                                        <CardTitle className="text-sm font-medium">Merchant Onboarding</CardTitle>
                                        <CardDescription>Process for creating POS merchant accounts</CardDescription>
                                    </CardHeader>
                                    <CardContent className="text-sm text-muted-foreground space-y-2">
                                        <p>DexaPOS receives account info from Independent office or merchant directly (business name, address, owner details, and payment method).</p>
                                        <p>DexaPOS creates the store, adds owner as top-permission employee, and assigns store to correct independent office.</p>
                                    </CardContent>
                                </Card> */}
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-sm font-medium">Stores</CardTitle>
                                        <CardDescription>Assigned to this organization</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-2xl font-semibold">{org?.stores_count ?? 0}</div>
                                        <p className="text-sm text-muted-foreground">Total active POS locations</p>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-sm font-medium">Members</CardTitle>
                                        <CardDescription>Active users in this organization</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-2xl font-semibold">{members?.length ?? 0}</div>
                                        <p className="text-sm text-muted-foreground">Includes owners, managers and cashiers</p>
                                    </CardContent>
                                </Card>
                            </div>
                        </TabsContent>

                        {/* Roles */}
                        <TabsContent value="roles" className="mt-6">
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-lg font-semibold">Organization roles</h3>
                                        <p className="text-sm text-muted-foreground">Assign POS roles to manage access for merchants and staff.</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button variant="outline" size="sm">Edit priority</Button>
                                        <Button size="sm">Create role</Button>
                                    </div>
                                </div>

                                <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
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
                                                <TableCell><Badge variant="outline">{r.slug}</Badge></TableCell>
                                                <TableCell>
                                                    {r.perms.length ? r.perms.map((p) => (
                                                        <Badge key={p} variant="secondary" className="mr-2 mb-1">{p}</Badge>
                                                    )) : <span className="text-muted-foreground">—</span>}
                                                </TableCell>
                                                <TableCell className="text-right"><RoleRowMenu /></TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                                </div>

                                <Card className="mt-4">
                                    <CardHeader>
                                        <CardTitle className="text-sm">Role assignment in Admin Portal</CardTitle>
                                        <CardDescription>Map identity provider groups to POS roles per environment.</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <Button variant="outline" size="sm">Customize for this organization</Button>
                                    </CardContent>
                                </Card>
                            </div>
                        </TabsContent>

                        {/* Users */}
                        <TabsContent value="members" className="mt-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Members</CardTitle>
                                    <CardDescription>People with access to this organization</CardDescription>
                                    {members.length > 1 && <SendOrganizationMembersInviteButton organizationId={organizationId as string} refetch={refetchOrganizationInfo} role_types='carrier' />}

                                </CardHeader>
                                <CardContent>
                                    {
                                        members.length > 0 &&
                                        <div className="overflow-x-auto">
                                        <Table>
                                            <TableHeader>
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
                                                                    <Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button>
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
                                        </div>
                                    }
                                    {
                                        members.length === 0 &&
                                        <div className="flex flex-col items-center justify-center space-y-4">
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
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* Merchants */}
                        <TabsContent value="merchants" className="mt-6">
                            <Card>
                                <CardHeader>
                                    <div className='flex items-center justify-between'>
                                        <div className='flex flex-col gap-2'>
                                            <CardTitle>Merchants</CardTitle>
                                            <CardDescription>Manage and view all merchants associated with this carrier.</CardDescription>
                                        </div>
                                        <AddMerchantButton carrierId={carrierId as string} organizationId={organizationId as string} refetch={refetchOrganizationInfo} />
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <MerchantsTable merchants={org?.carriers?.merchants as MerchantsModel[]} />
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* Invites */}
                        <TabsContent value="invites" className="mt-6">
                            <Card>
                                <CardHeader>
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                        <div>
                                            <CardTitle>Invites</CardTitle>
                                            <CardDescription>Pending invitations</CardDescription>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Input placeholder="Search..." className="flex-1 min-w-[160px] sm:w-60 sm:flex-none" />
                                            {org.members.length > 1 ?
                                                <SendOrganizationMembersInviteButton organizationId={organizationId as string} refetch={refetchOrganizationInfo} role_types='carrier' /> :
                                                <SendAdminInviteButton organizationId={organizationId as string} refetch={refetchOrganizationInfo} role_types='carrier' />
                                            }
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    {(!org?.pending_org_admin_invites?.length && !org?.pending_org_member_invites?.length) && (
                                        <div className="flex flex-col items-center justify-center space-y-2 py-8 text-center">
                                            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                                                <Users className="h-6 w-6 text-muted-foreground" />
                                            </div>
                                            <div className="text-sm text-muted-foreground">No pending invites.</div>
                                        </div>
                                    )}

                                    {org?.pending_org_admin_invites?.length > 0 && (
                                        <div className="mb-6">
                                            <div className="text-sm font-medium mb-3">Admin invite</div>
                                            <div className="divide-y rounded-md border">
                                                {org.pending_org_admin_invites.map((inv: PendingOrgAdminInvitesModel) => (
                                                    <div key={inv.id} className="flex items-center justify-between p-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
                                                                {(inv.email?.[0] || 'A').toUpperCase()}
                                                            </div>
                                                            <div>
                                                                <div className={`*
                                                                font-medium ${inv.status === 'pending' ? 'text-yellow-500' :
                                                                        inv.status === 'revoked' ? 'text-red-500' :
                                                                            inv.status === 'accepted' ? 'text-green-500' :
                                                                                inv.status === 'expired' ? 'text-red-500' :
                                                                                    inv.status === 'cancelled' ? 'text-red-500' :
                                                                                        inv.status === 'failed' ? 'text-red-500' :
                                                                                            inv.status === 'pending' ? 'text-yellow-500' : 'text-red-500'
                                                                    }`}>{
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
                                                                    <Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button>
                                                                </DropdownMenuTrigger>
                                                                <DropdownMenuContent align="end">
                                                                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                                    <DropdownMenuItem>Copy invite link</DropdownMenuItem>
                                                                    <DropdownMenuItem onClick={() => {
                                                                        setResendAdminInvitePopup(inv)
                                                                        setOpenResendAdminInvitePopup(true)
                                                                    }}>Resend</DropdownMenuItem>
                                                                    <DropdownMenuSeparator />
                                                                    <DropdownMenuItem className='text-red-600' onClick={() => {
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

                                    {org?.pending_org_member_invites?.length > 0 && (
                                        <div>
                                            <div className="text-sm font-medium mb-3">Member invites</div>
                                            <div className="divide-y rounded-md border">
                                                {org.pending_org_member_invites.map((inv: any) => (
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
                                                                    <Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button>
                                                                </DropdownMenuTrigger>
                                                                <DropdownMenuContent align="end">
                                                                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                                    <DropdownMenuItem>Copy invite link</DropdownMenuItem>
                                                                    <DropdownMenuItem >Resend</DropdownMenuItem>
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

                        {/* Audit logs */}
                        <TabsContent value="audit" className="mt-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Audit logs</CardTitle>
                                    <CardDescription>Security activity for this organization</CardDescription>
                                </CardHeader>
                                <CardContent className="text-sm text-muted-foreground">No events to display.</CardContent>
                            </Card>
                        </TabsContent>

                        {/* Settings */}
                        <TabsContent value="settings" className="mt-6">
                            <div className="space-y-6">
                                {/* General Settings */}
                                <Card>
                                    <CardHeader>
                                        <CardTitle>General Settings</CardTitle>
                                        <CardDescription>Organization configuration and preferences</CardDescription>
                                    </CardHeader>
                                    <CardContent className="text-sm text-muted-foreground">
                                        <div className="text-center py-12">
                                            <Settings className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                                            <h3 className="text-lg font-semibold mb-2">General Settings</h3>
                                            <p className="text-sm text-muted-foreground">
                                                Organization configuration and settings panel coming soon.
                                            </p>
                                        </div>
                                    </CardContent>
                                </Card>

                                {/* Danger Zone */}
                                <Card className="border-destructive">
                                    <CardHeader>
                                        <CardTitle className="text-destructive flex items-center gap-2">
                                            <AlertTriangle className="h-5 w-5" />
                                            Danger Zone
                                        </CardTitle>
                                        <CardDescription>
                                            Irreversible and destructive actions. Please proceed with caution.
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between p-4 border border-destructive/20 rounded-lg bg-destructive/5">
                                                <div className="space-y-1">
                                                    <h4 className="font-medium text-destructive">Delete Organization</h4>
                                                    <p className="text-sm text-muted-foreground">
                                                        Permanently delete this organization and all associated data.
                                                        This action cannot be undone.
                                                    </p>
                                                </div>
                                                <Button
                                                    variant="destructive"
                                                    onClick={() => setOpenDeleteOrganizationDialog(true)}
                                                    className="ml-4"
                                                >
                                                    <Trash2 className="h-4 w-4 mr-2" />
                                                    Delete Organization
                                                </Button>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>

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
        </div>
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