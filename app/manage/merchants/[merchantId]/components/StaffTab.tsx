'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RefreshCw, MoreHorizontal, Eye, Edit, Trash2, Users } from 'lucide-react'
import { MerchantInfoModel, PendingOrgAdminInvitesModel } from '@/types/db-modles'
import { SendOrganizationMembersInviteButton } from '../../../organizations/[organizationId]/componenets/SendOrganizationMembersInviteButton'
import { SendAdminInviteButton } from '../../../organizations/[organizationId]/componenets/SendAdminInviteButton'
import { useState } from 'react'
import { RevokeAdminInvitePopup } from '../../../organizations/[organizationId]/componenets/RevokeAdminInvitePopup'
import { ResendAdminInvitePopup } from '../../../organizations/[organizationId]/componenets/ResendAdminInvitePopup'

interface StaffTabProps {
    merchantInfo: MerchantInfoModel
    refetchMerchantInfo: () => void
}

export function StaffTab({ merchantInfo, refetchMerchantInfo }: StaffTabProps) {
    const [revokeAdminInvitePopup, setRevokeAdminInvitePopup] = useState<PendingOrgAdminInvitesModel | null>(null)
    const [openRevokeAdminInvitePopup, setOpenRevokeAdminInvitePopup] = useState(false)
    const [resendAdminInvitePopup, setResendAdminInvitePopup] = useState<PendingOrgAdminInvitesModel | null>(null)
    const [openResendAdminInvitePopup, setOpenResendAdminInvitePopup] = useState(false)

    return (
        <>
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Staff</CardTitle>
                            <CardDescription>Manage merchant staff and pending invitations</CardDescription>
                        </div>
                        {(merchantInfo?.organizations as any)?.members?.length > 0 ?
                            <SendOrganizationMembersInviteButton organizationId={merchantInfo?.clerk_org_id as string} refetch={refetchMerchantInfo} role_types='merchant' /> :
                            <SendAdminInviteButton organizationId={merchantInfo?.clerk_org_id as string} refetch={refetchMerchantInfo} role_types='merchant' />
                        }
                    </div>
                </CardHeader>
                <CardContent>
                    <Tabs defaultValue="management" className="w-full">
                        <div className='flex items-center justify-between'>
                            <TabsList>
                                <TabsTrigger value="management">Management</TabsTrigger>
                                <TabsTrigger value="invites">Pending Invites</TabsTrigger>
                            </TabsList>
                            <Button variant="outline" size="sm" onClick={() => refetchMerchantInfo()}>
                                <RefreshCw className="h-4 w-4 mr-2" /> Refresh
                            </Button>
                        </div>

                        <TabsContent value="management" className="mt-4">
                            {(merchantInfo?.organizations as any)?.members && (merchantInfo?.organizations as any).members.length > 0 ? (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Staff Member</TableHead>
                                            <TableHead>Role</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead>Joined</TableHead>
                                            <TableHead className="w-[70px]">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {(merchantInfo?.organizations as any).members.map((member: any) => (
                                            <TableRow key={member.id}>
                                                <TableCell>
                                                    <div className="flex items-center gap-3">
                                                        <Avatar className="h-8 w-8">
                                                            <AvatarImage src={member?.users?.avatar_url || ''} alt={member?.users?.first_name || 'User'} />
                                                            <AvatarFallback>
                                                                {(member?.users?.first_name || 'U')[0]}{(member?.users?.last_name || 'N')[0]}
                                                            </AvatarFallback>
                                                        </Avatar>
                                                        <div>
                                                            <div className="font-medium">
                                                                {member?.users?.first_name} {member?.users?.last_name}
                                                            </div>
                                                            <div className="text-sm text-muted-foreground">{member?.users?.email}</div>
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline">
                                                        {member?.users?.public_metadata?.role || 'member'}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        <div className="h-2 w-2 rounded-full bg-green-600" />
                                                        <span className="text-sm">Active</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-sm text-muted-foreground">
                                                    {member?.created_at ? new Date(member.created_at).toLocaleDateString() : '-'}
                                                </TableCell>
                                                <TableCell>
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" className="h-8 w-8 p-0">
                                                                <MoreHorizontal className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                            <DropdownMenuItem>
                                                                <Eye className="h-4 w-4 mr-2" /> View Profile
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem>
                                                                <Edit className="h-4 w-4 mr-2" /> Edit Role
                                                            </DropdownMenuItem>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem className="text-red-600">
                                                                <Trash2 className="h-4 w-4 mr-2" /> Remove
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            ) : (
                                <div className="flex flex-col items-center justify-center space-y-4">
                                    <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center">
                                        <Users className="h-8 w-8 text-muted-foreground" />
                                    </div>
                                    <div className="space-y-2 text-center">
                                        <h3 className="text-lg font-semibold">No staff members</h3>
                                        <p className="text-sm text-muted-foreground max-w-md">
                                            This merchant doesn't have any staff members yet, add an admin to get started.
                                        </p>
                                        <SendAdminInviteButton organizationId={merchantInfo?.clerk_org_id as string} refetch={refetchMerchantInfo} role_types='merchant' />
                                    </div>
                                </div>
                            )}
                        </TabsContent>

                        <TabsContent value="invites" className="mt-4">
                            {(!(merchantInfo?.organizations as any)?.pending_org_admin_invites?.length && !(merchantInfo?.organizations as any)?.pending_org_member_invites?.length) ? (
                                <div className="flex flex-col items-center justify-center space-y-2 py-8 text-center">
                                    <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                                        <Users className="h-6 w-6 text-muted-foreground" />
                                    </div>
                                    <div className="text-sm text-muted-foreground">No pending staff invites.</div>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    {(merchantInfo?.organizations as any)?.pending_org_admin_invites?.length > 0 && (
                                        <div>
                                            <div className="text-sm font-medium mb-3">Admin Invites</div>
                                            <div className="divide-y rounded-md border">
                                                {(merchantInfo?.organizations as any).pending_org_admin_invites.map((inv: any) => (
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

                                    {(merchantInfo?.organizations as any)?.pending_org_member_invites?.length > 0 && (
                                        <div>
                                            <div className="text-sm font-medium mb-3">Member Invites</div>
                                            <div className="divide-y rounded-md border">
                                                {(merchantInfo?.organizations as any).pending_org_member_invites.map((inv: any) => (
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
                                </div>
                            )}
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>
            <RevokeAdminInvitePopup invitation={revokeAdminInvitePopup!} open={openRevokeAdminInvitePopup} setOpen={setOpenRevokeAdminInvitePopup} refetch={refetchMerchantInfo} />
            <ResendAdminInvitePopup invitation={resendAdminInvitePopup!} open={openResendAdminInvitePopup} setOpen={setOpenResendAdminInvitePopup} refetch={refetchMerchantInfo} />
        </>
    )
}
