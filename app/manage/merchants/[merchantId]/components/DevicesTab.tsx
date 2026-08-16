'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
    Monitor,
    CreditCard,
    CheckCircle2,
    AlertCircle,
    Search,
    MapPin,
    Plus,
    MoreHorizontal,
    Wifi,
    WifiOff,
    Loader2,
    Trash2,
    Edit,
    Link2,
    Unlink,
    RefreshCw,
    Settings2,
} from 'lucide-react'
import { MerchantDetails } from '@/types/merchant'
import { useState } from 'react'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
    useAdminMerchantStations,
    useAdminMerchantStationStats,
    useAdminMerchantTerminals,
    useAdminMerchantTerminalStats,
    useAdminDeleteStation,
    useAdminDeactivateStation,
    useAdminReactivateStation,
    useAdminDeleteTerminal,
    useAdminTestTerminalConnection,
    useAdminUnlinkTerminal,
} from '@/lib/queries/use-admin-stations'
import type { Station, StationType } from '@/app/manage/actions/admin-merchant/stations'
import type { PaymentTerminal } from '@/app/manage/actions/admin-merchant/payment-terminals'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { AddStationDialog } from './AddStationDialog'
import { AddTerminalDialog } from './AddTerminalDialog'
import { EditTerminalDialog } from './EditTerminalDialog'
import { ConnectedTerminalsPanel } from './ConnectedTerminalsPanel'
import { useAdminPermissions } from '@/lib/hooks/useAdminPermissions'

interface DevicesTabProps {
    merchantInfo: MerchantDetails
    merchantId?: string // Optional override if needed
}

// Helper functions
const getStationTypeLabel = (type: StationType): string => {
    switch (type) {
        case 'register':
            return 'Register'
        case 'checkout':
            return 'Checkout'
        case 'kds':
            return 'Kitchen Display'
        case 'self_service':
            return 'Self-Service'
        default:
            return type
    }
}

const getStationTypeIcon = (type: StationType): string => {
    switch (type) {
        case 'register':
            return '💳'
        case 'checkout':
            return '🛒'
        case 'kds':
            return '🍳'
        case 'self_service':
            return '🖥️'
        default:
            return '📱'
    }
}

const getTerminalTypeLabel = (type: string): string => {
    switch (type) {
        case 'dejavoo':
            return 'Dejavoo'
        case 'pax':
            return 'PAX'
        default:
            return type
    }
}

export function DevicesTab({ merchantInfo }: DevicesTabProps) {
    const merchantId = merchantInfo.id
    const { hasPermission } = useAdminPermissions()
    const canManageDevices = hasPermission('users.manage')
    
    // Local state
    const [selectedLocationId, setSelectedLocationId] = useState<string>('all')
    const [searchTerm, setSearchTerm] = useState('')
    const [activeTab, setActiveTab] = useState<'stations' | 'terminals'>('stations')
    const [isAddStationOpen, setIsAddStationOpen] = useState(false)
    const [isAddTerminalOpen, setIsAddTerminalOpen] = useState(false)
    const [editTerminal, setEditTerminal] = useState<(PaymentTerminal & { location_name: string; station_name: string | null }) | null>(null)

    // Use locations from merchantInfo directly
    const locationsList = merchantInfo.locations || []
    const locationsLoading = false

    // Fetch stations
    const {
        data: stationsResult,
        isLoading: stationsLoading,
        refetch: refetchStations,
    } = useAdminMerchantStations(merchantId, selectedLocationId === 'all' ? null : selectedLocationId)

    // Fetch station stats
    const { data: stationStatsResult } = useAdminMerchantStationStats(
        merchantId,
        selectedLocationId === 'all' ? null : selectedLocationId
    )

    // Fetch terminals
    const {
        data: terminalsResult,
        isLoading: terminalsLoading,
        refetch: refetchTerminals,
    } = useAdminMerchantTerminals(merchantId, selectedLocationId === 'all' ? null : selectedLocationId)

    // Fetch terminal stats
    const { data: terminalStatsResult } = useAdminMerchantTerminalStats(
        merchantId,
        selectedLocationId === 'all' ? null : selectedLocationId
    )

    // Mutations
    const deleteStationMutation = useAdminDeleteStation()
    const deactivateStationMutation = useAdminDeactivateStation()
    const reactivateStationMutation = useAdminReactivateStation()
    const deleteTerminalMutation = useAdminDeleteTerminal()
    const testConnectionMutation = useAdminTestTerminalConnection()
    const unlinkTerminalMutation = useAdminUnlinkTerminal()

    const stations = stationsResult?.data || []
    const terminals = terminalsResult?.data || []
    const stationStats = stationStatsResult?.data
    const terminalStats = terminalStatsResult?.data

    // Filter stations by search
    const filteredStations = stations.filter((station: Station & { location_name: string }) => {
        if (!searchTerm) return true
        const search = searchTerm.toLowerCase()
        return (
            station.station_name.toLowerCase().includes(search) ||
            station.station_code?.toLowerCase().includes(search) ||
            station.location_name.toLowerCase().includes(search)
        )
    })

    // Filter terminals by search
    const filteredTerminals = terminals.filter((terminal: PaymentTerminal & { location_name: string; station_name: string | null }) => {
        if (!searchTerm) return true
        const search = searchTerm.toLowerCase()
        return (
            terminal.terminal_name.toLowerCase().includes(search) ||
            terminal.register_id?.toLowerCase().includes(search) ||
            terminal.location_name.toLowerCase().includes(search)
        )
    })

    // Handlers
    const handleDeleteStation = async (station: Station) => {
        if (!confirm(`Are you sure you want to delete station "${station.station_name}"?`)) return

        try {
            const result = await deleteStationMutation.mutateAsync({
                merchantId,
                stationId: station.id,
            })
            if (result.success) {
                toast.success('Station deleted successfully')
            } else {
                toast.error(result.error || 'Failed to delete station')
            }
        } catch (error) {
            toast.error('Failed to delete station')
        }
    }

    const handleToggleStationStatus = async (station: Station) => {
        try {
            if (station.is_active) {
                const result = await deactivateStationMutation.mutateAsync({
                    merchantId,
                    stationId: station.id,
                })
                if (result.success) {
                    toast.success('Station deactivated')
                } else {
                    toast.error(result.error || 'Failed to deactivate station')
                }
            } else {
                const result = await reactivateStationMutation.mutateAsync({
                    merchantId,
                    stationId: station.id,
                })
                if (result.success) {
                    toast.success('Station reactivated')
                } else {
                    toast.error(result.error || 'Failed to reactivate station')
                }
            }
        } catch (error) {
            toast.error('Failed to update station status')
        }
    }

    const handleDeleteTerminal = async (terminal: PaymentTerminal) => {
        if (!confirm(`Are you sure you want to delete terminal "${terminal.terminal_name}"?`)) return

        try {
            const result = await deleteTerminalMutation.mutateAsync({
                merchantId,
                terminalId: terminal.id,
            })
            if (result.success) {
                toast.success('Terminal deleted successfully')
            } else {
                toast.error(result.error || 'Failed to delete terminal')
            }
        } catch (error) {
            toast.error('Failed to delete terminal')
        }
    }

    const handleTestConnection = async (terminal: PaymentTerminal) => {
        try {
            const result = await testConnectionMutation.mutateAsync({
                merchantId,
                terminalId: terminal.id,
            })
            if (result.success && result.status === 'Online') {
                toast.success('Terminal is online')
            } else {
                toast.error(result.error || 'Terminal is offline')
            }
        } catch (error) {
            toast.error('Failed to test connection')
        }
    }

    const handleUnlinkTerminal = async (terminal: PaymentTerminal) => {
        try {
            const result = await unlinkTerminalMutation.mutateAsync({
                merchantId,
                terminalId: terminal.id,
            })
            if (result.success) {
                toast.success('Terminal unlinked from station')
            } else {
                toast.error(result.error || 'Failed to unlink terminal')
            }
        } catch (error) {
            toast.error('Failed to unlink terminal')
        }
    }

    const isLoading = stationsLoading || terminalsLoading

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                    <h2 className="text-2xl font-bold tracking-tight">Stations & Terminals</h2>
                    <p className="text-muted-foreground">
                        Manage POS stations and payment terminals for this merchant
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <Button variant="outline" size="sm" onClick={() => {
                        refetchStations()
                        refetchTerminals()
                    }}>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Refresh
                    </Button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Stations</CardTitle>
                        <Monitor className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stationStats?.total || 0}</div>
                        <p className="text-xs text-muted-foreground">
                            {stationStats?.active || 0} active
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Online Stations</CardTitle>
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">{stationStats?.online || 0}</div>
                        <p className="text-xs text-muted-foreground">
                            {stationStats?.offline || 0} offline
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Payment Terminals</CardTitle>
                        <CreditCard className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{terminalStats?.total || 0}</div>
                        <p className="text-xs text-muted-foreground">
                            {terminalStats?.assigned || 0} assigned
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Connected Terminals</CardTitle>
                        <Wifi className="h-4 w-4 text-green-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">{terminalStats?.connected || 0}</div>
                        <p className="text-xs text-muted-foreground">
                            {terminalStats?.disconnected || 0} disconnected
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Tabs & Content */}
            <Card>
                <CardHeader>
                    <div className="flex w-full min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'stations' | 'terminals')} className="min-w-0">
                            <div className="overflow-x-auto">
                                <TabsList className="w-max">
                                    <TabsTrigger value="stations">
                                        <Monitor className="h-4 w-4 mr-2" />
                                        Stations ({filteredStations.length})
                                    </TabsTrigger>
                                    <TabsTrigger value="terminals">
                                        <CreditCard className="h-4 w-4 mr-2" />
                                        Payment Terminals ({filteredTerminals.length})
                                    </TabsTrigger>
                                </TabsList>
                            </div>
                        </Tabs>
                        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 lg:w-auto">
                            <div className="relative min-w-[140px] flex-1 sm:flex-none">
                                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-8 w-full sm:w-64"
                                />
                            </div>
                            <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
                                <SelectTrigger className="w-full sm:w-[200px]">
                                    <MapPin className="h-4 w-4 mr-2 shrink-0" />
                                    <SelectValue placeholder="All Locations">
                                        {selectedLocationId === 'all'
                                            ? 'All Locations'
                                            : locationsList.find((loc: any) => loc.id === selectedLocationId)?.name || 'All Locations'
                                        }
                                    </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Locations</SelectItem>
                                    {locationsList.map((location: any) => (
                                        <SelectItem key={location.id} value={location.id}>
                                            {location.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {activeTab === 'stations' && (
                                <Button className="w-full sm:w-auto" onClick={() => setIsAddStationOpen(true)} disabled={!canManageDevices}>
                                    <Plus className="h-4 w-4 mr-2" />
                                    Add Station
                                </Button>
                            )}
                            {activeTab === 'terminals' && (
                                <Button className="w-full sm:w-auto" onClick={() => setIsAddTerminalOpen(true)} disabled={!canManageDevices}>
                                    <Plus className="h-4 w-4 mr-2" />
                                    Add Terminal
                                </Button>
                            )}
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <>
                            {/* Stations Tab Content */}
                            {activeTab === 'stations' && (
                                <>
                                    {filteredStations.length === 0 ? (
                                        <Empty>
                                            <EmptyHeader>
                                                <EmptyMedia variant="icon">
                                                    <Monitor className="h-6 w-6" />
                                                </EmptyMedia>
                                                <EmptyTitle>No stations found</EmptyTitle>
                                                <EmptyDescription>
                                                    {searchTerm || selectedLocationId !== 'all'
                                                        ? 'Try adjusting your filters to see more stations.'
                                                        : 'No stations are registered for this merchant yet.'}
                                                </EmptyDescription>
                                            </EmptyHeader>
                                        </Empty>
                                    ) : (
                                        <div className="overflow-x-auto">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Station</TableHead>
                                                    <TableHead>Type</TableHead>
                                                    <TableHead>Location</TableHead>
                                                    <TableHead>Status</TableHead>
                                                    <TableHead>Device Info</TableHead>
                                                    <TableHead>Last Heartbeat</TableHead>
                                                    <TableHead className="w-[50px]"></TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {filteredStations.map((station: Station & { location_name: string }) => (
                                                    <TableRow key={station.id}>
                                                        <TableCell>
                                                            <div className="flex items-center gap-3">
                                                                <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${
                                                                    station.is_online
                                                                        ? 'bg-green-100 text-green-600'
                                                                        : 'bg-gray-100 text-gray-600'
                                                                }`}>
                                                                    <span className="text-lg">{getStationTypeIcon(station.station_type)}</span>
                                                                </div>
                                                                <div>
                                                                    <div className="font-medium">{station.station_name}</div>
                                                                    {station.station_code && (
                                                                        <div className="text-sm text-muted-foreground">
                                                                            Code: {station.station_code}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Badge variant="outline">
                                                                {getStationTypeLabel(station.station_type)}
                                                            </Badge>
                                                            {station.station_number && (
                                                                <span className="ml-2 text-sm text-muted-foreground">
                                                                    #{station.station_number}
                                                                </span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell>
                                                            <span className="text-sm">{station.location_name}</span>
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="flex flex-col gap-1">
                                                                <Badge variant={station.is_online ? 'default' : 'secondary'}>
                                                                    {station.is_online ? 'Online' : 'Offline'}
                                                                </Badge>
                                                                {!station.is_active && (
                                                                    <Badge variant="destructive">Deactivated</Badge>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            {station.device_name || station.hardware_model ? (
                                                                <div className="text-sm">
                                                                    <div>{station.device_name || '-'}</div>
                                                                    <div className="text-muted-foreground">
                                                                        {station.hardware_model || '-'}
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <span className="text-muted-foreground">-</span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell>
                                                            {station.last_heartbeat_at ? (
                                                                <span className="text-sm text-muted-foreground">
                                                                    {formatDistanceToNow(new Date(station.last_heartbeat_at), { addSuffix: true })}
                                                                </span>
                                                            ) : (
                                                                <span className="text-muted-foreground">-</span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell>
                                                            {canManageDevices ? (
                                                                <DropdownMenu>
                                                                    <DropdownMenuTrigger asChild>
                                                                        <Button variant="ghost" size="icon">
                                                                            <MoreHorizontal className="h-4 w-4" />
                                                                        </Button>
                                                                    </DropdownMenuTrigger>
                                                                    <DropdownMenuContent align="end">
                                                                        <DropdownMenuItem onClick={() => handleToggleStationStatus(station)}>
                                                                            {station.is_active ? (
                                                                                <>
                                                                                    <AlertCircle className="h-4 w-4 mr-2" />
                                                                                    Deactivate
                                                                                </>
                                                                            ) : (
                                                                                <>
                                                                                    <CheckCircle2 className="h-4 w-4 mr-2" />
                                                                                    Reactivate
                                                                                </>
                                                                            )}
                                                                        </DropdownMenuItem>
                                                                        <DropdownMenuSeparator />
                                                                        <DropdownMenuItem
                                                                            className="text-destructive"
                                                                            onClick={() => handleDeleteStation(station)}
                                                                        >
                                                                            <Trash2 className="h-4 w-4 mr-2" />
                                                                            Delete
                                                                        </DropdownMenuItem>
                                                                    </DropdownMenuContent>
                                                                </DropdownMenu>
                                                            ) : (
                                                                <span className="text-xs text-muted-foreground">View only</span>
                                                            )}
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                        </div>
                                    )}
                                </>
                            )}

                            {/* Terminals Tab Content */}
                            {activeTab === 'terminals' && (
                                <>
                                    {/* Unique terminals, deduplicated by serial number (Castles + Valor) */}
                                    <ConnectedTerminalsPanel
                                        merchantId={merchantId}
                                        locationId={selectedLocationId === 'all' ? null : selectedLocationId}
                                    />
                                    {filteredTerminals.length === 0 ? (
                                        <Empty>
                                            <EmptyHeader>
                                                <EmptyMedia variant="icon">
                                                    <CreditCard className="h-6 w-6" />
                                                </EmptyMedia>
                                                <EmptyTitle>No terminals found</EmptyTitle>
                                                <EmptyDescription>
                                                    {searchTerm || selectedLocationId !== 'all'
                                                        ? 'Try adjusting your filters to see more terminals.'
                                                        : 'No payment terminals are registered for this merchant yet.'}
                                                </EmptyDescription>
                                            </EmptyHeader>
                                        </Empty>
                                    ) : (
                                        <div className="overflow-x-auto">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Terminal</TableHead>
                                                    <TableHead>Type</TableHead>
                                                    <TableHead>Register ID</TableHead>
                                                    <TableHead>Environment</TableHead>
                                                    <TableHead>Assigned Station</TableHead>
                                                    <TableHead>Status</TableHead>
                                                    <TableHead className="w-[50px]"></TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {filteredTerminals.map((terminal: PaymentTerminal & { location_name: string; station_name: string | null }) => (
                                                    <TableRow key={terminal.id}>
                                                        <TableCell>
                                                            <div className="flex items-center gap-3">
                                                                <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${
                                                                    terminal.is_connected
                                                                        ? 'bg-green-100 text-green-600'
                                                                        : 'bg-gray-100 text-gray-600'
                                                                }`}>
                                                                    <CreditCard className="h-5 w-5" />
                                                                </div>
                                                                <div>
                                                                    <div className="font-medium">{terminal.terminal_name}</div>
                                                                    <div className="text-sm text-muted-foreground">
                                                                        {terminal.location_name}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Badge variant="outline">
                                                                {getTerminalTypeLabel(terminal.terminal_type)}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell>
                                                            <code className="text-sm bg-muted px-2 py-1 rounded">
                                                                {terminal.register_id}
                                                            </code>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Badge variant={terminal.api_environment === 'production' ? 'default' : 'secondary'}>
                                                                {terminal.api_environment === 'production' ? 'Production' : 'Sandbox'}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell>
                                                            {terminal.station_name ? (
                                                                <div className="flex items-center gap-2">
                                                                    <Link2 className="h-3 w-3 text-muted-foreground" />
                                                                    <span className="text-sm">{terminal.station_name}</span>
                                                                </div>
                                                            ) : (
                                                                <span className="text-muted-foreground">Unassigned</span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="flex items-center gap-2">
                                                                {terminal.is_connected ? (
                                                                    <Badge variant="default" className="bg-green-600">
                                                                        <Wifi className="h-3 w-3 mr-1" />
                                                                        Online
                                                                    </Badge>
                                                                ) : (
                                                                    <Badge variant="secondary">
                                                                        <WifiOff className="h-3 w-3 mr-1" />
                                                                        Offline
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            {canManageDevices ? (
                                                                <DropdownMenu>
                                                                    <DropdownMenuTrigger asChild>
                                                                        <Button variant="ghost" size="icon">
                                                                            <MoreHorizontal className="h-4 w-4" />
                                                                        </Button>
                                                                    </DropdownMenuTrigger>
                                                                    <DropdownMenuContent align="end">
                                                                        <DropdownMenuItem onClick={() => setEditTerminal(terminal)}>
                                                                            <Settings2 className="h-4 w-4 mr-2" />
                                                                            Edit
                                                                        </DropdownMenuItem>
                                                                        <DropdownMenuItem
                                                                            onClick={() => handleTestConnection(terminal)}
                                                                            disabled={testConnectionMutation.isPending}
                                                                        >
                                                                            <RefreshCw className={`h-4 w-4 mr-2 ${testConnectionMutation.isPending ? 'animate-spin' : ''}`} />
                                                                            Test Connection
                                                                        </DropdownMenuItem>
                                                                        {terminal.station_id && (
                                                                            <DropdownMenuItem onClick={() => handleUnlinkTerminal(terminal)}>
                                                                                <Unlink className="h-4 w-4 mr-2" />
                                                                                Unlink from Station
                                                                            </DropdownMenuItem>
                                                                        )}
                                                                        <DropdownMenuSeparator />
                                                                        <DropdownMenuItem
                                                                            className="text-destructive"
                                                                            onClick={() => handleDeleteTerminal(terminal)}
                                                                        >
                                                                            <Trash2 className="h-4 w-4 mr-2" />
                                                                            Delete
                                                                        </DropdownMenuItem>
                                                                    </DropdownMenuContent>
                                                                </DropdownMenu>
                                                            ) : (
                                                                <span className="text-xs text-muted-foreground">View only</span>
                                                            )}
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                        </div>
                                    )}
                                </>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>

            {/* Add Station Dialog */}
            <AddStationDialog
                open={isAddStationOpen}
                onOpenChange={setIsAddStationOpen}
                merchantId={merchantId}
                locations={locationsList}
            />

            {/* Add Terminal Dialog */}
            <AddTerminalDialog
                open={isAddTerminalOpen}
                onOpenChange={setIsAddTerminalOpen}
                merchantId={merchantId}
                locations={locationsList}
                stations={stations}
            />

            {/* Edit Terminal Dialog (serial + auto-settle config) */}
            <EditTerminalDialog
                open={!!editTerminal}
                onOpenChange={(open) => { if (!open) setEditTerminal(null) }}
                merchantId={merchantId}
                terminal={editTerminal}
            />
        </div>
    )
}
