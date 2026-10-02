'use client'

import Link from 'next/link'
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

const formatHeartbeat = (iso: string | null | undefined): string =>
    iso ? formatDistanceToNow(new Date(iso), { addSuffix: true }) : 'Never'

/**
 * The status line under a phone device card: the Wifi glyph and the word carry
 * the state (§3.5), with one short detail after it.
 */
function DeviceCardStatus({ online, detail }: { online: boolean; detail: string }) {
    const Icon = online ? Wifi : WifiOff
    return (
        <p className="mt-2 flex min-w-0 items-center gap-1.5 text-sm">
            <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="shrink-0 font-medium">{online ? 'Online' : 'Offline'}</span>
            <span className="truncate text-muted-foreground">· {detail}</span>
        </p>
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
    const [activeTab, setActiveTab] = useState<'stations' | 'terminals'>('terminals')
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

    const terminalHref = (serial: string) =>
        `/manage/merchants/${merchantId}/devices/terminal/${encodeURIComponent(serial)}`

    // A terminal with a serial opens its batches & activity page.
    const renderTerminalName = (terminal: TerminalRow, className: string) =>
        terminal.serial_number ? (
            <Link
                href={terminalHref(terminal.serial_number)}
                className={`${className} underline decoration-muted-foreground/40 underline-offset-4 hover:decoration-foreground`}
            >
                {terminal.terminal_name}
            </Link>
        ) : (
            <div className={className}>{terminal.terminal_name}</div>
        )

    const renderTerminalActions = (terminal: TerminalRow) => (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 rounded-full p-0" aria-label={`Actions for ${terminal.terminal_name}`}>
                    <MoreHorizontal className="h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                {terminal.serial_number && (
                    <DropdownMenuItem asChild>
                        <Link href={terminalHref(terminal.serial_number)}>
                            <CreditCard className="h-4 w-4 mr-2" />
                            View batches & activity
                        </Link>
                    </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => setEditTerminal(terminal)}>
                    <Settings2 className="h-4 w-4 mr-2" />
                    Edit terminal settings
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
                    caption="A station is a POS workspace. A payment terminal is the card reader linked to batches and payments."
                    action={
                        <div className="flex flex-wrap items-center gap-2">
                        <Button variant="outline" className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm" asChild>
                            <Link href={`/manage/merchants/${merchantId}?tab=settlements`}>
                                View batches & deposits
                            </Link>
                        </Button>
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
                        </div>
                    }
                >
                    {/* Two rows of two, not one row of four: this tab renders beside
                        the merchant nav, which leaves a 4th column ~100px -- narrow
                        enough to truncate "Payment Terminals" and "Connected
                        Terminals". StatRow takes 2|3|4 only (§14.7 trap 6). */}
                    <div className="mt-6 space-y-6">
                        <StatRow columns={2} className="grid-cols-2 gap-x-4">
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
                        <StatRow columns={2} className="grid-cols-2 gap-x-4">
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
                    {/* flex-wrap, not a lg: row: this panel sits beside the merchant nav,
                        so viewport breakpoints don't track its width. The tab rail keeps
                        its natural width (shrink-0); the filter group flexes from a 20rem
                        basis beside it, so it only drops to its own line when the panel
                        can't fit both. */}
                    <div className="mt-4 flex w-full min-w-0 flex-wrap items-center gap-3">
                        {/* §4.5 pill rail; classes are the TAB_* literals (C7). */}
                        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'stations' | 'terminals')} className="max-w-full shrink-0">
                            <div className="no-scrollbar w-full min-w-0 overflow-x-auto">
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
                        <div className="flex min-w-0 flex-[1_1_20rem] flex-wrap items-center justify-end gap-2">
                            <div className="relative min-w-[10rem] flex-1 sm:max-w-72">
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
                                    className="h-9 w-full pl-9 text-[0.8125rem]"
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
                                <SelectTrigger aria-label="Location" className="h-9 w-full min-w-0 text-[0.8125rem] sm:w-44">
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

                    {/* @container: the table/card switch below keys off THIS panel's
                        width, not the viewport, so an open app sidebar is accounted
                        for. Laptops (panel >= 42rem) get tables, phones get cards. */}
                    <div className="@container mt-6">
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
                                            {/* §5.3: a table once the panel is laptop-wide
                                                (@2xl, 42rem), cards below it. Type folds into the
                                                Station cell so five columns fit at that width;
                                                Device joins from @4xl. Unbounded: the page is
                                                capped at 10 rows by pagination, so an inner
                                                scroll well only slid rows under a sticky header. */}
                                            <Table variant="data" bounded={false} containerClassName="hidden @2xl:block">
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Station</TableHead>
                                                        <TableHead>Location</TableHead>
                                                        <TableHead className="hidden @4xl:table-cell">Device</TableHead>
                                                        <TableHead>Status</TableHead>
                                                        <TableHead>Last Seen</TableHead>
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
                                                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                                                                        <StationIcon className="h-4 w-4" />
                                                                    </div>
                                                                    <div className="min-w-0">
                                                                        <div className="font-medium">{station.station_name}</div>
                                                                        <div className="text-xs text-muted-foreground">
                                                                            {getStationTypeLabel(station.station_type)}
                                                                            {station.station_number ? ` #${station.station_number}` : ''}
                                                                            {station.station_code ? ` · ${station.station_code}` : ''}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </TableCell>
                                                            <TableCell>
                                                                <span className="text-sm">{station.location_name}</span>
                                                            </TableCell>
                                                            <TableCell className="hidden @4xl:table-cell">
                                                                {station.device_name || station.hardware_model ? (
                                                                    <div className="text-sm">
                                                                        <div>{station.device_name || '—'}</div>
                                                                        {station.hardware_model && (
                                                                            <div className="text-xs text-muted-foreground">
                                                                                {station.hardware_model}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                ) : (
                                                                    <span className="text-muted-foreground">—</span>
                                                                )}
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
                                                                <span className="text-sm text-muted-foreground">
                                                                    {formatHeartbeat(station.last_heartbeat_at)}
                                                                </span>
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

                                            {/* Mirrors the table's `hidden @2xl:block`. Phone
                                                cards carry only what an operator scans for: name,
                                                type, location, and whether it is online. Device
                                                hardware and codes stay on the laptop table. */}
                                            <div className="flex min-w-0 flex-col gap-2 @2xl:hidden">
                                                {stationPageRows.map((station) => (
                                                    <div
                                                        key={station.id}
                                                        className="min-w-0 rounded-2xl bg-muted/45 px-4 py-3"
                                                    >
                                                        <div className="flex items-start justify-between gap-2">
                                                            <div className="min-w-0">
                                                                <p className="truncate font-semibold">{station.station_name}</p>
                                                                <p className="truncate text-xs text-muted-foreground">
                                                                    {getStationTypeLabel(station.station_type)}
                                                                    {station.station_number ? ` #${station.station_number}` : ''}
                                                                    {' · '}
                                                                    {station.location_name}
                                                                </p>
                                                            </div>
                                                            {canManageDevices && renderStationActions(station)}
                                                        </div>
                                                        <DeviceCardStatus
                                                            online={station.is_online}
                                                            detail={
                                                                !station.is_active
                                                                    ? 'Deactivated'
                                                                    : station.last_heartbeat_at
                                                                      ? `Seen ${formatHeartbeat(station.last_heartbeat_at)}`
                                                                      : 'Never seen'
                                                            }
                                                        />
                                                    </div>
                                                ))}
                                            </div>

                                            <PaginationBar pagination={stationPagination} onPageChange={setStationPage} itemLabel="stations" />
                                            </>
                                        )}
                                    </>
                                )}

                                {/* Terminals Tab Content */}
                                {activeTab === 'terminals' && (
                                    <>
                                        <p className="mb-3 text-sm text-muted-foreground">
                                            Select a terminal name to review its batches and activity. Use the row menu to edit its settings or test the connection.
                                        </p>
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
                                            {/* Same @2xl switch as the stations table. Type
                                                folds into the Terminal cell so five columns
                                                fit. Unbounded for the same reason. */}
                                            <Table variant="data" bounded={false} containerClassName="hidden @2xl:block">
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Terminal</TableHead>
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
                                                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                                                                        <CreditCard className="h-4 w-4" />
                                                                    </div>
                                                                    <div className="min-w-0">
                                                                        {renderTerminalName(terminal, 'font-medium')}
                                                                        <div className="text-xs text-muted-foreground">
                                                                            {getTerminalTypeLabel(terminal.terminal_type)} · {terminal.location_name}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </TableCell>
                                                            <TableCell>
                                                                <code className="rounded bg-muted px-2 py-1 text-xs">
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

                                            {/* Mirrors the table's `hidden @2xl:block`. Phone
                                                cards keep name, type, serial, and status with the
                                                station it is paired to; location is the filter. */}
                                            <div className="flex min-w-0 flex-col gap-2 @2xl:hidden">
                                                {terminalPageRows.map((terminal) => (
                                                    <div
                                                        key={terminal.id}
                                                        className="min-w-0 rounded-2xl bg-muted/45 px-4 py-3"
                                                    >
                                                        <div className="flex items-start justify-between gap-2">
                                                            <div className="min-w-0">
                                                                {renderTerminalName(terminal, 'block truncate font-semibold')}
                                                                <p className="truncate text-xs text-muted-foreground">
                                                                    {getTerminalTypeLabel(terminal.terminal_type)}
                                                                    {' · '}
                                                                    <span className="font-mono">{terminal.serial_number || 'No serial'}</span>
                                                                </p>
                                                            </div>
                                                            {canManageDevices && renderTerminalActions(terminal)}
                                                        </div>
                                                        <DeviceCardStatus
                                                            online={terminal.is_connected}
                                                            detail={terminal.station_name || 'Unassigned'}
                                                        />
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
