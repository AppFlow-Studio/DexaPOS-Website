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
import { usePlatformAuditLogs } from '@/lib/queries/use-platform-analytics'
import { format } from 'date-fns'
import { Skeleton } from '@/components/ui/skeleton'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'

const severityColors = {
    info: 'bg-blue-100 text-blue-800',
    warning: 'bg-yellow-100 text-yellow-800',
    error: 'bg-red-100 text-red-800',
    critical: 'bg-red-200 text-red-900',
}

const statusColors = {
    success: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
    pending: 'bg-yellow-100 text-yellow-800',
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
    const [page, setPage] = useState(1)
    const [selectedLog, setSelectedLog] = useState<any>(null)
    const [isDetailOpen, setIsDetailOpen] = useState(false)

    const { data: auditLogsData, isLoading, refetch } = usePlatformAuditLogs({
        search: searchTerm,
        action_category: actionFilter !== 'all' ? actionFilter : undefined,
        severity: severityFilter !== 'all' ? severityFilter : undefined
    }, 50, (page - 1) * 50)

    const logs = auditLogsData?.data || []
    const totalLogs = auditLogsData?.total || 0

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
                        <div className="text-2xl font-bold">{totalLogs.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">
                            Platform-wide log stream
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Critical Errors</CardTitle>
                        <XCircle className="h-4 w-4 text-red-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {logs.filter(log => log.severity === 'critical').length}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Requiring immediate attention
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Security Alarms</CardTitle>
                        <AlertTriangle className="h-4 w-4 text-yellow-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {logs.filter(log => log.action_category === 'security' || log.severity === 'warning').length}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            High-risk activity flags
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Organizations</CardTitle>
                        <Building2 className="h-4 w-4 text-green-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {new Set(logs.map(log => log.merchant_id)).size}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Broadcasting events today
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
                                            <SelectItem value="info">Info</SelectItem>
                                            <SelectItem value="warning">Warning</SelectItem>
                                            <SelectItem value="error">Error</SelectItem>
                                            <SelectItem value="critical">Critical</SelectItem>
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
                                    {isLoading ? (
                                        Array.from({ length: 5 }).map((_, i) => (
                                            <TableRow key={i}>
                                                <TableCell colSpan={8}><Skeleton className="h-10 w-full" /></TableCell>
                                            </TableRow>
                                        ))
                                    ) : logs.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                                                No audit logs found.
                                            </TableCell>
                                        </TableRow>
                                    ) : logs.map((log) => {
                                        const ActionIcon = Shield 

                                        return (
                                            <TableRow key={log.id}>
                                                <TableCell>
                                                    <div className="space-y-1">
                                                        <div className="text-sm font-medium text-nowrap">
                                                            {format(new Date(log.created_at), 'MMM d, yyyy')}
                                                        </div>
                                                        <div className="text-xs text-muted-foreground flex items-center">
                                                            <Clock className="h-3 w-3 mr-1" />
                                                            {format(new Date(log.created_at), 'h:mm:ss a')}
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center space-x-3">
                                                        <Avatar className="h-8 w-8">
                                                            <AvatarFallback>{log.actor_name?.[0]}</AvatarFallback>
                                                        </Avatar>
                                                        <div>
                                                            <div className="font-medium text-sm">{log.actor_name}</div>
                                                            <div className="text-xs text-muted-foreground">{log.merchants.business_name}</div>
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center space-x-2">
                                                        <ActionIcon className="h-4 w-4 text-muted-foreground" />
                                                        <div>
                                                            <div className="text-sm font-medium">{log.action}</div>
                                                            <Badge variant="outline" className="text-xs capitalize">
                                                                {log.action_category}
                                                            </Badge>
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center space-x-2">
                                                        <FileText className="h-4 w-4 text-muted-foreground" />
                                                        <div>
                                                            <div className="text-sm">{log.resource_type}</div>
                                                            {log.resource_name && (
                                                                <div className="text-xs text-muted-foreground max-w-[150px] truncate">{log.resource_name}</div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                     <Badge className={statusColors.success}>SUCCESS</Badge>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge className={severityColors[log.severity as keyof typeof severityColors]}>
                                                        {log.severity}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center space-x-1 text-xs text-muted-foreground">
                                                        <MapPin className="h-3 w-3" />
                                                        <span>{log.location?.name || 'Global'}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <Button variant="ghost" size="icon" onClick={() => {
                                                        setSelectedLog(log);
                                                        setIsDetailOpen(true);
                                                    }}>
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
                    
                    <Sheet open={isDetailOpen} onOpenChange={setIsDetailOpen}>
                        <SheetContent className="sm:max-w-xl">
                            <SheetHeader>
                                <SheetTitle>Log Details</SheetTitle>
                                <SheetDescription>
                                    Technical data for event {selectedLog?.id}
                                </SheetDescription>
                            </SheetHeader>
                            <ScrollArea className="h-[calc(100vh-120px)] mt-6">
                                <div className="space-y-6 pb-6">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <p className="text-xs text-muted-foreground uppercase font-semibold">Action</p>
                                            <p className="text-sm font-medium mt-1">{selectedLog?.action}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-muted-foreground uppercase font-semibold">Severity</p>
                                            <Badge className={`mt-1 ${severityColors[selectedLog?.severity as keyof typeof severityColors]}`}>
                                                {selectedLog?.severity}
                                            </Badge>
                                        </div>
                                        <div>
                                            <p className="text-xs text-muted-foreground uppercase font-semibold">Actor</p>
                                            <p className="text-sm font-medium mt-1">{selectedLog?.actor_name}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-muted-foreground uppercase font-semibold">Merchant</p>
                                            <p className="text-sm font-medium mt-1">{selectedLog?.merchants?.business_name}</p>
                                        </div>
                                    </div>

                                    {selectedLog?.changes && (
                                        <div className="space-y-3">
                                            <p className="text-xs text-muted-foreground uppercase font-semibold">Data Changes</p>
                                            <div className="bg-muted p-4 rounded-lg overflow-hidden">
                                                <pre className="text-xs font-mono overflow-auto max-h-[400px]">
                                                    {JSON.stringify(selectedLog.changes, null, 2)}
                                                </pre>
                                            </div>
                                        </div>
                                    )}

                                    {selectedLog?.metadata && (
                                        <div className="space-y-3">
                                            <p className="text-xs text-muted-foreground uppercase font-semibold">Metadata</p>
                                            <div className="bg-muted p-4 rounded-lg overflow-hidden">
                                                <pre className="text-xs font-mono overflow-auto max-h-[400px]">
                                                    {JSON.stringify(selectedLog.metadata, null, 2)}
                                                </pre>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </ScrollArea>
                        </SheetContent>
                    </Sheet>
                </TabsContent>

                <TabsContent value="security" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Global Security Feed</CardTitle>
                            <CardDescription>
                                Significant security events across all merchants.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {logs
                                    .filter((log: any) => log.severity === 'critical' || log.severity === 'warning' || log.action_category === 'security')
                                    .map((log: any) => {
                                        return (
                                            <div key={log.id} className="flex items-center space-x-4 p-4 border rounded-lg">
                                                <div className={`p-2 rounded-full ${log.severity === 'critical' ? 'bg-red-100' :
                                                    log.severity === 'warning' ? 'bg-yellow-100' : 'bg-blue-100'
                                                    }`}>
                                                    <AlertTriangle className={`h-4 w-4 ${log.severity === 'critical' ? 'text-red-600' :
                                                        log.severity === 'warning' ? 'text-yellow-600' : 'text-blue-600'
                                                        }`} />
                                                </div>
                                                <div className="flex-1">
                                                    <div className="flex items-center justify-between">
                                                        <div className="font-medium">{log.action}</div>
                                                        <div className="text-sm text-muted-foreground">{format(new Date(log.created_at), 'MMM d, h:mm a')}</div>
                                                    </div>
                                                    <div className="text-sm text-muted-foreground">
                                                        {log.actor_name} • {log.merchants?.business_name} • {log.resource_type}
                                                    </div>
                                                </div>
                                                <Badge className={severityColors[log.severity as keyof typeof severityColors]}>
                                                    {log.severity}
                                                </Badge>
                                            </div>
                                        )
                                    })}
                                {logs.filter((log: any) => log.severity === 'critical' || log.severity === 'warning' || log.action_category === 'security').length === 0 && (
                                    <div className="text-center py-10 text-muted-foreground">
                                        No security events recorded in this period.
                                    </div>
                                )}
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
