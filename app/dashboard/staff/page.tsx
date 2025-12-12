'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import { useLocationStore, useIsAllLocations } from '@/stores/location-store'
import { useLocations } from '../hooks/useLocations'
import { useStaff, useInviteClerk, useCreatePosStaff, useCancelInvite } from '../hooks/useStaff'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { Empty } from '@/components/ui/empty'
import {
    UserPlus, Users, Mail, MapPin, Globe, KeyRound, Clock3, Shield, Trash, SendHorizonal,
    Search, Filter, UserCog, Sparkles
} from 'lucide-react'
import { useUserInfo } from '@/app/manage/hooks/useUserInfo.'

const CLERK_ROLES = [
    { code: 'owner', label: 'Owner' },
    { code: 'admin', label: 'Admin' },
    { code: 'manager', label: 'Manager' },
]

const POS_ROLES = [
    { code: 'shift_manager', label: 'Shift Manager' },
    { code: 'cashier', label: 'Cashier' },
    { code: 'kitchen', label: 'Kitchen' },
    { code: 'staff', label: 'Staff' },
]

type InviteMode = 'clerk' | 'pos'

export default function MerchantStaffPage() {
    const router = useRouter()
    const { data: userInfo } = useUserInfo()
    const merchantId = userInfo?.members?.[0]?.organizations?.merchants?.id || ''
    const clerkUserId = userInfo?.id || ''

    const { selectedLocationId } = useLocationStore()
    const isAllLocations = useIsAllLocations()

    const { data: locationsData } = useLocations(userInfo?.members?.[0]?.organizations?.id || '')
    const locations = Array.isArray(locationsData) ? locationsData : []

    // Staff data for selected location
    const {
        data: staffData,
        isLoading,
        refetch
    } = useStaff(selectedLocationId || null)

    const inviteClerkMutation = useInviteClerk()
    const posMutation = useCreatePosStaff()
    const cancelInviteMutation = useCancelInvite()

    const [tab, setTab] = useState<'team' | 'invites'>('team')
    const [isSheetOpen, setIsSheetOpen] = useState(false)
    const [inviteMode, setInviteMode] = useState<InviteMode>('clerk')
    const [search, setSearch] = useState('')
    const [roleFilter, setRoleFilter] = useState<string | null>(null)

    // Invite form state
    const [inviteEmail, setInviteEmail] = useState('')
    const [inviteRole, setInviteRole] = useState<string>(CLERK_ROLES[1].code)
    const [inviteLocationId, setInviteLocationId] = useState<string | null>(null)

    // POS form state
    const [posFirstName, setPosFirstName] = useState('')
    const [posLastName, setPosLastName] = useState('')
    const [posRole, setPosRole] = useState<string>(POS_ROLES[1].code)
    const [posPin, setPosPin] = useState('')
    const [posLocationId, setPosLocationId] = useState<string | null>(null)

    useEffect(() => {
        if (selectedLocationId) {
            setInviteLocationId(selectedLocationId)
            setPosLocationId(selectedLocationId)
        }
    }, [selectedLocationId])

    const members = staffData?.members || []
    const invites = staffData?.invites || []

    const filteredMembers = useMemo(() => {
        return members.filter((m: any) => {
            const matchesSearch =
                !search ||
                m.user?.first_name?.toLowerCase().includes(search.toLowerCase()) ||
                m.user?.last_name?.toLowerCase().includes(search.toLowerCase()) ||
                m.user?.email?.toLowerCase().includes(search.toLowerCase())

            const matchesRole = !roleFilter || m.role_code === roleFilter
            return matchesSearch && matchesRole
        })
    }, [members, search, roleFilter])

    const stats = useMemo(() => {
        const active = members.filter((m: any) => m.is_active).length
        const pending = invites.filter((i: any) => i.status === 'pending').length
        const locationsCount = new Set(members.map((m: any) => m.location_id)).size
        return { active, pending, locationsCount }
    }, [members, invites])

    const requireLocation = !selectedLocationId || isAllLocations

    const handleInviteSubmit = async () => {
        const locationId = inviteLocationId || selectedLocationId
        if (!locationId) {
            toast.error('Please select a location')
            return
        }
        if (!inviteEmail) {
            toast.error('Email is required')
            return
        }
        const res = await inviteClerkMutation.mutateAsync({
            locationId,
            email: inviteEmail,
            role_code: inviteRole,
            invited_by_user_id: clerkUserId
        })
        if ((res as any)?.error) {
            toast.error((res as any).error)
        } else {
            toast.success('Invitation sent')
            setIsSheetOpen(false)
            setInviteEmail('')
            setInviteRole(CLERK_ROLES[1].code)
            refetch()
        }
    }

    const handlePosSubmit = async () => {
        const locationId = posLocationId || selectedLocationId
        if (!locationId) {
            toast.error('Please select a location')
            return
        }
        if (!posFirstName || !posLastName || !posPin) {
            toast.error('Name and PIN are required')
            return
        }
        if (posPin.length < 4 || posPin.length > 6) {
            toast.error('PIN must be 4-6 digits')
            return
        }
        const res = await posMutation.mutateAsync({
            merchantId,
            locationId,
            firstName: posFirstName,
            lastName: posLastName,
            roleCode: posRole,
            pin: posPin,
        })
        if ((res as any)?.error) {
            toast.error((res as any).error)
        } else {
            toast.success('POS staff created')
            setIsSheetOpen(false)
            setPosFirstName('')
            setPosLastName('')
            setPosPin('')
            setPosRole(POS_ROLES[1].code)
            refetch()
        }
    }

    const handleCancelInvite = async (id: string) => {
        const locationId = inviteLocationId || selectedLocationId
        await cancelInviteMutation.mutateAsync({ inviteId: id, locationId: locationId || '' })
        toast.success('Invite cancelled')
        refetch()
    }

    return (
        <main className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <h1 className="text-2xl font-bold tracking-tight">Team & Access</h1>
                        {requireLocation ? (
                            <Badge variant="outline" className="gap-1"><Globe className="h-3 w-3" />All Locations</Badge>
                        ) : (
                            <Badge variant="outline" className="gap-1"><MapPin className="h-3 w-3" />Location</Badge>
                        )}
                    </div>
                    <p className="text-muted-foreground">Manage dashboard and POS access by location.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
                        <SheetTrigger asChild>
                            <Button className="gap-2">
                                <UserPlus className="h-4 w-4" />
                                Invite / Add
                            </Button>
                        </SheetTrigger>
                        <SheetContent className="sm:max-w-lg">
                            <SheetHeader>
                                <SheetTitle>Invite or Add Team Member</SheetTitle>
                            </SheetHeader>
                            <div className="space-y-6 py-4">
                                <div className="flex gap-2">
                                    <Button
                                        variant={inviteMode === 'clerk' ? 'default' : 'outline'}
                                        className="flex-1"
                                        onClick={() => setInviteMode('clerk')}
                                    >
                                        <Mail className="h-4 w-4 mr-2" />
                                        Clerk (Email)
                                    </Button>
                                    <Button
                                        variant={inviteMode === 'pos' ? 'default' : 'outline'}
                                        className="flex-1"
                                        onClick={() => setInviteMode('pos')}
                                    >
                                        <KeyRound className="h-4 w-4 mr-2" />
                                        POS (PIN)
                                    </Button>
                                </div>

                                {requireLocation && (
                                    <div className="space-y-2">
                                        <Label>Location</Label>
                                        <Select
                                            value={inviteMode === 'clerk' ? inviteLocationId || '' : posLocationId || ''}
                                            onValueChange={(val) => {
                                                if (inviteMode === 'clerk') setInviteLocationId(val)
                                                else setPosLocationId(val)
                                            }}
                                        >
                                            <SelectTrigger><SelectValue placeholder="Choose location" /></SelectTrigger>
                                            <SelectContent>
                                                {locations.map((loc: any) => (
                                                    <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}

                                {inviteMode === 'clerk' ? (
                                    <div className="space-y-3">
                                        <div className="space-y-2">
                                            <Label>Email</Label>
                                            <Input
                                                type="email"
                                                placeholder="manager@example.com"
                                                value={inviteEmail}
                                                onChange={(e) => setInviteEmail(e.target.value)}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Role</Label>
                                            <Select value={inviteRole} onValueChange={setInviteRole}>
                                                <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                                                <SelectContent>
                                                    {CLERK_ROLES.map(r => (
                                                        <SelectItem key={r.code} value={r.code}>{r.label}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <Button onClick={handleInviteSubmit} className="w-full" disabled={inviteClerkMutation.isLoading}>
                                            {inviteClerkMutation.isLoading ? 'Sending...' : 'Send Invite'}
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-2">
                                                <Label>First name</Label>
                                                <Input value={posFirstName} onChange={(e) => setPosFirstName(e.target.value)} />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Last name</Label>
                                                <Input value={posLastName} onChange={(e) => setPosLastName(e.target.value)} />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Role</Label>
                                            <Select value={posRole} onValueChange={setPosRole}>
                                                <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                                                <SelectContent>
                                                    {POS_ROLES.map(r => (
                                                        <SelectItem key={r.code} value={r.code}>{r.label}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>PIN (4-6 digits)</Label>
                                            <Input
                                                type="password"
                                                value={posPin}
                                                onChange={(e) => setPosPin(e.target.value)}
                                                maxLength={6}
                                                placeholder="••••"
                                            />
                                        </div>
                                        <Button onClick={handlePosSubmit} className="w-full" disabled={posMutation.isLoading}>
                                            {posMutation.isLoading ? 'Creating...' : 'Create POS Account'}
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </SheetContent>
                    </Sheet>
                </div>
            </div>

            {/* Stats */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="flex items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Staff</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? <Skeleton className="h-6 w-12" /> : (
                            <div className="text-2xl font-bold">{stats.active}</div>
                        )}
                        <p className="text-xs text-muted-foreground">People with access</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Pending Invites</CardTitle>
                        <Mail className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? <Skeleton className="h-6 w-12" /> : (
                            <div className="text-2xl font-bold">{stats.pending}</div>
                        )}
                        <p className="text-xs text-muted-foreground">Awaiting acceptance</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Locations</CardTitle>
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? <Skeleton className="h-6 w-12" /> : (
                            <div className="text-2xl font-bold">{stats.locationsCount}</div>
                        )}
                        <p className="text-xs text-muted-foreground">Covered by this team</p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <CardTitle>Team & Invites</CardTitle>
                            <CardDescription>Dashboard (Clerk) and POS (PIN) access per location.</CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search by name or email"
                                    className="pl-8 w-64"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                />
                            </div>
                            <Select value={roleFilter || ''} onValueChange={(v) => setRoleFilter(v || null)}>
                                <SelectTrigger className="w-36">
                                    <SelectValue placeholder="All roles" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All roles</SelectItem>
                                    {[...CLERK_ROLES, ...POS_ROLES].map(r => (
                                        <SelectItem key={r.code} value={r.code}>{r.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <Tabs value={tab} onValueChange={(val) => setTab(val as any)}>
                        <TabsList>
                            <TabsTrigger value="team">Team</TabsTrigger>
                            <TabsTrigger value="invites">Invites</TabsTrigger>
                        </TabsList>
                    </Tabs>
                </CardHeader>
                <CardContent>
                    {tab === 'team' ? (
                        isLoading ? (
                            <div className="space-y-3">
                                {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
                            </div>
                        ) : filteredMembers.length === 0 ? (
                            <Empty
                                icon={UserCog}
                                title="No staff yet"
                                description="Invite a manager or create POS staff to get started."
                                action={
                                    <Button onClick={() => setIsSheetOpen(true)}>
                                        <UserPlus className="h-4 w-4 mr-2" />
                                        Invite Team Member
                                    </Button>
                                }
                            />
                        ) : (
                            <div className="divide-y rounded-lg border">
                                {filteredMembers.map((member: any) => (
                                    <div key={member.id} className="flex items-center justify-between p-4">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium">
                                                    {member.user?.first_name} {member.user?.last_name}
                                                </span>
                                                {member.user?.email && (
                                                    <Badge variant="outline" className="text-xs">{member.user.email}</Badge>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                <Shield className="h-4 w-4" />
                                                <span className="capitalize">{member.role_code?.replace('_', ' ')}</span>
                                                {member.pin_code && (
                                                    <Badge variant="secondary" className="text-xs gap-1">
                                                        <KeyRound className="h-3 w-3" /> PIN
                                                    </Badge>
                                                )}
                                                <Badge variant="secondary" className="text-xs gap-1">
                                                    <MapPin className="h-3 w-3" /> {member.location_id?.slice(0, 8)}…
                                                </Badge>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                            <Clock3 className="h-4 w-4" />
                                            Joined {member.assigned_at ? new Date(member.assigned_at).toLocaleDateString() : '—'}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )
                    ) : (
                        isLoading ? (
                            <div className="space-y-3">
                                {[1, 2].map(i => <Skeleton key={i} className="h-14 w-full" />)}
                            </div>
                        ) : invites.length === 0 ? (
                            <Empty
                                icon={Mail}
                                title="No invites pending"
                                description="Send a Clerk invite or add a POS PIN account."
                                action={
                                    <Button onClick={() => setIsSheetOpen(true)}>
                                        <UserPlus className="h-4 w-4 mr-2" />
                                        Invite Team Member
                                    </Button>
                                }
                            />
                        ) : (
                            <div className="divide-y rounded-lg border">
                                {invites.map((invite: any) => (
                                    <div key={invite.id} className="flex items-center justify-between p-4">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium">{invite.email}</span>
                                                <Badge variant="secondary" className="text-xs capitalize">
                                                    {invite.role_code?.replace('_', ' ')}
                                                </Badge>
                                                <Badge variant="outline" className="text-xs gap-1">
                                                    <SendHorizonal className="h-3 w-3" /> {invite.status}
                                                </Badge>
                                            </div>
                                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                <MapPin className="h-4 w-4" />
                                                {invite.location_id?.slice(0, 8)}…
                                                <Clock3 className="h-4 w-4 ml-2" />
                                                Sent {invite.created_at ? new Date(invite.created_at).toLocaleDateString() : '—'}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="gap-1"
                                                onClick={() => toast.info('Resend coming soon')}
                                            >
                                                <Sparkles className="h-4 w-4" />
                                                Resend
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="gap-1 text-red-600"
                                                onClick={() => handleCancelInvite(invite.id)}
                                            >
                                                <Trash className="h-4 w-4" />
                                                Cancel
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )
                    )}
                </CardContent>
            </Card>
        </main>
    )
}