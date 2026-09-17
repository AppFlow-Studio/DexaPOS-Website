'use client'

import { useState, useMemo } from 'react'
import { usePaymentTerminalHealth } from '@/lib/queries/use-platform-analytics'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  MobileColumnsButton,
  initialHiddenColumns,
  type ReportColumn,
} from '@/components/dashboard/reports/MobileColumnsButton'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
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
  Activity,
} from 'lucide-react'
import { Panel } from '@/components/dashboard/shell/Panel'
import { PanelSection } from '@/components/dashboard/shell/PanelSection'
import { StatRow, StatTile } from '@/components/dashboard/shell/StatTile'
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

// ── Status cells ──────────────────────────────────────────────────────────────

/**
 * Connection and settlement state read as text plus an icon, not a coloured
 * badge: §14.3 HQ-2 keeps severity colour to `/manage/health` and the DLQ, and
 * §5.2 bans bordered badges in a cell. The icon carries the distinction so the
 * state survives for a colour-blind reader.
 */
function ConnectionCell({ status }: { status: TerminalConnectionStatus }) {
  if (status === 'connected') {
    return (
      <span className="flex items-center gap-1.5 text-sm">
        <Wifi className="h-3.5 w-3.5 shrink-0" /> Online
      </span>
    )
  }
  if (status === 'disconnected') {
    return (
      <span className="flex items-center gap-1.5 text-sm font-medium">
        <WifiOff className="h-3.5 w-3.5 shrink-0" /> Offline
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <HelpCircle className="h-3.5 w-3.5 shrink-0" /> Unknown
    </span>
  )
}

function SettlementCell({ status, hours }: { status: TerminalSettlementStatus; hours: number | null }) {
  if (status === 'overdue') {
    return (
      <span className="flex items-center gap-1 text-xs font-medium">
        <Clock className="h-3 w-3 shrink-0" />
        {fmtHours(hours)} — overdue
      </span>
    )
  }
  if (status === 'settled') {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <CheckCircle2 className="h-3 w-3 shrink-0" />
        {fmtHours(hours)}
      </span>
    )
  }
  return <span className="text-xs text-muted-foreground">—</span>
}

// ── Main component ────────────────────────────────────────────────────────────

type FilterStatus = 'all' | 'disconnected' | 'connected' | 'unknown'

/**
 * Mobile column meta for the two terminal tables.
 *
 * Connection is why an operator opens the terminal list at all, so it is the
 * one field kept beside the terminal name; the orphan table is a mapping
 * problem, so Location — where the terminal physically sits — is kept instead.
 */
const ALL_TERMINAL_COLUMNS: ReportColumn[] = [
  { id: 'terminal', label: 'Terminal', locked: true },
  { id: 'tpn', label: 'TPN', defaultHidden: true },
  { id: 'merchant', label: 'Merchant', defaultHidden: true },
  { id: 'location', label: 'Location', defaultHidden: true },
  { id: 'station', label: 'Station', defaultHidden: true },
  { id: 'connection', label: 'Connection' },
  { id: 'lastSeen', label: 'Last Seen', defaultHidden: true },
  { id: 'lastTxn', label: 'Last Txn', defaultHidden: true },
  { id: 'settlement', label: 'Settlement', defaultHidden: true },
  { id: 'authKey', label: 'Auth Key', defaultHidden: true },
  { id: 'env', label: 'Env', defaultHidden: true },
]

const ORPHAN_TERMINAL_COLUMNS: ReportColumn[] = [
  { id: 'terminal', label: 'Terminal', locked: true },
  { id: 'tpn', label: 'TPN', defaultHidden: true },
  { id: 'merchant', label: 'Merchant', defaultHidden: true },
  { id: 'location', label: 'Location' },
  { id: 'type', label: 'Type', defaultHidden: true },
]

export function PaymentTerminalHealthMonitor() {
  const { data, isLoading, dataUpdatedAt } = usePaymentTerminalHealth()
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')
  const [search, setSearch] = useState('')
  const isMobile = useIsMobile()
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(() =>
    initialHiddenColumns(ALL_TERMINAL_COLUMNS)
  )
  const showCol = (id: string) => !isMobile || !hiddenCols.has(id)
  const visibleColCount = ALL_TERMINAL_COLUMNS.filter(c => showCol(c.id)).length
  // The orphan table keeps its own set — the two have different columns and are
  // read for different reasons, so sharing one would make each picker confusing.
  const [orphanHiddenCols, setOrphanHiddenCols] = useState<Set<string>>(() =>
    initialHiddenColumns(ORPHAN_TERMINAL_COLUMNS)
  )
  const showOrphanCol = (id: string) => !isMobile || !orphanHiddenCols.has(id)

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
      <div className="min-w-0 space-y-6 overflow-x-hidden">
        <Skeleton className="h-40 w-full rounded-3xl" />
        <Skeleton className="h-80 w-full max-w-full rounded-3xl" />
      </div>
    )
  }

  if (!data) return null

  const { summary } = data
  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : '—'

  const uptimePct = summary.total > 0
    ? Math.round((summary.connected / summary.total) * 1000) / 10
    : 0

  const orphanTerminals = data.terminals.filter(t => t.isOrphan)
  const hasAlerts = summary.settlementOverdue > 0 || summary.orphans > 0 || summary.authKeysMissing > 0

  return (
    <div className="space-y-6">
      <Panel>
        <PanelSection label="Terminal fleet" icon={CreditCard}>
          {/* Seven figures: 4-up then 3-up — `StatRow` tops out at four columns. */}
          <div className="space-y-6">
            <StatRow columns={4}>
              <StatTile label="Total Terminals" icon={<CreditCard />} value={summary.total} />
              <StatTile label="Connected" icon={<Wifi />} value={summary.connected} />
              <StatTile label="Disconnected" icon={<WifiOff />} value={summary.disconnected} />
              <StatTile label="Unknown Status" icon={<HelpCircle />} value={summary.unknown} />
            </StatRow>

            <StatRow columns={3}>
              <StatTile label="Settlement Overdue" icon={<Clock />} value={summary.settlementOverdue} />
              <StatTile label="Orphan Terminals" icon={<Link2Off />} value={summary.orphans} />
              <StatTile label="Auth Key Missing" icon={<KeyRound />} value={summary.authKeysMissing} />
            </StatRow>
          </div>
        </PanelSection>
      </Panel>

      <Panel>
        <PanelSection
          label="Fleet connection rate"
          icon={Activity}
          value={`${uptimePct}%`}
          action={
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <RefreshCw className="h-3 w-3" /> {lastUpdated}
            </span>
          }
        >
          {/* The segment fills map to the legend beneath — data encoding (§4.6b). */}
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
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
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-green-500" />Connected</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-slate-300" />Unknown</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-red-400" />Disconnected</span>
          </div>

          {hasAlerts && (
            // Inset note rather than a bordered alert box — §5.5 carries
            // separation on fill, not a drawn edge.
            <div className="mt-5 flex items-start gap-3 rounded-2xl bg-muted/60 px-4 py-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-semibold">Action required</p>
                <div className="flex flex-col gap-1 text-xs text-muted-foreground">
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
          )}
        </PanelSection>
      </Panel>

      <Panel>
        <PanelSection
          label={`All payment terminals (${filteredTerminals.length} of ${summary.total})`}
          icon={Terminal}
          caption="Grid showing TPN, connection status, last seen, settlement, and auth key health"
          action={
            <div className="flex flex-wrap items-center gap-2">
              <MobileColumnsButton
                columns={ALL_TERMINAL_COLUMNS}
                hidden={hiddenCols}
                onChange={setHiddenCols}
              />
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
                <Input
                  placeholder="Search terminals…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="h-9 w-44 rounded-full pl-9"
                />
              </div>
              <Select value={filterStatus} onValueChange={v => setFilterStatus(v as FilterStatus)}>
                <SelectTrigger className="h-9 w-36 rounded-full border-0 bg-muted/60 px-3 shadow-none">
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
          }
        >
          {/* Min-width lifted on mobile so hidden columns actually narrow the
              table instead of leaving it scrolling sideways. */}
          <Table variant="data" className={cn(!isMobile && 'min-w-[1180px]')}>
            <TableHeader className="[&_tr]:border-0">
              <TableRow>
                <TableHead>Terminal</TableHead>
                {showCol('tpn') && <TableHead>TPN</TableHead>}
                {showCol('merchant') && <TableHead>Merchant</TableHead>}
                {showCol('location') && <TableHead>Location</TableHead>}
                {showCol('station') && <TableHead>Station</TableHead>}
                {showCol('connection') && <TableHead>Connection</TableHead>}
                {showCol('lastSeen') && <TableHead>Last Seen</TableHead>}
                {showCol('lastTxn') && <TableHead>Last Txn</TableHead>}
                {showCol('settlement') && <TableHead>Settlement</TableHead>}
                {showCol('authKey') && <TableHead>Auth Key</TableHead>}
                {showCol('env') && <TableHead>Env</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTerminals.map(t => (
                <TerminalRow key={t.id} terminal={t} showCol={showCol} />
              ))}
              {filteredTerminals.length === 0 && (
                <TableRow>
                  <TableCell colSpan={visibleColCount} className="h-24 text-center text-muted-foreground">
                    {data.terminals.length === 0
                      ? 'No payment terminals registered'
                      : 'No terminals match the current filter'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </PanelSection>
      </Panel>

      {orphanTerminals.length > 0 && (
        <Panel>
          <PanelSection
            label="Orphan terminals — no station mapping"
            icon={Link2Off}
            caption="These terminals are not linked to any POS station and cannot process payments until mapped"
            action={
              <MobileColumnsButton
                columns={ORPHAN_TERMINAL_COLUMNS}
                hidden={orphanHiddenCols}
                onChange={setOrphanHiddenCols}
              />
            }
          >
            {/* Min-width lifted on mobile so hidden columns actually narrow the
                table instead of leaving it scrolling sideways. */}
            <Table variant="data" className={cn(!isMobile && 'min-w-[680px]')}>
              <TableHeader className="[&_tr]:border-0">
                <TableRow>
                  <TableHead>Terminal</TableHead>
                  {showOrphanCol('tpn') && <TableHead>TPN</TableHead>}
                  {showOrphanCol('merchant') && <TableHead>Merchant</TableHead>}
                  {showOrphanCol('location') && <TableHead>Location</TableHead>}
                  {showOrphanCol('type') && <TableHead>Type</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {orphanTerminals.map(t => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.terminalName}</TableCell>
                    {showOrphanCol('tpn') && (
                      <TableCell className="font-mono text-xs text-muted-foreground">{t.tpn}</TableCell>
                    )}
                    {showOrphanCol('merchant') && (
                      <TableCell>
                        <span className="flex items-center gap-1.5">
                          <Building2 className="h-3 w-3 shrink-0 text-muted-foreground" />
                          {t.merchantName}
                        </span>
                      </TableCell>
                    )}
                    {showOrphanCol('location') && (
                      <TableCell>
                        <span className="flex items-center gap-1.5">
                          <MapPin className="h-3 w-3 shrink-0 text-muted-foreground" />
                          {t.locationName || '—'}
                        </span>
                      </TableCell>
                    )}
                    {showOrphanCol('type') && (
                      <TableCell className="capitalize text-muted-foreground">{t.terminalType}</TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </PanelSection>
        </Panel>
      )}
    </div>
  )
}

// ── Terminal table row ────────────────────────────────────────────────────────

/**
 * `showCol` is passed down rather than read from a hook here, so the row and the
 * header above it are driven by one source of truth and can never disagree.
 */
function TerminalRow({ terminal: t, showCol }: {
  terminal: PaymentTerminalRow
  showCol: (id: string) => boolean
}) {
  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{t.terminalName}</div>
        {t.terminalModel && (
          <div className="text-xs text-muted-foreground">{t.terminalModel}</div>
        )}
        {t.isOrphan && (
          <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <Link2Off className="h-2.5 w-2.5 shrink-0" /> Orphan
          </span>
        )}
      </TableCell>
      {showCol('tpn') && (
        <TableCell>
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{t.tpn}</code>
        </TableCell>
      )}
      {showCol('merchant') && (
        <TableCell className="text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Building2 className="h-3 w-3 shrink-0" />
            {t.merchantName}
          </span>
        </TableCell>
      )}
      {showCol('location') && (
        <TableCell className="text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3 shrink-0" />
            {t.locationName || '—'}
          </span>
        </TableCell>
      )}
      {showCol('station') && (
        <TableCell className="text-xs text-muted-foreground">
          {t.stationName
            ? <span className="flex items-center gap-1"><Terminal className="h-3 w-3 shrink-0" />{t.stationName}</span>
            : <span>—</span>}
        </TableCell>
      )}
      {showCol('connection') && (
        <TableCell>
          <ConnectionCell status={t.connectionStatus} />
          {t.lastError && (
            <p className="mt-0.5 max-w-32 truncate text-[10px] text-muted-foreground" title={t.lastError}>
              {t.lastError}
            </p>
          )}
        </TableCell>
      )}
      {showCol('lastSeen') && (
        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
          {fmtLastSeen(t.lastSeenAt)}
        </TableCell>
      )}
      {showCol('lastTxn') && (
        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
          {fmtHours(t.hoursSinceLastTransaction)}
        </TableCell>
      )}
      {showCol('settlement') && (
        <TableCell>
          <SettlementCell status={t.settlementStatus} hours={t.hoursSinceLastTransaction} />
        </TableCell>
      )}
      {showCol('authKey') && (
        <TableCell>
          {t.authStatus === 'valid' ? (
            <span className="flex items-center gap-1 text-xs">
              <CheckCircle2 className="h-3 w-3 shrink-0" /> Valid
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs font-medium">
              <KeyRound className="h-3 w-3 shrink-0" /> Missing
            </span>
          )}
        </TableCell>
      )}
      {showCol('env') && (
        <TableCell className="text-xs text-muted-foreground">
          {t.apiEnvironment === 'production' ? 'Prod' : 'Sandbox'}
        </TableCell>
      )}
    </TableRow>
  )
}
