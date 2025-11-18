'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import {
    Monitor,
    Smartphone,
    Printer,
    Wifi,
    Cable,
    CheckCircle2,
    AlertCircle,
    MessageCircle,
    Search,
    Settings,
    MapPin,
    Clock,
    Network,
    ArrowUpDown
} from 'lucide-react'
import { MerchantInfoModel } from '@/types/db-modles'
import { useQuery } from '@tanstack/react-query'
import { GetLocations } from '../../../../dashboard/actions/get-locations'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useParams } from 'next/navigation'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

interface DevicesTabProps {
    merchantInfo: MerchantInfoModel
}

// Device types
type DeviceType = 'terminal' | 'handheld' | 'printer' | 'processor' | 'tablet'
type DeviceStatus = 'online' | 'offline'
type ConnectionType = 'usb-c' | 'ethernet' | 'wifi'

interface Device {
    id: string
    name: string
    model: string
    type: DeviceType
    status: DeviceStatus
    statusDuration?: string // e.g., "For 10 minutes"
    alerts: number
    serialNumber: string
    lastSeen: string
    enabledConnections: ConnectionType[]
    wifiNetworkName?: string
    ipAddress: string
    locationId: string
    locationName: string
    tags?: string[]
}

// Mock devices data
const mockDevices: Device[] = [
    {
        id: '1',
        name: 'quick order',
        model: '14" Toast Flex',
        type: 'terminal',
        status: 'online',
        alerts: 0,
        serialNumber: 'LS7222CE40847',
        lastSeen: 'Nov 17, 2025, 5:42 PM EST',
        enabledConnections: ['usb-c', 'ethernet'],
        ipAddress: '192.168.192.3',
        locationId: 'loc-1',
        locationName: 'Main Location',
        tags: ['LOCAL HUB', 'AUTO-FIRE']
    },
    {
        id: '2',
        name: 'terminal_pick up',
        model: '14" Toast Flex',
        type: 'terminal',
        status: 'online',
        alerts: 0,
        serialNumber: 'LS72227A40835',
        lastSeen: 'Nov 17, 2025, 5:41 PM EST',
        enabledConnections: ['wifi'],
        wifiNetworkName: 'CHOCOLATE_FACTORY_TOAST',
        ipAddress: '192.168.192.24',
        locationId: 'loc-1',
        locationName: 'Main Location'
    },
    {
        id: '3',
        name: 'Quick Order',
        model: 'Toast Go 2',
        type: 'handheld',
        status: 'offline',
        statusDuration: 'For 10 minutes',
        alerts: 0,
        serialNumber: 'TKE34932581',
        lastSeen: 'Nov 17, 2025, 5:32 PM EST',
        enabledConnections: ['wifi'],
        wifiNetworkName: 'CHOCOLATE_FACTORY_TOAST',
        ipAddress: '192.168.192.5',
        locationId: 'loc-1',
        locationName: 'Main Location'
    },
    {
        id: '4',
        name: 'Kitchen - X855049243',
        model: 'M30 - Epson Receipt Printer',
        type: 'printer',
        status: 'online',
        alerts: 0,
        serialNumber: 'X855049243',
        lastSeen: 'Nov 17, 2025, 4:38 PM EST',
        enabledConnections: [],
        ipAddress: '192.168.192.21',
        locationId: 'loc-1',
        locationName: 'Main Location',
        tags: ['Wired or Wireless']
    },
    {
        id: '5',
        name: 'Receipt - 24017A12517',
        model: 'TP200 - Toast Receipt Printer',
        type: 'printer',
        status: 'online',
        alerts: 0,
        serialNumber: '24017A12517',
        lastSeen: 'Nov 17, 2025, 3:28 PM EST',
        enabledConnections: [],
        ipAddress: '192.168.192.2',
        locationId: 'loc-1',
        locationName: 'Main Location'
    },
    {
        id: '6',
        name: 'Crepe & Waffle KP',
        model: '14" Toast Flex',
        type: 'terminal',
        status: 'online',
        alerts: 1,
        serialNumber: 'LS7222CE40848',
        lastSeen: 'Nov 17, 2025, 5:40 PM EST',
        enabledConnections: ['ethernet'],
        ipAddress: '192.168.192.4',
        locationId: 'loc-2',
        locationName: 'Downtown Branch'
    },
]

const getDeviceIcon = (type: DeviceType) => {
    switch (type) {
        case 'terminal':
            return Monitor
        case 'handheld':
            return Smartphone
        case 'printer':
            return Printer
        case 'tablet':
            return Smartphone
        default:
            return Monitor
    }
}

const getConnectionIcon = (connection: ConnectionType) => {
    switch (connection) {
        case 'wifi':
            return Wifi
        case 'usb-c':
        case 'ethernet':
            return Cable
        default:
            return Network
    }
}

const getConnectionLabel = (connection: ConnectionType) => {
    switch (connection) {
        case 'usb-c':
            return 'USB-C'
        case 'ethernet':
            return 'Ethernet'
        case 'wifi':
            return 'Wi-Fi'
        default:
            return connection
    }
}

export function DevicesTab({ merchantInfo }: DevicesTabProps) {
    const router = useRouter()
    const params = useParams()
    const merchantId = params.merchantId as string
    const clerkOrgId = merchantInfo?.clerk_org_id
    const { data: locations, isLoading: locationsLoading } = useQuery({
        queryKey: ['merchant-locations', clerkOrgId],
        queryFn: () => GetLocations(clerkOrgId || ''),
        enabled: !!clerkOrgId,
    })

    const locationsList = Array.isArray(locations) ? locations : []
    const [selectedLocationId, setSelectedLocationId] = useState<string>('all')
    const [searchTerm, setSearchTerm] = useState('')

    // Filter devices by location and search
    const filteredDevices = mockDevices.filter(device => {
        const matchesLocation = selectedLocationId === 'all' || device.locationId === selectedLocationId
        const matchesSearch = searchTerm === '' ||
            device.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            device.model.toLowerCase().includes(searchTerm.toLowerCase()) ||
            device.serialNumber.toLowerCase().includes(searchTerm.toLowerCase())
        return matchesLocation && matchesSearch
    })

    // Get unique location IDs from devices
    const deviceLocations = Array.from(new Set(mockDevices.map(d => d.locationId)))
        .map(locId => {
            const device = mockDevices.find(d => d.locationId === locId)
            return {
                id: locId,
                name: device?.locationName || 'Unknown Location'
            }
        })

    // Stats
    const totalDevices = filteredDevices.length
    const onlineDevices = filteredDevices.filter(d => d.status === 'online').length
    const offlineDevices = filteredDevices.filter(d => d.status === 'offline').length
    const devicesWithAlerts = filteredDevices.filter(d => d.alerts > 0).length

    return (
        <div className="space-y-6">
            {/* Header with Filters */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Devices Hub</h2>
                    <p className="text-muted-foreground">
                        Manage and monitor all POS devices, printers, and terminals
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm">
                        <Settings className="h-4 w-4 mr-2" />
                        Columns
                    </Button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Devices</CardTitle>
                        <Monitor className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{totalDevices}</div>
                        <p className="text-xs text-muted-foreground">
                            {selectedLocationId === 'all' ? 'All locations' : 'Filtered location'}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Online</CardTitle>
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">{onlineDevices}</div>
                        <p className="text-xs text-muted-foreground">
                            {totalDevices > 0 ? Math.round((onlineDevices / totalDevices) * 100) : 0}% of total
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Offline</CardTitle>
                        <AlertCircle className="h-4 w-4 text-red-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-600">{offlineDevices}</div>
                        <p className="text-xs text-muted-foreground">
                            Requires attention
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Alerts</CardTitle>
                        <AlertCircle className="h-4 w-4 text-yellow-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-yellow-600">{devicesWithAlerts}</div>
                        <p className="text-xs text-muted-foreground">
                            Devices with issues
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Filters */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle>Devices</CardTitle>
                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search devices..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-8 w-64"
                                />
                            </div>
                            <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
                                <SelectTrigger className="w-[200px]">
                                    <MapPin className="h-4 w-4 mr-2" />
                                    <SelectValue placeholder="All Locations">
                                        {selectedLocationId === 'all'
                                            ? 'All Locations'
                                            : deviceLocations.find(loc => loc.id === selectedLocationId)?.name || 'All Locations'
                                        }
                                    </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Locations</SelectItem>
                                    {deviceLocations.map((location) => (
                                        <SelectItem key={location.id} value={location.id}>
                                            {location.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {filteredDevices.length === 0 ? (
                        <Empty>
                            <EmptyHeader>
                                <EmptyMedia variant="icon">
                                    <Monitor className="h-6 w-6" />
                                </EmptyMedia>
                                <EmptyTitle>No devices found</EmptyTitle>
                                <EmptyDescription>
                                    {searchTerm || selectedLocationId !== 'all'
                                        ? 'Try adjusting your filters to see more devices.'
                                        : 'No devices are registered for this merchant yet.'}
                                </EmptyDescription>
                            </EmptyHeader>
                        </Empty>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>
                                        <div className="flex items-center gap-1">
                                            Device name
                                            <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                                        </div>
                                    </TableHead>
                                    <TableHead>
                                        <div className="flex items-center gap-1">
                                            Device status
                                            <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                                        </div>
                                    </TableHead>
                                    <TableHead>
                                        <div className="flex items-center gap-1">
                                            Alerts
                                            <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                                        </div>
                                    </TableHead>
                                    <TableHead>Get help</TableHead>
                                    <TableHead>
                                        <div className="flex items-center gap-1">
                                            Serial number
                                            <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                                        </div>
                                    </TableHead>
                                    <TableHead>
                                        <div className="flex items-center gap-1">
                                            Last seen
                                            <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                                        </div>
                                    </TableHead>
                                    <TableHead>Enabled connections</TableHead>
                                    <TableHead>
                                        <div className="flex items-center gap-1">
                                            IP address
                                            <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                                        </div>
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredDevices.map((device) => {
                                    const DeviceIcon = getDeviceIcon(device.type)
                                    return (
                                        <TableRow
                                            key={device.id}
                                            className="cursor-pointer hover:bg-muted/50"
                                            onClick={() => router.push(`/manage/merchants/${merchantId}/devices/${device.id}`)}
                                        >
                                            {/* Device Name */}
                                            <TableCell>
                                                <div className="flex items-center gap-3">
                                                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${device.status === 'online'
                                                        ? 'bg-green-100 text-green-600'
                                                        : 'bg-red-100 text-red-600'
                                                        }`}>
                                                        <DeviceIcon className="h-5 w-5" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="font-medium">{device.name}</div>
                                                        <div className="text-sm text-muted-foreground">{device.model}</div>
                                                        {device.tags && device.tags.length > 0 && (
                                                            <div className="flex flex-wrap gap-1 mt-1">
                                                                {device.tags.map((tag, idx) => (
                                                                    <Badge key={idx} variant="outline" className="text-xs">
                                                                        {tag}
                                                                    </Badge>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </TableCell>

                                            {/* Device Status */}
                                            <TableCell>
                                                <div className="flex flex-col gap-1">
                                                    <Badge
                                                        variant={device.status === 'online' ? 'default' : 'destructive'}
                                                        className="w-fit"
                                                    >
                                                        {device.status.toUpperCase()}
                                                    </Badge>
                                                    {device.statusDuration && (
                                                        <span className="text-xs text-muted-foreground">
                                                            {device.statusDuration}
                                                        </span>
                                                    )}
                                                </div>
                                            </TableCell>

                                            {/* Alerts */}
                                            <TableCell>
                                                <div className="flex items-center gap-1">
                                                    {device.alerts === 0 ? (
                                                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                                                    ) : (
                                                        <AlertCircle className="h-4 w-4 text-yellow-600" />
                                                    )}
                                                    <span className="font-medium">{device.alerts}</span>
                                                </div>
                                            </TableCell>

                                            {/* Get Help */}
                                            <TableCell>
                                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                                    <MessageCircle className="h-4 w-4 text-blue-600" />
                                                </Button>
                                            </TableCell>

                                            {/* Serial Number */}
                                            <TableCell>
                                                <span className="font-mono text-sm">{device.serialNumber}</span>
                                            </TableCell>

                                            {/* Last Seen */}
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="text-sm">{device.lastSeen.split(',')[0]}</span>
                                                    <span className="text-xs text-muted-foreground">{device.lastSeen.split(',')[1]?.trim()}</span>
                                                </div>
                                            </TableCell>

                                            {/* Enabled Connections */}
                                            <TableCell>
                                                {device.enabledConnections.length === 0 ? (
                                                    <span className="text-muted-foreground">--</span>
                                                ) : (
                                                    <div className="flex flex-col gap-1">
                                                        {device.enabledConnections.map((conn, idx) => {
                                                            const ConnIcon = getConnectionIcon(conn)
                                                            return (
                                                                <div key={idx} className="flex items-center gap-1.5">
                                                                    <CheckCircle2 className="h-3 w-3 text-green-600" />
                                                                    <ConnIcon className="h-3 w-3 text-muted-foreground" />
                                                                    <span className="text-xs">{getConnectionLabel(conn)}</span>
                                                                </div>
                                                            )
                                                        })}
                                                        {device.wifiNetworkName && (
                                                            <div className="text-xs text-muted-foreground mt-1">
                                                                {device.wifiNetworkName}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </TableCell>

                                            {/* IP Address */}
                                            <TableCell>
                                                <span className="font-mono text-sm">{device.ipAddress}</span>
                                            </TableCell>
                                        </TableRow>
                                    )
                                })}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* Data Freshness Indicator */}
            <div className="flex items-center justify-end text-xs text-muted-foreground">
                <span>
                    Data as of {new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}, {new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })} EST
                </span>
            </div>
        </div>
    )
}
