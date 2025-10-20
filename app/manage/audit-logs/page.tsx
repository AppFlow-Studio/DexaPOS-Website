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
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
    Search,
    Filter,
    Download,
    RefreshCw,
    Eye,
    User,
    Shield,
    Building2,
    CreditCard,
    Settings,
    FileText,
    AlertTriangle,
    CheckCircle,
    XCircle,
    Info,
    Calendar,
    Clock,
    MapPin,
    Monitor,
    Smartphone,
    Plus,
    Edit,
    Trash2,
} from 'lucide-react'
import AuditLogViewer from '@/components/AuditLogViewer'

// Mock data for audit logs
const mockAuditLogs = [
    {
        id: '1',
        timestamp: '2024-01-15T14:30:25Z',
        user: {
            id: 'user1',
            name: 'John Doe',
            email: 'john.doe@example.com',
            avatar: null,
        },
        action: 'user.created',
        actionType: 'CREATE',
        resource: 'User',
        resourceId: 'user_123',
        details: {
            targetUser: 'Sarah Johnson',
            targetEmail: 'sarah.johnson@example.com',
            organization: 'Retail Solutions Inc',
        },
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        location: 'New York, NY',
        status: 'SUCCESS',
        severity: 'INFO',
    },
    {
        id: '2',
        timestamp: '2024-01-15T14:25:10Z',
        user: {
            id: 'user2',
            name: 'Sarah Johnson',
            email: 'sarah.johnson@example.com',
            avatar: null,
        },
        action: 'merchant.updated',
        actionType: 'UPDATE',
        resource: 'Merchant',
        resourceId: 'merchant_456',
        details: {
            merchantName: 'TechCorp Store',
            changes: ['business_name', 'contact_email', 'address'],
            previousValues: {
                business_name: 'TechCorp',
                contact_email: 'old@techcorp.com',
            },
        },
        ipAddress: '10.0.0.50',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        location: 'Los Angeles, CA',
        status: 'SUCCESS',
        severity: 'INFO',
    },
    {
        id: '3',
        timestamp: '2024-01-15T14:20:45Z',
        user: {
            id: 'user3',
            name: 'Mike Chen',
            email: 'mike.chen@example.com',
            avatar: null,
        },
        action: 'role.permissions.updated',
        actionType: 'UPDATE',
        resource: 'Role',
        resourceId: 'role_789',
        details: {
            roleName: 'Manager',
            addedPermissions: ['merchants.create', 'analytics.read'],
            removedPermissions: ['users.delete'],
        },
        ipAddress: '172.16.0.25',
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
        location: 'San Francisco, CA',
        status: 'SUCCESS',
        severity: 'WARNING',
    },
    {
        id: '4',
        timestamp: '2024-01-15T14:15:30Z',
        user: {
            id: 'user4',
            name: 'Emily Wilson',
            email: 'emily.wilson@example.com',
            avatar: null,
        },
        action: 'login.failed',
        actionType: 'AUTH',
        resource: 'Authentication',
        resourceId: null,
        details: {
            reason: 'Invalid password',
            attempts: 3,
        },
        ipAddress: '203.0.113.45',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
        location: 'Chicago, IL',
        status: 'FAILED',
        severity: 'WARNING',
    },
    {
        id: '5',
        timestamp: '2024-01-15T14:10:15Z',
        user: {
            id: 'user5',
            name: 'David Brown',
            email: 'david.brown@example.com',
            avatar: null,
        },
        action: 'organization.deleted',
        actionType: 'DELETE',
        resource: 'Organization',
        resourceId: 'org_101',
        details: {
            organizationName: 'StartupXYZ',
            merchantCount: 5,
            userCount: 12,
        },
        ipAddress: '198.51.100.75',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        location: 'Austin, TX',
        status: 'SUCCESS',
        severity: 'ERROR',
    },
    {
        id: '6',
        timestamp: '2024-01-15T14:05:00Z',
        user: {
            id: 'user1',
            name: 'John Doe',
            email: 'john.doe@example.com',
            avatar: null,
        },
        action: 'system.settings.updated',
        actionType: 'UPDATE',
        resource: 'System Settings',
        resourceId: 'settings_global',
        details: {
            settings: ['session_timeout', 'password_policy', 'audit_retention'],
            previousValues: {
                session_timeout: '8 hours',
                password_policy: 'medium',
            },
        },
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        location: 'New York, NY',
        status: 'SUCCESS',
        severity: 'INFO',
    },
]

const actionTypes = {
    CREATE: { label: 'Create', icon: Plus, color: 'bg-green-100 text-green-800' },
    UPDATE: { label: 'Update', icon: Edit, color: 'bg-blue-100 text-blue-800' },
    DELETE: { label: 'Delete', icon: Trash2, color: 'bg-red-100 text-red-800' },
    AUTH: { label: 'Authentication', icon: Shield, color: 'bg-purple-100 text-purple-800' },
    READ: { label: 'Read', icon: Eye, color: 'bg-gray-100 text-gray-800' },
}

const severityColors = {
    INFO: 'bg-blue-100 text-blue-800',
    WARNING: 'bg-yellow-100 text-yellow-800',
    ERROR: 'bg-red-100 text-red-800',
    CRITICAL: 'bg-red-200 text-red-900',
}

const statusColors = {
    SUCCESS: 'bg-green-100 text-green-800',
    FAILED: 'bg-red-100 text-red-800',
    PENDING: 'bg-yellow-100 text-yellow-800',
}

const resourceIcons = {
    User: User,
    Merchant: CreditCard,
    Organization: Building2,
    Role: Shield,
    'System Settings': Settings,
    Authentication: Shield,
}

export default function AuditLogsPage() {
    const [searchTerm, setSearchTerm] = useState('')
    const [actionFilter, setActionFilter] = useState('all')
    const [severityFilter, setSeverityFilter] = useState('all')
    const [statusFilter, setStatusFilter] = useState('all')
    const [dateRange, setDateRange] = useState('today')

    const filteredLogs = mockAuditLogs.filter(log => {
        const matchesSearch =
            log.user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            log.user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
            log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
            log.resource.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (log.details && JSON.stringify(log.details).toLowerCase().includes(searchTerm.toLowerCase()))

        const matchesAction = actionFilter === 'all' || log.actionType === actionFilter
        const matchesSeverity = severityFilter === 'all' || log.severity === severityFilter
        const matchesStatus = statusFilter === 'all' || log.status === statusFilter

        return matchesSearch && matchesAction && matchesSeverity && matchesStatus
    })

    const formatTimestamp = (timestamp: string) => {
        const date = new Date(timestamp)
        return {
            date: date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
            }),
            time: date.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
            }),
        }
    }

    const getInitials = (name: string) => {
        return name.split(' ').map(n => n.charAt(0)).join('').toUpperCase()
    }

    const getDeviceIcon = (userAgent: string) => {
        if (userAgent.includes('iPhone') || userAgent.includes('Android')) {
            return Smartphone
        }
        return Monitor
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Audit Logs</h1>
                    <p className="text-muted-foreground">
                        Monitor and track all system activities, user actions, and security events.
                    </p>
                </div>
                <div className="flex space-x-2">
                    <Button variant="outline">
                        <Download className="mr-2 h-4 w-4" />
                        Export
                    </Button>
                    <Button variant="outline">
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Refresh
                    </Button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Events</CardTitle>
                        <FileText className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{mockAuditLogs.length}</div>
                        <p className="text-xs text-muted-foreground">
                            +12 from yesterday
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Failed Events</CardTitle>
                        <XCircle className="h-4 w-4 text-red-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {mockAuditLogs.filter(log => log.status === 'FAILED').length}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Requires attention
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">High Severity</CardTitle>
                        <AlertTriangle className="h-4 w-4 text-yellow-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {mockAuditLogs.filter(log => log.severity === 'WARNING' || log.severity === 'ERROR').length}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Security events
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Users</CardTitle>
                        <User className="h-4 w-4 text-green-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {new Set(mockAuditLogs.map(log => log.user.id)).size}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Unique users today
                        </p>
                    </CardContent>
                </Card>
            </div>

            <Tabs defaultValue="logs" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="logs">Audit Logs</TabsTrigger>
                    <TabsTrigger value="security">Security Events</TabsTrigger>
                    <TabsTrigger value="analytics">Analytics</TabsTrigger>
                </TabsList>

                <TabsContent value="logs" className="space-y-4">
                    {/* Filters */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Filter Logs</CardTitle>
                            <CardDescription>
                                Search and filter audit logs by various criteria.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-col gap-4 md:flex-row md:items-center">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        placeholder="Search logs..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="pl-9"
                                    />
                                </div>
                                <div className="flex gap-2">
                                    <Select value={actionFilter} onValueChange={setActionFilter}>
                                        <SelectTrigger className="w-[140px]">
                                            <SelectValue placeholder="Action" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Actions</SelectItem>
                                            <SelectItem value="CREATE">Create</SelectItem>
                                            <SelectItem value="UPDATE">Update</SelectItem>
                                            <SelectItem value="DELETE">Delete</SelectItem>
                                            <SelectItem value="AUTH">Authentication</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <Select value={severityFilter} onValueChange={setSeverityFilter}>
                                        <SelectTrigger className="w-[140px]">
                                            <SelectValue placeholder="Severity" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Severity</SelectItem>
                                            <SelectItem value="INFO">Info</SelectItem>
                                            <SelectItem value="WARNING">Warning</SelectItem>
                                            <SelectItem value="ERROR">Error</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                                        <SelectTrigger className="w-[140px]">
                                            <SelectValue placeholder="Status" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Status</SelectItem>
                                            <SelectItem value="SUCCESS">Success</SelectItem>
                                            <SelectItem value="FAILED">Failed</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Audit Logs Table */}
                    <Card>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Timestamp</TableHead>
                                        <TableHead>User</TableHead>
                                        <TableHead>Action</TableHead>
                                        <TableHead>Resource</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Severity</TableHead>
                                        <TableHead>Location</TableHead>
                                        <TableHead className="w-[50px]"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredLogs.map((log) => {
                                        const { date, time } = formatTimestamp(log.timestamp)
                                        const ActionIcon = actionTypes[log.actionType as keyof typeof actionTypes]?.icon || Info
                                        const ResourceIcon = resourceIcons[log.resource as keyof typeof resourceIcons] || FileText
                                        const DeviceIcon = getDeviceIcon(log.userAgent)

                                        return (
                                            <TableRow key={log.id}>
                                                <TableCell>
                                                    <div className="space-y-1">
                                                        <div className="text-sm font-medium">{date}</div>
                                                        <div className="text-xs text-muted-foreground flex items-center">
                                                            <Clock className="h-3 w-3 mr-1" />
                                                            {time}
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center space-x-3">
                                                        <Avatar className="h-8 w-8">
                                                            <AvatarImage src={log.user.avatar || ''} alt={log.user.name} />
                                                            <AvatarFallback>{getInitials(log.user.name)}</AvatarFallback>
                                                        </Avatar>
                                                        <div>
                                                            <div className="font-medium text-sm">{log.user.name}</div>
                                                            <div className="text-xs text-muted-foreground">{log.user.email}</div>
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center space-x-2">
                                                        <ActionIcon className="h-4 w-4 text-muted-foreground" />
                                                        <div>
                                                            <div className="text-sm font-medium">{log.action}</div>
                                                            <Badge variant="outline" className="text-xs">
                                                                {actionTypes[log.actionType as keyof typeof actionTypes]?.label || log.actionType}
                                                            </Badge>
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center space-x-2">
                                                        <ResourceIcon className="h-4 w-4 text-muted-foreground" />
                                                        <div>
                                                            <div className="text-sm">{log.resource}</div>
                                                            {log.resourceId && (
                                                                <div className="text-xs text-muted-foreground">{log.resourceId}</div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge className={statusColors[log.status as keyof typeof statusColors]}>
                                                        {log.status}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge className={severityColors[log.severity as keyof typeof severityColors]}>
                                                        {log.severity}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center space-x-1 text-xs text-muted-foreground">
                                                        <MapPin className="h-3 w-3" />
                                                        <span>{log.location}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <Button variant="ghost" size="icon">
                                                        <Eye className="h-4 w-4" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                    {/* <AuditLogViewer /> */}
                </TabsContent>

                <TabsContent value="security" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Security Events</CardTitle>
                            <CardDescription>
                                Monitor security-related activities and potential threats.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {mockAuditLogs
                                    .filter(log => log.severity === 'WARNING' || log.severity === 'ERROR' || log.actionType === 'AUTH')
                                    .map((log) => {
                                        const { date, time } = formatTimestamp(log.timestamp)
                                        return (
                                            <div key={log.id} className="flex items-center space-x-4 p-4 border rounded-lg">
                                                <div className={`p-2 rounded-full ${log.severity === 'ERROR' ? 'bg-red-100' :
                                                    log.severity === 'WARNING' ? 'bg-yellow-100' : 'bg-blue-100'
                                                    }`}>
                                                    <AlertTriangle className={`h-4 w-4 ${log.severity === 'ERROR' ? 'text-red-600' :
                                                        log.severity === 'WARNING' ? 'text-yellow-600' : 'text-blue-600'
                                                        }`} />
                                                </div>
                                                <div className="flex-1">
                                                    <div className="flex items-center justify-between">
                                                        <div className="font-medium">{log.action}</div>
                                                        <div className="text-sm text-muted-foreground">{date} {time}</div>
                                                    </div>
                                                    <div className="text-sm text-muted-foreground">
                                                        {log.user.name} • {log.location} • {log.ipAddress}
                                                    </div>
                                                    {log.details && (
                                                        <div className="text-xs text-muted-foreground mt-1">
                                                            {JSON.stringify(log.details, null, 2)}
                                                        </div>
                                                    )}
                                                </div>
                                                <Badge className={severityColors[log.severity as keyof typeof severityColors]}>
                                                    {log.severity}
                                                </Badge>
                                            </div>
                                        )
                                    })}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="analytics" className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                        <Card>
                            <CardHeader>
                                <CardTitle>Activity by Hour</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-center text-muted-foreground py-8">
                                    Chart placeholder - Activity by hour
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader>
                                <CardTitle>Top Actions</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-2">
                                    {['user.created', 'merchant.updated', 'login.success', 'role.permissions.updated', 'organization.deleted'].map((action, index) => (
                                        <div key={action} className="flex items-center justify-between">
                                            <span className="text-sm">{action}</span>
                                            <Badge variant="outline">{Math.floor(Math.random() * 50) + 10}</Badge>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    )
}
