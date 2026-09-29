'use client'

import { Panel } from '@/components/dashboard/shell/Panel'
import { PanelSection } from '@/components/dashboard/shell/PanelSection'
import { StatRow, StatTile } from '@/components/dashboard/shell/StatTile'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PaginationBar } from '@/components/dashboard/PaginationBar'
import { useClientPagination } from '@/lib/hooks/useClientPagination'
import {
    Monitor,
    CreditCard,
    CheckCircle2,
    AlertCircle,
    Search,
    Plus,
    MoreHorizontal,
    Wifi,
    WifiOff,
    Trash2,
    Link2,
    Unlink,
    RefreshCw,
    Settings2,
    ShoppingCart,
    ChefHat,
    TabletSmartphone,
    Smartphone,
    type LucideIcon,
} from 'lucide-react'
import { MerchantDetails } from '@/types/merchant'
import { useState } from 'react'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
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

type StationRow = Station & { location_name: string }
type TerminalRow = PaymentTerminal & { location_name: string; station_name: string | null }

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

// A neutral glyph, not a coloured emoji: the plate is a record's identity
// (§3.5), so it stays `bg-muted text-muted-foreground`.
const getStationTypeIcon = (type: StationType): LucideIcon => {
    switch (type) {
        case 'register':
            return Monitor
        case 'checkout':
            return ShoppingCart
        case 'kds':
            return ChefHat
        case 'self_service':
            return TabletSmartphone
        default:
            return Smartphone
    }
}

/** One labelled field inside a mobile device card. */
function DeviceCardField({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="truncate font-medium tabular-nums">{value}</p>
        </div>
    )
}

const getTerminalTypeLabel = (type: string): string => {
    switch (type) {
        case 'dejavoo':
            return 'Dejavoo'
        case 'pax':
            return 'PAX'
        case 'castles':
            return 'Castles'
        case 'valor':
            return 'Valor'
        case 'codepay':
            return 'CodePay'
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
    const [editTerminal, setEditTerminal] = useState<TerminalRow | null>(null)

    // Use locations from merchantInfo directly
    const locationsList = merchantInfo.locations || []

    // Fetch stations
    const {
        data: stationsResult,
        isLoading: stationsLoading,
        refetch: refetchStations,
    } = useAdminMerchantStations(merchantId, selectedLocationId === 'all' ? null : selectedLocationId)

    // Fetch station stats
    const { data: stationStatsResult, isLoading: stationStatsLoading } = useAdminMerchantStationStats(
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
    const { data: terminalStatsResult, isLoading: terminalStatsLoading } = useAdminMerchantTerminalStats(
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
    const filteredStations = stations.filter((station: StationRow) => {
        if (!searchTerm) return true
        const search = searchTerm.toLowerCase()
        return (
            station.station_name.toLowerCase().includes(search) ||
            station.station_code?.toLowerCase().includes(search) ||
            station.location_name.toLowerCase().includes(search)
        )
    })

    // Filter terminals by search
    const filteredTerminals = terminals.filter((terminal: TerminalRow) => {
        if (!searchTerm) return true
        const search = searchTerm.toLowerCase()
        return (
            terminal.terminal_name.toLowerCase().includes(search) ||
            terminal.serial_number?.toLowerCase().includes(search) ||
            terminal.register_id?.toLowerCase().includes(search) ||
            terminal.location_name.toLowerCase().includes(search)
        )
    })

    // §5.7: every table is paged; the mobile cards page with it.
    const {
        pageRows: stationPageRows,
        pagination: stationPagination,
        setPage: setStationPage,
    } = useClientPagination<StationRow>(filteredStations, 10)
    const {
        pageRows: terminalPageRows,
        pagination: terminalPagination,
        setPage: setTerminalPage,
    } = useClientPagination<TerminalRow>(filteredTerminals, 10)

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
    const isFiltered = Boolean(searchTerm) || selectedLocationId !== 'all'

    // One actions menu per record, shared by the table row and the mobile card
    // so the phone layout keeps every action (§5.3).
    const renderStationActions = (station: StationRow) => (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 rounded-full p-0" aria-label={`Actions for ${station.station_name}`}>
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
                <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => handleDeleteStation(station)}
                >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )

    const renderTerminalActions = (terminal: TerminalRow) => (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 rounded-full p-0" aria-label={`Actions for ${terminal.terminal_name}`}>
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
                <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => handleDeleteTerminal(terminal)}
                >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )

    const statFigure = (value: number | undefined) => (value === undefined ? '—' : value)

    return (
        <div className="space-y-6">
            {/* Device stats */}
            <Panel>
                <PanelSection
                    label="Stations & Terminals"
                    caption="Manage POS stations and payment terminals for this merchant"
                    action={
                        <Button
                            variant="outline"
                            className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
                            onClick={() => {
                                refetchStations()
                                refetchTerminals()
                            }}
                        >
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Refresh
                        </Button>
                    }
                >
                    {/* Two rows of two, not one row of four: this tab renders beside
                        the merchant nav, which leaves a 4th column ~100px -- narrow
                        enough to truncate "Payment Terminals" and "Connected
                        Terminals". StatRow takes 2|3|4 only (§14.7 trap 6). */}
                    <div className="mt-6 space-y-6">
                        <StatRow columns={2}>
                            <StatTile
                                label="Total Stations"
                                icon={<Monitor />}
                                isLoading={stationStatsLoading}
                                value={statFigure(stationStats?.total)}
                                meta={stationStats ? `${stationStats.active ?? 0} active` : undefined}
                            />
                            <StatTile
                                label="Online Stations"
                                icon={<CheckCircle2 />}
                                isLoading={stationStatsLoading}
                                value={statFigure(stationStats?.online)}
                                meta={stationStats ? `${stationStats.offline ?? 0} offline` : undefined}
                            />
                        </StatRow>
                        <StatRow columns={2}>
                            <StatTile
                                label="Payment Terminals"
                                icon={<CreditCard />}
                                isLoading={terminalStatsLoading}
                                value={statFigure(terminalStats?.total)}
                                meta={terminalStats ? `${terminalStats.assigned ?? 0} assigned` : undefined}
                            />
                            <StatTile
                                label="Connected Terminals"
                                icon={<Wifi />}
                                isLoading={terminalStatsLoading}
                                value={statFigure(terminalStats?.connected)}
                                meta={terminalStats ? `${terminalStats.disconnected ?? 0} disconnected` : undefined}
                            />
                        </StatRow>
                    </div>
                </PanelSection>
            </Panel>

            {/* Device lists */}
            <Panel>
                <PanelSection
                    label="Devices"
                    action={
                        activeTab === 'stations' ? (
                            <Button className="w-full sm:w-auto" onClick={() => setIsAddStationOpen(true)} disabled={!canManageDevices}>
                                <Plus className="h-4 w-4 mr-2" />
                                Add Station
                            </Button>
                        ) : (
                            <Button className="w-full sm:w-auto" onClick={() => setIsAddTerminalOpen(true)} disabled={!canManageDevices}>
                                <Plus className="h-4 w-4 mr-2" />
                                Add Terminal
                            </Button>
                        )
                    }
                >
                    <div className="mt-4 flex w-full min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        {/* §4.5 pill rail; classes are the TAB_* literals (C7). */}
                        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'stations' | 'terminals')} className="min-w-0">
                            <div className="w-full min-w-0 overflow-x-auto pb-1">
                                <TabsList className="inline-flex h-auto w-max flex-nowrap gap-0.5 rounded-full bg-muted/70 p-1">
                                    <TabsTrigger
                                        value="stations"
                                        className="shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border"
                                    >
                                        Stations <span className="ml-1 tabular-nums">({filteredStations.length})</span>
                                    </TabsTrigger>
                                    <TabsTrigger
                                        value="terminals"
                                        className="shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border"
                                    >
                                        Payment Terminals <span className="ml-1 tabular-nums">({filteredTerminals.length})</span>
                                    </TabsTrigger>
                                </TabsList>
                            </div>
                        </Tabs>
                        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 lg:w-auto">
                            <div className="relative min-w-[140px] flex-1 sm:flex-none">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
                                <Input
                                    placeholder="Search..."
                                    aria-label="Search devices"
                                    value={searchTerm}
                                    onChange={(e) => {
                                        setSearchTerm(e.target.value)
                                        setStationPage(1)
                                        setTerminalPage(1)
                                    }}
                                    className="h-9 w-full pl-9 text-[0.8125rem] sm:w-64"
                                />
                            </div>
                            <Select
                                value={selectedLocationId}
                                onValueChange={(v) => {
                                    setSelectedLocationId(v)
                                    setStationPage(1)
                                    setTerminalPage(1)
                                }}
                            >
                                <SelectTrigger aria-label="Location" className="h-9 w-full min-w-0 text-[0.8125rem] sm:w-[200px]">
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
                        </div>
                    </div>

                    <div className="mt-6">
                        {isLoading ? (
                            <div className="space-y-2" aria-busy="true">
                                {Array.from({ length: 4 }).map((_, i) => (
                                    <Skeleton key={i} className="h-16 w-full rounded-2xl" />
                                ))}
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
                                                    <EmptyTitle>
                                                        {isFiltered ? 'No stations match these filters' : 'No stations yet'}
                                                    </EmptyTitle>
                                                    <EmptyDescription>
                                                        {isFiltered
                                                            ? 'Clear the search or pick another location to widen the results.'
                                                            : 'Stations appear here once one is added for this merchant.'}
                                                    </EmptyDescription>
                                                </EmptyHeader>
                                            </Empty>
                                        ) : (
                                            <>
                                            {/* §5.3: a card grid below `lg`, never a
                                                scrolling table. This table has 7 columns,
                                                so at 375px it was a scroll well. */}
                                            <Table variant="data" containerClassName="hidden lg:block">
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Station</TableHead>
                                                        <TableHead>Type</TableHead>
                                                        <TableHead>Location</TableHead>
                                                        <TableHead>Status</TableHead>
                                                        <TableHead>Device Info</TableHead>
                                                        <TableHead>Last Heartbeat</TableHead>
                                                        <TableHead className="w-[50px]"><span className="sr-only">Actions</span></TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {stationPageRows.map((station) => {
                                                        const StationIcon = getStationTypeIcon(station.station_type)
                                                        return (
                                                        <TableRow key={station.id}>
                                                            <TableCell>
                                                                <div className="flex items-center gap-3">
                                                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                                                                        <StationIcon className="h-5 w-5" />
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
                                                                <Badge variant="secondary" className="w-fit rounded-full border-0 px-2.5 text-xs font-medium">
                                                                    {getStationTypeLabel(station.station_type)}
                                                                </Badge>
                                                                {station.station_number && (
                                                                    <span className="ml-2 text-sm text-muted-foreground tabular-nums">
                                                                        #{station.station_number}
                                                                    </span>
                                                                )}
                                                            </TableCell>
                                                            <TableCell>
                                                                <span className="text-sm">{station.location_name}</span>
                                                            </TableCell>
                                                            <TableCell>
                                                                <div className="flex flex-col gap-1">
                                                                    <Badge variant="secondary" className="w-fit rounded-full border-0 px-2.5 text-xs font-medium">
                                                                        {station.is_online ? 'Online' : 'Offline'}
                                                                    </Badge>
                                                                    {!station.is_active && (
                                                                        <Badge variant="secondary" className="w-fit rounded-full border-0 px-2.5 text-xs font-medium">
                                                                            Deactivated
                                                                        </Badge>
                                                                    )}
                                                                </div>
                                                            </TableCell>
                                                            <TableCell>
                                                                {station.device_name || station.hardware_model ? (
                                                                    <div className="text-sm">
                                                                        <div>{station.device_name || '—'}</div>
                                                                        <div className="text-muted-foreground">
                                                                            {station.hardware_model || '—'}
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <span className="text-muted-foreground">—</span>
                                                                )}
                                                            </TableCell>
                                                            <TableCell>
                                                                {station.last_heartbeat_at ? (
                                                                    <span className="text-sm text-muted-foreground">
                                                                        {formatDistanceToNow(new Date(station.last_heartbeat_at), { addSuffix: true })}
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-muted-foreground">Never</span>
                                                                )}
                                                            </TableCell>
                                                            <TableCell>
                                                                {canManageDevices ? (
                                                                    renderStationActions(station)
                                                                ) : (
                                                                    <span className="text-xs text-muted-foreground">View only</span>
                                                                )}
                                                            </TableCell>
                                                        </TableRow>
                                                        )
                                                    })}
                                                </TableBody>
                                            </Table>

                                            {/* Mirrors the table's `hidden lg:block`. Same
                                                page of rows, stacked: identity and status lead,
                                                the rest drops into a two-column field grid.
                                                Values are plain text on the muted card (§3.5). */}
                                            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
                                                {stationPageRows.map((station) => {
                                                    const StationIcon = getStationTypeIcon(station.station_type)
                                                    return (
                                                    <div
                                                        key={station.id}
                                                        className="min-w-0 rounded-2xl border-0 bg-muted/45 p-4"
                                                    >
                                                        <div className="flex items-start justify-between gap-2">
                                                            <div className="flex min-w-0 items-center gap-3">
                                                                <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground sm:flex">
                                                                    <StationIcon className="h-5 w-5" />
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <p className="truncate font-semibold">{station.station_name}</p>
                                                                    {station.station_code && (
                                                                        <p className="truncate text-xs text-muted-foreground">
                                                                            Code: {station.station_code}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <div className="flex shrink-0 items-center gap-1">
                                                                <span className="text-sm text-muted-foreground">
                                                                    {station.is_online ? 'Online' : 'Offline'}
                                                                    {!station.is_active && ' · Deactivated'}
                                                                </span>
                                                                {canManageDevices && renderStationActions(station)}
                                                            </div>
                                                        </div>

                                                        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                                            <DeviceCardField
                                                                label="Type"
                                                                value={`${getStationTypeLabel(station.station_type)}${station.station_number ? ` #${station.station_number}` : ''}`}
                                                            />
                                                            <DeviceCardField label="Location" value={station.location_name} />
                                                            <DeviceCardField
                                                                label="Device"
                                                                value={station.device_name || station.hardware_model || '—'}
                                                            />
                                                            <DeviceCardField
                                                                label="Last heartbeat"
                                                                value={
                                                                    station.last_heartbeat_at
                                                                        ? formatDistanceToNow(new Date(station.last_heartbeat_at), { addSuffix: true })
                                                                        : 'Never'
                                                                }
                                                            />
                                                        </div>
                                                    </div>
                                                    )
                                                })}
                                            </div>

                                            <PaginationBar pagination={stationPagination} onPageChange={setStationPage} itemLabel="stations" />
                                            </>
                                        )}
                                    </>
                                )}

                                {/* Terminals Tab Content */}
                                {activeTab === 'terminals' && (
                                    <>
                                        {filteredTerminals.length === 0 ? (
                                            <Empty>
                                                <EmptyHeader>
                                                    <EmptyMedia variant="icon">
                                                        <CreditCard className="h-6 w-6" />
                                                    </EmptyMedia>
                                                    <EmptyTitle>
                                                        {isFiltered ? 'No terminals match these filters' : 'No terminals yet'}
                                                    </EmptyTitle>
                                                    <EmptyDescription>
                                                        {isFiltered
                                                            ? 'Clear the search or pick another location to widen the results.'
                                                            : 'Payment terminals appear here once one is added for this merchant.'}
                                                    </EmptyDescription>
                                                </EmptyHeader>
                                            </Empty>
                                        ) : (
                                            <>
                                            <Table variant="data" containerClassName="hidden lg:block">
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Terminal</TableHead>
                                                        <TableHead>Type</TableHead>
                                                        <TableHead>Serial Number</TableHead>
                                                        <TableHead>Assigned Station</TableHead>
                                                        <TableHead>Status</TableHead>
                                                        <TableHead className="w-[50px]"><span className="sr-only">Actions</span></TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {terminalPageRows.map((terminal) => (
                                                        <TableRow key={terminal.id}>
                                                            <TableCell>
                                                                <div className="flex items-center gap-3">
                                                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
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
                                                                <Badge variant="secondary" className="w-fit rounded-full border-0 px-2.5 text-xs font-medium">
                                                                    {getTerminalTypeLabel(terminal.terminal_type)}
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell>
                                                                <code className="text-sm bg-muted px-2 py-1 rounded">
                                                                    {terminal.serial_number || '—'}
                                                                </code>
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
                                                                <Badge variant="secondary" className="w-fit rounded-full border-0 px-2.5 text-xs font-medium">
                                                                    {terminal.is_connected ? (
                                                                        <Wifi className="h-3 w-3 mr-1" />
                                                                    ) : (
                                                                        <WifiOff className="h-3 w-3 mr-1" />
                                                                    )}
                                                                    {terminal.is_connected ? 'Online' : 'Offline'}
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell>
                                                                {canManageDevices ? (
                                                                    renderTerminalActions(terminal)
                                                                ) : (
                                                                    <span className="text-xs text-muted-foreground">View only</span>
                                                                )}
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>

                                            {/* Mirrors the table's `hidden lg:block`. */}
                                            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
                                                {terminalPageRows.map((terminal) => (
                                                    <div
                                                        key={terminal.id}
                                                        className="min-w-0 rounded-2xl border-0 bg-muted/45 p-4"
                                                    >
                                                        <div className="flex items-start justify-between gap-2">
                                                            <div className="flex min-w-0 items-center gap-3">
                                                                <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground sm:flex">
                                                                    <CreditCard className="h-5 w-5" />
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <p className="truncate font-semibold">{terminal.terminal_name}</p>
                                                                    <p className="truncate text-xs text-muted-foreground">
                                                                        {getTerminalTypeLabel(terminal.terminal_type)}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <div className="flex shrink-0 items-center gap-1">
                                                                <span className="text-sm text-muted-foreground">
                                                                    {terminal.is_connected ? 'Online' : 'Offline'}
                                                                </span>
                                                                {canManageDevices && renderTerminalActions(terminal)}
                                                            </div>
                                                        </div>

                                                        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                                            <DeviceCardField label="Serial" value={terminal.serial_number || '—'} />
                                                            <DeviceCardField label="Location" value={terminal.location_name} />
                                                            <DeviceCardField label="Station" value={terminal.station_name || 'Unassigned'} />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>

                                            <PaginationBar pagination={terminalPagination} onPageChange={setTerminalPage} itemLabel="terminals" />
                                            </>
                                        )}
                                    </>
                                )}
                            </>
                        )}
                    </div>
                </PanelSection>
            </Panel>

            {/* Unique terminals, deduplicated by serial number (Castles + Valor).
                Its own panel: a tier-1 container never nests inside another. */}
            {activeTab === 'terminals' && (
                <ConnectedTerminalsPanel
                    merchantId={merchantId}
                    locationId={selectedLocationId === 'all' ? null : selectedLocationId}
                />
            )}

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
