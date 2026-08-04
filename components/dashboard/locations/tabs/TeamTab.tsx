'use client'

import { useState } from 'react'
import { Location, LocationMemberWithDetails, LocationInviteWithDetails } from '@/types/merchant_locations'
import { Button } from '@/components/ui/button'
import {
    LocationPanelSection,
    roundedFields,
    roundedSelectContent,
    pillButton,
} from '../LocationPanelSection'
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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Empty } from '@/components/ui/empty'
import { useQuery } from '@tanstack/react-query'
import { GetLocationMembers, GetLocationInvites } from '@/app/dashboard/actions/location-members'
import { Skeleton } from '@/components/ui/skeleton'
import { StaffDetailSheet } from '@/components/dashboard/staff/StaffDetailSheet'
import { InviteUserWizard } from '@/components/dashboard/staff/InviteUserWizard'
import { useStaffMember } from '@/app/dashboard/hooks/useStaff'

interface TeamTabProps {
    location: Location
}

// Tint alone carries the role; no border, so the badges read as soft fills.
const ROLE_COLORS: Record<string, string> = {
    'merchant.owner': 'bg-amber-100 text-amber-800 border-transparent',
    'merchant.admin': 'bg-purple-100 text-purple-800 border-transparent',
    'merchant.manager': 'bg-blue-100 text-blue-800 border-transparent',
    'merchant.shift_manager': 'bg-cyan-100 text-cyan-800 border-transparent',
    'merchant.cashier': 'bg-green-100 text-green-800 border-transparent',
    'merchant.server': 'bg-emerald-100 text-emerald-800 border-transparent',
    'merchant.busser': 'bg-orange-100 text-orange-800 border-transparent',
    'merchant.cook': 'bg-red-100 text-red-800 border-transparent',
    'merchant.line_cook': 'bg-rose-100 text-rose-800 border-transparent',
    'merchant.staff': 'bg-gray-100 text-gray-800 border-transparent',
}

export function TeamTab({ location }: TeamTabProps) {
    const [searchTerm, setSearchTerm] = useState('')
    const [roleFilter, setRoleFilter] = useState<string>('all')
    const [statusFilter, setStatusFilter] = useState<string>('all')
    const [selectedMemberId, setSelectedMemberId] = useState<string | undefined>(undefined)
    const [detailOpen, setDetailOpen] = useState(false)
    const [inviteOpen, setInviteOpen] = useState(false)

    const { data: members, isLoading: membersLoading } = useQuery({
        queryKey: ['location-members', location.id],
        queryFn: () => GetLocationMembers(location.id),
    })

    const { data: invites, isLoading: invitesLoading } = useQuery({
        queryKey: ['location-invites', location.id],
        queryFn: () => GetLocationInvites(location.id),
    })

    const { data: selectedStaff } = useStaffMember(selectedMemberId)

    const membersList = Array.isArray(members) ? members : []
    const invitesList = Array.isArray(invites) ? invites : []
    const pendingInvites = invitesList.filter(i => i.status === 'pending')

    const uniqueRoles = [...new Set(membersList.map(m => m.role_code))]

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

    const getRoleBadgeClass = (roleCode: string) => ROLE_COLORS[roleCode] || ROLE_COLORS['merchant.staff']

    const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
    })

    const handleMemberClick = (member: LocationMemberWithDetails) => {
        setSelectedMemberId(member.id)
        setDetailOpen(true)
    }

    return (
        <div className="space-y-4">
            <LocationPanelSection
                icon={Users}
                title={
                    <span className="inline-flex items-center gap-2">
                        Team Members
                        {membersList.length > 0 && (
                            <Badge variant="secondary" className="rounded-full text-xs font-medium px-2.5 py-0.5">
                                {membersList.length}
                            </Badge>
                        )}
                    </span>
                }
                description="Staff assigned to this location"
                action={
                    <Button size="sm" className={pillButton} onClick={() => setInviteOpen(true)}>
                        <UserPlus className="h-4 w-4" />
                        Invite
                    </Button>
                }
            >
                <div className="space-y-4">
                    <div className={cn('flex flex-col sm:flex-row gap-2', roundedFields)}>
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                            <Input
                                placeholder="Search by name or email..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                        <div className="flex gap-2">
                            <Select value={roleFilter} onValueChange={setRoleFilter}>
                                <SelectTrigger className="w-[140px]">
                                    <Filter className="h-4 w-4 mr-1" />
                                    <SelectValue placeholder="Role" />
                                </SelectTrigger>
                                <SelectContent className={roundedSelectContent}>
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
                                <SelectContent className={roundedSelectContent}>
                                    <SelectItem value="all">All</SelectItem>
                                    <SelectItem value="active">Active</SelectItem>
                                    <SelectItem value="inactive">Inactive</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {membersLoading ? (
                        <div className="space-y-2">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-muted/40">
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
                                    <Button size="sm" className={pillButton} onClick={() => setInviteOpen(true)}>
                                        <UserPlus className="h-4 w-4" />
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
                                    onClick={() => handleMemberClick(member)}
                                    className={cn(
                                        "w-full flex items-center gap-3 p-3 rounded-xl bg-muted/40 text-left",
                                        "hover:bg-muted transition-colors",
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
                                        className={cn(
                                            "rounded-full text-xs font-medium px-2.5 py-0.5 capitalize shrink-0",
                                            getRoleBadgeClass(member.role_code)
                                        )}
                                    >
                                        {member.role_code?.split('.').pop()?.replace('_', ' ') ?? 'Staff'}
                                    </Badge>
                                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </LocationPanelSection>

            {pendingInvites.length > 0 && (
                <LocationPanelSection
                    icon={Mail}
                    title={
                        <span className="inline-flex items-center gap-2">
                            Pending Invitations
                            <Badge variant="secondary" className="rounded-full text-xs font-medium px-2.5 py-0.5">
                                {pendingInvites.length}
                            </Badge>
                        </span>
                    }
                    description="Invitations waiting for response"
                >
                        <div className="space-y-2">
                            {pendingInvites.map((invite, index) => (
                                <div
                                    key={invite.id}
                                    className={cn(
                                        "flex items-center gap-3 p-3 rounded-xl border border-dashed",
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
                                        className={cn(
                                            "rounded-full text-xs font-medium px-2.5 py-0.5 capitalize",
                                            getRoleBadgeClass(invite.role_code)
                                        )}
                                    >
                                        {invite.role_code.split('.').pop()?.replace('_', ' ')}
                                    </Badge>
                                </div>
                            ))}
                        </div>
                </LocationPanelSection>
            )}

            <StaffDetailSheet
                staff={selectedStaff ?? null}
                open={detailOpen}
                onOpenChange={(open) => {
                    setDetailOpen(open)
                    if (!open) setSelectedMemberId(undefined)
                }}
                elevated
            />

            {/* Opened from inside the location detail Sheet, so it has to clear
                the sheet's z-index or it renders behind the dimmed backdrop. */}
            <InviteUserWizard
                open={inviteOpen}
                onOpenChange={setInviteOpen}
                defaultLocationId={location.id}
                elevated
            />
        </div>
    )
}
