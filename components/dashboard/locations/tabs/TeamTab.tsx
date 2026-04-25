'use client'

import { useState } from 'react'
import { Location, LocationMemberWithDetails, LocationInviteWithDetails } from '@/types/merchant_locations'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
    Users,
    Search,
    UserPlus,
    Mail,
    Clock,
    Star,
    Filter,
    ChevronRight,
    Loader2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Empty } from '@/components/ui/empty'
import { useQuery } from '@tanstack/react-query'
import { GetLocationMembers, GetLocationInvites } from '@/app/dashboard/actions/location-members'
import { Skeleton } from '@/components/ui/skeleton'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Separator } from '@/components/ui/separator'

interface TeamTabProps {
    location: Location
}

// Role badge colors
const ROLE_COLORS: Record<string, string> = {
    'merchant.owner': 'bg-amber-100 text-amber-800 border-amber-300',
    'merchant.admin': 'bg-purple-100 text-purple-800 border-purple-300',
    'merchant.manager': 'bg-blue-100 text-blue-800 border-blue-300',
    'merchant.shift_manager': 'bg-cyan-100 text-cyan-800 border-cyan-300',
    'merchant.cashier': 'bg-green-100 text-green-800 border-green-300',
    'merchant.server': 'bg-emerald-100 text-emerald-800 border-emerald-300',
    'merchant.busser': 'bg-orange-100 text-orange-800 border-orange-300',
    'merchant.cook': 'bg-red-100 text-red-800 border-red-300',
    'merchant.line_cook': 'bg-rose-100 text-rose-800 border-rose-300',
    'merchant.staff': 'bg-gray-100 text-gray-800 border-gray-300',
}

export function TeamTab({ location }: TeamTabProps) {
    const [searchTerm, setSearchTerm] = useState('')
    const [roleFilter, setRoleFilter] = useState<string>('all')
    const [statusFilter, setStatusFilter] = useState<string>('all')
    const [selectedMember, setSelectedMember] = useState<LocationMemberWithDetails | null>(null)

    // Fetch team members
    const { data: members, isLoading: membersLoading } = useQuery({
        queryKey: ['location-members', location.id],
        queryFn: () => GetLocationMembers(location.id),
    })

    // Fetch pending invites
    const { data: invites, isLoading: invitesLoading } = useQuery({
        queryKey: ['location-invites', location.id],
        queryFn: () => GetLocationInvites(location.id),
    })

    const membersList = Array.isArray(members) ? members : []
    const invitesList = Array.isArray(invites) ? invites : []
    const pendingInvites = invitesList.filter(i => i.status === 'pending')

    // Get unique roles for filter
    const uniqueRoles = [...new Set(membersList.map(m => m.role_code))]

    // Filter members
    const filteredMembers = membersList.filter(member => {
        if (!member.user) return false
        const matchesSearch =
            `${member.user.first_name ?? ''} ${member.user.last_name ?? ''}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (member.user.email ?? '').toLowerCase().includes(searchTerm.toLowerCase())

        const matchesRole = roleFilter === 'all' || member.role_code === roleFilter
        const matchesStatus = statusFilter === 'all' ||
            (statusFilter === 'active' && member.is_active) ||
            (statusFilter === 'inactive' && !member.is_active)

        return matchesSearch && matchesRole && matchesStatus
    })

    const getRoleBadgeClass = (roleCode: string) => {
        return ROLE_COLORS[roleCode] || ROLE_COLORS['merchant.staff']
    }

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        })
    }

    return (
        <div className="space-y-4">
            {/* Header with filters */}
            <Card>
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-base flex items-center gap-2">
                                <Users className="h-4 w-4" />
                                Team Members
                                {membersList.length > 0 && (
                                    <Badge variant="secondary" className="ml-2">
                                        {membersList.length}
                                    </Badge>
                                )}
                            </CardTitle>
                            <CardDescription>Staff assigned to this location</CardDescription>
                        </div>
                        <Button size="sm" disabled>
                            <UserPlus className="h-4 w-4 mr-1" />
                            Invite
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Search and Filters */}
                    <div className="flex flex-col sm:flex-row gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search by name or email..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-8"
                            />
                        </div>
                        <div className="flex gap-2">
                            <Select value={roleFilter} onValueChange={setRoleFilter}>
                                <SelectTrigger className="w-[140px]">
                                    <Filter className="h-4 w-4 mr-1" />
                                    <SelectValue placeholder="Role" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Roles</SelectItem>
                                    {uniqueRoles.map((role) => (
                                        <SelectItem key={role} value={role}>
                                            {role.split('.').pop()?.replace('_', ' ')}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                <SelectTrigger className="w-[120px]">
                                    <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All</SelectItem>
                                    <SelectItem value="active">Active</SelectItem>
                                    <SelectItem value="inactive">Inactive</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Members List */}
                    {membersLoading ? (
                        <div className="space-y-2">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="flex items-center gap-3 p-3 border rounded-lg">
                                    <Skeleton className="h-10 w-10 rounded-full" />
                                    <div className="flex-1 space-y-2">
                                        <Skeleton className="h-4 w-32" />
                                        <Skeleton className="h-3 w-48" />
                                    </div>
                                    <Skeleton className="h-6 w-20" />
                                </div>
                            ))}
                        </div>
                    ) : filteredMembers.length === 0 ? (
                        <Empty
                            icon={Users}
                            title={membersList.length === 0 ? "No team members" : "No results found"}
                            description={
                                membersList.length === 0
                                    ? "Invite your first team member to this location"
                                    : "Try adjusting your search or filters"
                            }
                            action={
                                membersList.length === 0 ? (
                                    <Button size="sm" disabled>
                                        <UserPlus className="h-4 w-4 mr-2" />
                                        Invite Member
                                    </Button>
                                ) : null
                            }
                        />
                    ) : (
                        <div className="space-y-2">
                            {filteredMembers.map((member, index) => (
                                <button
                                    key={member.id}
                                    onClick={() => setSelectedMember(member)}
                                    className={cn(
                                        "w-full flex items-center gap-3 p-3 border rounded-lg text-left",
                                        "hover:bg-muted/50 transition-colors",
                                        "animate-in fade-in slide-in-from-left-2 duration-200",
                                        !member.is_active && "opacity-60"
                                    )}
                                    style={{ animationDelay: `${index * 30}ms` }}
                                >
                                    <Avatar className="h-10 w-10">
                                        <AvatarImage src={member.user?.avatar_url || undefined} />
                                        <AvatarFallback>
                                            {member.user?.first_name?.[0]}{member.user?.last_name?.[0]}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium truncate">
                                                {member.user?.first_name} {member.user?.last_name}
                                            </span>
                                            {member.is_primary_location && (
                                                <Star className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                                            )}
                                        </div>
                                        <p className="text-sm text-muted-foreground truncate">
                                            {member.user?.email}
                                        </p>
                                    </div>
                                    <Badge
                                        variant="outline"
                                        className={cn("text-xs capitalize shrink-0", getRoleBadgeClass(member.role_code))}
                                    >
                                        {member.role_code?.split('.').pop()?.replace('_', ' ') ?? 'Staff'}
                                    </Badge>
                                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                                </button>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Pending Invites */}
            {pendingInvites.length > 0 && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Mail className="h-4 w-4" />
                            Pending Invitations
                            <Badge variant="secondary">{pendingInvites.length}</Badge>
                        </CardTitle>
                        <CardDescription>Invitations waiting for response</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {pendingInvites.map((invite, index) => (
                                <div
                                    key={invite.id}
                                    className={cn(
                                        "flex items-center gap-3 p-3 border rounded-lg border-dashed",
                                        "animate-in fade-in slide-in-from-left-2 duration-200"
                                    )}
                                    style={{ animationDelay: `${index * 30}ms` }}
                                >
                                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                                        <Mail className="h-5 w-5 text-muted-foreground" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium truncate">{invite.email}</p>
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                            <Clock className="h-3 w-3" />
                                            <span>Expires {formatDate(invite.expires_at)}</span>
                                        </div>
                                    </div>
                                    <Badge
                                        variant="outline"
                                        className={cn("text-xs capitalize", getRoleBadgeClass(invite.role_code))}
                                    >
                                        {invite.role_code.split('.').pop()?.replace('_', ' ')}
                                    </Badge>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Member Detail Sheet */}
            <Sheet open={!!selectedMember} onOpenChange={(open) => !open && setSelectedMember(null)}>
                <SheetContent side="right" className="w-full sm:max-w-md">
                    {selectedMember && (
                        <>
                            <SheetHeader>
                                <div className="flex items-center gap-4">
                                    <Avatar className="h-16 w-16">
                                        <AvatarImage src={selectedMember.user?.avatar_url || undefined} />
                                        <AvatarFallback className="text-lg">
                                            {selectedMember.user?.first_name?.[0]}{selectedMember.user?.last_name?.[0]}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <SheetTitle className="text-xl">
                                            {selectedMember.user?.first_name} {selectedMember.user?.last_name}
                                        </SheetTitle>
                                        <SheetDescription>{selectedMember.user?.email}</SheetDescription>
                                    </div>
                                </div>
                            </SheetHeader>

                            <div className="mt-6 space-y-6">
                                {/* Status */}
                                <div className="flex items-center gap-2">
                                    <Badge variant={selectedMember.is_active ? "default" : "secondary"}>
                                        {selectedMember.is_active ? 'Active' : 'Inactive'}
                                    </Badge>
                                    {selectedMember.is_primary_location && (
                                        <Badge variant="outline" className="gap-1">
                                            <Star className="h-3 w-3 text-amber-500" />
                                            Primary Location
                                        </Badge>
                                    )}
                                </div>

                                <Separator />

                                {/* Role */}
                                <div>
                                    <h4 className="text-sm font-medium text-muted-foreground mb-2">Role</h4>
                                    <Badge
                                        variant="outline"
                                        className={cn("text-sm", getRoleBadgeClass(selectedMember.role_code))}
                                    >
                                        {selectedMember.role_code?.split('.').pop()?.replace('_', ' ') ?? 'Staff'}
                                    </Badge>
                                    {selectedMember.role && typeof selectedMember.role === 'object' && (
                                        <p className="text-sm text-muted-foreground mt-2">
                                            Level: {selectedMember.role.level} ({selectedMember.role.level_type})
                                        </p>
                                    )}
                                </div>

                                <Separator />

                                {/* Employment Details */}
                                <div>
                                    <h4 className="text-sm font-medium text-muted-foreground mb-2">Employment</h4>
                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Type</span>
                                            <span className="capitalize">
                                                {selectedMember.employment_type?.replace('_', ' ') || 'Not specified'}
                                            </span>
                                        </div>
                                        {selectedMember.hourly_rate && (
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">Hourly Rate</span>
                                                <span>${selectedMember.hourly_rate.toFixed(2)}/hr</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Assigned</span>
                                            <span>{formatDate(selectedMember.assigned_at)}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </SheetContent>
            </Sheet>
        </div>
    )
}

