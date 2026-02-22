'use client'

import { useState, useMemo } from 'react'
import { usePaymentTerminalHealth } from '@/lib/queries/use-platform-analytics'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import {
  Wifi,
  WifiOff,
  HelpCircle,
  CreditCard,
  AlertTriangle,
  Clock,
  Link2Off,
  KeyRound,
  CheckCircle2,
  Search,
  RefreshCw,
  Building2,
  MapPin,
  Terminal,
} from 'lucide-react'
import type {
  PaymentTerminalRow,
  TerminalConnectionStatus,
  TerminalSettlementStatus,
} from '@/app/manage/actions/hq-platform/analytics'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtHours(hours: number | null): string {
  if (hours === null) return '—'
  if (hours < 1) return '<1h ago'
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function fmtLastSeen(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ── Status badge components ───────────────────────────────────────────────────

function ConnectionBadge({ status }: { status: TerminalConnectionStatus }) {
  if (status === 'connected') {
    return (
      <Badge variant="default" className="gap-1 bg-green-600 hover:bg-green-700">
        <Wifi className="h-3 w-3" /> Online
      </Badge>
    )
  }
  if (status === 'disconnected') {
    return (
      <Badge variant="destructive" className="gap-1">
        <WifiOff className="h-3 w-3" /> Offline
      </Badge>
    )
  }
  return (
    <Badge variant="secondary" className="gap-1">
      <HelpCircle className="h-3 w-3" /> Unknown
    </Badge>
  )
}

function SettlementBadge({ status, hours }: { status: TerminalSettlementStatus; hours: number | null }) {
  if (status === 'overdue') {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-amber-600">
        <Clock className="h-3 w-3" />
        {fmtHours(hours)} — overdue
      </span>
    )
  }
  if (status === 'settled') {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <CheckCircle2 className="h-3 w-3 text-green-500" />
        {fmtHours(hours)}
      </span>
    )
  }
  return <span className="text-xs text-muted-foreground">—</span>
}

// ── Summary stat card ─────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  colorClass = '',
  bg = '',
}: {
  icon: React.ElementType
  label: string
  value: number | string
  colorClass?: string
  bg?: string
}) {
  return (
    <Card className={bg}>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${bg ? 'bg-white/60' : 'bg-muted'}`}>
            <Icon className={`h-4 w-4 ${colorClass}`} />
          </div>
          <div>
            <p className={`text-xl font-bold ${colorClass}`}>{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

type FilterStatus = 'all' | 'disconnected' | 'connected' | 'unknown'

export function PaymentTerminalHealthMonitor() {
  const { data, isLoading, dataUpdatedAt } = usePaymentTerminalHealth()
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')
  const [search, setSearch] = useState('')

  const filteredTerminals = useMemo(() => {
    if (!data?.terminals) return []
    return data.terminals.filter(t => {
      const matchesStatus =
        filterStatus === 'all' ||
        t.connectionStatus === filterStatus
      const q = search.toLowerCase()
      const matchesSearch =
        !q ||
        t.terminalName.toLowerCase().includes(q) ||
        t.merchantName.toLowerCase().includes(q) ||
        t.tpn.includes(q) ||
        (t.locationName || '').toLowerCase().includes(q)
      return matchesStatus && matchesSearch
    })
  }, [data?.terminals, filterStatus, search])

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}><CardContent className="pt-5"><Skeleton className="h-14 w-full" /></CardContent></Card>
          ))}
        </div>
        <Skeleton className="h-80 w-full" />
      </div>
    )
  }

  if (!data) return null

  const { summary } = data
  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : '—'

  const uptimePct = summary.total > 0
    ? Math.round((summary.connected / summary.total) * 1000) / 10
    : 0

  return (
    <div className="space-y-6">

      {/* ── Summary cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <StatCard icon={CreditCard}   label="Total Terminals"    value={summary.total} />
        <StatCard icon={Wifi}         label="Connected"          value={summary.connected}    colorClass="text-green-600"  bg="bg-green-50/50 dark:bg-green-950/20" />
        <StatCard icon={WifiOff}      label="Disconnected"       value={summary.disconnected} colorClass="text-red-600"    bg={summary.disconnected > 0 ? 'bg-red-50/50 dark:bg-red-950/20' : ''} />
        <StatCard icon={HelpCircle}   label="Unknown Status"     value={summary.unknown}      colorClass="text-slate-500" />
        <StatCard icon={Clock}        label="Settlement Overdue" value={summary.settlementOverdue} colorClass={summary.settlementOverdue > 0 ? 'text-amber-600' : ''} bg={summary.settlementOverdue > 0 ? 'bg-amber-50/50' : ''} />
        <StatCard icon={Link2Off}     label="Orphan Terminals"   value={summary.orphans}      colorClass={summary.orphans > 0 ? 'text-orange-600' : ''} />
        <StatCard icon={KeyRound}     label="Auth Key Missing"   value={summary.authKeysMissing} colorClass={summary.authKeysMissing > 0 ? 'text-red-600' : ''} />
      </div>

      {/* ── Uptime bar ─────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Fleet Connection Rate</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold">{uptimePct}%</span>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <RefreshCw className="h-3 w-3" /> {lastUpdated}
              </span>
            </div>
          </div>
          <div className="w-full h-3 rounded-full bg-muted overflow-hidden flex">
            {summary.total > 0 && (
              <>
                <div
                  className="h-full bg-green-500 transition-all"
                  style={{ width: `${(summary.connected / summary.total) * 100}%` }}
                />
                <div
                  className="h-full bg-slate-300 transition-all"
                  style={{ width: `${(summary.unknown / summary.total) * 100}%` }}
                />
                <div
                  className="h-full bg-red-400 transition-all"
                  style={{ width: `${(summary.disconnected / summary.total) * 100}%` }}
                />
              </>
            )}
          </div>
          <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Connected</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-300 inline-block" />Unknown</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" />Disconnected</span>
          </div>
        </CardContent>
      </Card>

      {/* ── Alert banner ───────────────────────────────────────────────── */}
      {(summary.settlementOverdue > 0 || summary.orphans > 0 || summary.authKeysMissing > 0) && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-amber-900">Action Required</p>
                <div className="flex flex-wrap gap-3 text-xs text-amber-800">
                  {summary.settlementOverdue > 0 && (
                    <span>{summary.settlementOverdue} terminal{summary.settlementOverdue !== 1 ? 's' : ''} not settled in &gt;24h — review batch settlement</span>
                  )}
                  {summary.orphans > 0 && (
                    <span>{summary.orphans} orphan terminal{summary.orphans !== 1 ? 's' : ''} — no station mapping (cannot process payments)</span>
                  )}
                  {summary.authKeysMissing > 0 && (
                    <span>{summary.authKeysMissing} terminal{summary.authKeysMissing !== 1 ? 's' : ''} missing auth key — configuration incomplete</span>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Terminal grid table ─────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Terminal className="h-4 w-4" />
                All Payment Terminals ({filteredTerminals.length} of {summary.total})
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Grid showing TPN, connection status, last seen, settlement, and auth key health
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search terminals…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-8 h-8 w-44 text-xs"
                />
              </div>
              <Select value={filterStatus} onValueChange={v => setFilterStatus(v as FilterStatus)}>
                <SelectTrigger className="h-8 w-36 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="connected">Connected</SelectItem>
                  <SelectItem value="disconnected">Disconnected</SelectItem>
                  <SelectItem value="unknown">Unknown</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-auto max-h-[600px]">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="text-xs pl-4">Terminal</TableHead>
                  <TableHead className="text-xs">TPN</TableHead>
                  <TableHead className="text-xs">Merchant</TableHead>
                  <TableHead className="text-xs">Location</TableHead>
                  <TableHead className="text-xs">Station</TableHead>
                  <TableHead className="text-xs">Connection</TableHead>
                  <TableHead className="text-xs">Last Seen</TableHead>
                  <TableHead className="text-xs">Last Txn</TableHead>
                  <TableHead className="text-xs">Settlement</TableHead>
                  <TableHead className="text-xs">Auth Key</TableHead>
                  <TableHead className="text-xs">Env</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTerminals.map(t => (
                  <TerminalRow key={t.id} terminal={t} />
                ))}
                {filteredTerminals.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center text-muted-foreground text-sm py-10">
                      {data.terminals.length === 0
                        ? 'No payment terminals registered'
                        : 'No terminals match the current filter'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── Orphan detail ───────────────────────────────────────────────── */}
      {data.terminals.filter(t => t.isOrphan).length > 0 && (
        <Card className="border-orange-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Link2Off className="h-4 w-4 text-orange-500" />
              Orphan Terminals — No Station Mapping
            </CardTitle>
            <CardDescription className="text-xs">
              These terminals are not linked to any POS station and cannot process payments until mapped
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs pl-4">Terminal</TableHead>
                  <TableHead className="text-xs">TPN</TableHead>
                  <TableHead className="text-xs">Merchant</TableHead>
                  <TableHead className="text-xs">Location</TableHead>
                  <TableHead className="text-xs">Type</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.terminals.filter(t => t.isOrphan).map(t => (
                  <TableRow key={t.id} className="bg-orange-50/40">
                    <TableCell className="text-sm py-2 pl-4 font-medium">{t.terminalName}</TableCell>
                    <TableCell className="text-sm py-2 font-mono text-xs text-muted-foreground">{t.tpn}</TableCell>
                    <TableCell className="text-sm py-2">
                      <span className="flex items-center gap-1.5">
                        <Building2 className="h-3 w-3 text-muted-foreground" />
                        {t.merchantName}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm py-2">
                      <span className="flex items-center gap-1.5">
                        <MapPin className="h-3 w-3 text-muted-foreground" />
                        {t.locationName || '—'}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs py-2 text-muted-foreground capitalize">{t.terminalType}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ── Terminal table row ────────────────────────────────────────────────────────

function TerminalRow({ terminal: t }: { terminal: PaymentTerminalRow }) {
  const rowBg =
    t.connectionStatus === 'disconnected' ? 'bg-red-50/30' :
    t.settlementStatus === 'overdue' ? 'bg-amber-50/30' :
    t.isOrphan ? 'bg-orange-50/20' : ''

  return (
    <TableRow className={rowBg}>
      <TableCell className="text-sm py-2 pl-4">
        <div className="font-medium">{t.terminalName}</div>
        {t.terminalModel && (
          <div className="text-xs text-muted-foreground">{t.terminalModel}</div>
        )}
        {t.isOrphan && (
          <Badge variant="outline" className="text-[10px] px-1 py-0 mt-0.5 text-orange-600 border-orange-300">
            <Link2Off className="h-2.5 w-2.5 mr-0.5" /> Orphan
          </Badge>
        )}
      </TableCell>
      <TableCell className="py-2">
        <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{t.tpn}</code>
      </TableCell>
      <TableCell className="text-xs py-2 text-muted-foreground">
        <span className="flex items-center gap-1">
          <Building2 className="h-3 w-3 shrink-0" />
          {t.merchantName}
        </span>
      </TableCell>
      <TableCell className="text-xs py-2 text-muted-foreground">
        <span className="flex items-center gap-1">
          <MapPin className="h-3 w-3 shrink-0" />
          {t.locationName || '—'}
        </span>
      </TableCell>
      <TableCell className="text-xs py-2 text-muted-foreground">
        {t.stationName
          ? <span className="flex items-center gap-1"><Terminal className="h-3 w-3 shrink-0" />{t.stationName}</span>
          : <span className="text-orange-500">—</span>}
      </TableCell>
      <TableCell className="py-2">
        <ConnectionBadge status={t.connectionStatus} />
        {t.lastError && (
          <p className="text-[10px] text-red-600 mt-0.5 max-w-32 truncate" title={t.lastError}>
            {t.lastError}
          </p>
        )}
      </TableCell>
      <TableCell className="text-xs py-2 text-muted-foreground">
        {fmtLastSeen(t.lastSeenAt)}
      </TableCell>
      <TableCell className="text-xs py-2 text-muted-foreground">
        {fmtHours(t.hoursSinceLastTransaction)}
      </TableCell>
      <TableCell className="py-2">
        <SettlementBadge status={t.settlementStatus} hours={t.hoursSinceLastTransaction} />
      </TableCell>
      <TableCell className="py-2">
        {t.authStatus === 'valid' ? (
          <span className="flex items-center gap-1 text-xs text-green-600">
            <CheckCircle2 className="h-3 w-3" /> Valid
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-red-600">
            <KeyRound className="h-3 w-3" /> Missing
          </span>
        )}
      </TableCell>
      <TableCell className="py-2">
        <Badge
          variant={t.apiEnvironment === 'production' ? 'default' : 'secondary'}
          className="text-[10px] px-1.5 py-0"
        >
          {t.apiEnvironment === 'production' ? 'Prod' : 'Sandbox'}
        </Badge>
      </TableCell>
    </TableRow>
  )
}
