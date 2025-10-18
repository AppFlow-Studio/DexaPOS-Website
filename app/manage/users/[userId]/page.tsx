'use client'

import { useParams } from 'next/navigation'
import { useGetInfoOfUser } from '../../hooks/useGetInfoOfUser'
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
} from 'lucide-react'
import Link from 'next/link'

export default function UserInfoPage() {
    const { userId } = useParams()
    const { data: user, isLoading, error } = useGetInfoOfUser(userId as string)

    if (isLoading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        )
    }

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
                                    {userId}
                                </Badge>
                                <span className="text-muted-foreground">{user.email}</span>
                            </div>
                        </div>
                    </div>

                    {/* Tabs */}
                    <Tabs defaultValue="details" className="mt-6">
                        <TabsList>
                            <TabsTrigger value="details">Details</TabsTrigger>
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

                                        <div className="flex justify-between items-center">
                                            <span className="text-sm font-medium text-muted-foreground">Authentication</span>
                                            <div className="flex items-center space-x-2">
                                                <div className="w-4 h-4 bg-blue-500 rounded text-white text-xs flex items-center justify-center font-bold">G</div>
                                                <span className="text-sm">Google OAuth</span>
                                            </div>
                                        </div>

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
                                        <Button variant="outline">
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
                                                                <DropdownMenuItem>
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
                                            <Dialog>
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
                                                            Are you sure you want to delete this user account? This action cannot be undone.
                                                        </DialogDescription>
                                                    </DialogHeader>
                                                    <DialogFooter>
                                                        <Button variant="outline">Cancel</Button>
                                                        <Button variant="destructive">Delete user</Button>
                                                    </DialogFooter>
                                                </DialogContent>
                                            </Dialog>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
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
        </div>
    )
}