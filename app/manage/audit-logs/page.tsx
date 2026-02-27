'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { ChevronDown, ChevronUp, Download, RefreshCcwDot, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { usePlatformAuditLogs } from '@/lib/queries/use-platform-analytics'
import type { PlatformAuditLogFilters, PlatformAuditLogRow } from '@/app/manage/actions/hq-platform/analytics'
import { getPlatformMerchants, type PlatformMerchant } from '@/app/manage/actions/hq-platform/transactions'

const PAGE_SIZE = 50

const COMMON_ACTION_CATEGORIES = [
  'merchant',
  'user_management',
  'device',
  'staff',
  'notes',
  'settings',
  'authentication',
  'order',
  'inventory',
  'system',
]

function formatDateTime(value?: string): string {
  if (!value) return '-'
  return format(new Date(value), 'MMM d, yyyy h:mm:ss a')
}

function formatActionLabel(value?: string): string {
  if (!value) return '-'
  return value
    .replace(/\./g, ' ')
    .replace(/_/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function normalizeStatus(value?: string): 'success' | 'failed' | 'unknown' {
  if (!value) return 'success'
  const normalized = value.toLowerCase()
  if (normalized === 'failed' || normalized === 'error') return 'failed'
  if (normalized === 'success') return 'success'
  return 'unknown'
}

function severityClass(value?: string): string {
  const normalized = (value || '').toLowerCase()
  if (normalized === 'critical' || normalized === 'error') {
    return 'border-red-300 bg-red-100 text-red-800'
  }
  if (normalized === 'warning') {
    return 'border-amber-300 bg-amber-100 text-amber-800'
  }
  return 'border-blue-300 bg-blue-100 text-blue-800'
}

function statusClass(value: 'success' | 'failed' | 'unknown'): string {
  if (value === 'failed') {
    return 'border-red-300 bg-red-100 text-red-800'
  }
  if (value === 'unknown') {
    return 'border-slate-300 bg-slate-100 text-slate-800'
  }
  return 'border-emerald-300 bg-emerald-100 text-emerald-800'
}

function escapeCsv(value: unknown): string {
  const raw = value == null ? '' : String(value)
  return `"${raw.replace(/"/g, '""')}"`
}

function buildCsv(rows: PlatformAuditLogRow[]): string {
  const headers = [
    'Timestamp',
    'Actor Name',
    'Actor Email',
    'Actor Role',
    'Action',
    'Category',
    'Resource Type',
    'Resource Name',
    'Resource ID',
    'Merchant',
    'Location',
    'Severity',
    'Status',
    'Error Message',
    'Changes',
    'Metadata',
  ]

  const lines = rows.map((row) => {
    const status = normalizeStatus(row.status)
    return [
      row.created_at,
      row.actor_name,
      row.actor_email,
      row.actor_role,
      row.action,
      row.action_category,
      row.resource_type,
      row.resource_name,
      row.resource_id,
      row.merchant_name || row.merchant_id,
      row.location_name || row.location_id,
      row.severity,
      status,
      row.error_message,
      row.changes ? JSON.stringify(row.changes) : '',
      row.metadata ? JSON.stringify(row.metadata) : '',
    ]
      .map(escapeCsv)
      .join(',')
  })

  return [headers.map(escapeCsv).join(','), ...lines].join('\n')
}

function downloadCsv(filename: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export default function AuditLogsPage() {
  const [search, setSearch] = useState('')
  const [actor, setActor] = useState('')
  const [actionCategory, setActionCategory] = useState('all')
  const [severity, setSeverity] = useState('all')
  const [status, setStatus] = useState<'all' | 'success' | 'failed'>('all')
  const [merchantId, setMerchantId] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [resourceType, setResourceType] = useState('')
  const [page, setPage] = useState(1)
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [exportNote, setExportNote] = useState<string | null>(null)
  const [merchants, setMerchants] = useState<PlatformMerchant[]>([])
  const [loadingMerchants, setLoadingMerchants] = useState(true)

  const filters = useMemo<PlatformAuditLogFilters>(
    () => ({
      search: search.trim() || undefined,
      actor: actor.trim() || undefined,
      actionCategory: actionCategory === 'all' ? undefined : actionCategory,
      severity: severity === 'all' ? undefined : severity,
      status: status === 'all' ? undefined : status,
      merchantIds: merchantId === 'all' ? undefined : [merchantId],
      dateFrom: dateFrom ? new Date(`${dateFrom}T00:00:00`).toISOString() : undefined,
      dateTo: dateTo ? new Date(`${dateTo}T23:59:59.999`).toISOString() : undefined,
      resourceType: resourceType.trim() || undefined,
    }),
    [search, actor, actionCategory, severity, status, merchantId, dateFrom, dateTo, resourceType]
  )

  useEffect(() => {
    let active = true
    setLoadingMerchants(true)

    getPlatformMerchants()
      .then((data) => {
        if (!active) return
        setMerchants(data)
      })
      .catch((error) => {
        console.error('[AuditLogsPage] Failed to load merchants:', error)
      })
      .finally(() => {
        if (!active) return
        setLoadingMerchants(false)
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    setPage(1)
  }, [filters])

  const { data: auditResult, isLoading, isFetching, refetch } = usePlatformAuditLogs(
    filters,
    PAGE_SIZE,
    (page - 1) * PAGE_SIZE
  )

  const rows = auditResult?.data || []
  const total = auditResult?.total || 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const showingFrom = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const showingTo = total === 0 ? 0 : Math.min((page - 1) * PAGE_SIZE + rows.length, total)

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages)
    }
  }, [page, totalPages])

  const clearFilters = () => {
    setSearch('')
    setActor('')
    setActionCategory('all')
    setSeverity('all')
    setStatus('all')
    setMerchantId('all')
    setDateFrom('')
    setDateTo('')
    setResourceType('')
    setPage(1)
  }

  const handleExport = async () => {
    setIsExporting(true)
    setExportNote(null)

    try {
      const { getPlatformAuditLogsExport } = await import('@/app/manage/actions/hq-platform/analytics')
      const result = await getPlatformAuditLogsExport(filters, 10000)
      const csv = buildCsv(result.data)
      const fileDate = format(new Date(), 'yyyy-MM-dd_HHmm')
      downloadCsv(`DEXA_Admin_Audit_Logs_${fileDate}.csv`, csv)

      if (result.capped) {
        setExportNote(`Export capped at ${result.cap.toLocaleString()} rows.`)
      }
    } catch (error) {
      console.error('[AuditLogsPage] Failed to export audit logs:', error)
      setExportNote('Export failed. Please retry.')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Audit Logs</h1>
          <p className="text-muted-foreground">Track admin actions with filterable, exportable event history.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCcwDot className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button variant="outline" onClick={handleExport} disabled={isExporting}>
            <Download className="mr-2 h-4 w-4" />
            {isExporting ? 'Exporting...' : 'Export CSV'}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Search by actor/resource and narrow by category, severity, merchant, and date range.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-4">
            <label className="flex flex-col gap-1 text-sm md:col-span-2">
              <span className="text-muted-foreground">Search</span>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Action, actor, resource name..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Actor</span>
              <Input
                placeholder="Name or email"
                value={actor}
                onChange={(event) => setActor(event.target.value)}
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Resource Type</span>
              <Input
                placeholder="merchant, invitation, staff_member"
                value={resourceType}
                onChange={(event) => setResourceType(event.target.value)}
              />
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-6">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Category</span>
              <select
                className="h-9 rounded-md border bg-background px-2"
                value={actionCategory}
                onChange={(event) => setActionCategory(event.target.value)}
              >
                <option value="all">All categories</option>
                {COMMON_ACTION_CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {formatActionLabel(value)}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Severity</span>
              <select
                className="h-9 rounded-md border bg-background px-2"
                value={severity}
                onChange={(event) => setSeverity(event.target.value)}
              >
                <option value="all">All severities</option>
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="error">Error</option>
                <option value="critical">Critical</option>
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Status</span>
              <select
                className="h-9 rounded-md border bg-background px-2"
                value={status}
                onChange={(event) => setStatus(event.target.value as 'all' | 'success' | 'failed')}
              >
                <option value="all">All</option>
                <option value="success">Success</option>
                <option value="failed">Failed</option>
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm md:col-span-2">
              <span className="text-muted-foreground">Merchant</span>
              <select
                className="h-9 rounded-md border bg-background px-2"
                value={merchantId}
                onChange={(event) => setMerchantId(event.target.value)}
                disabled={loadingMerchants}
              >
                <option value="all">All merchants</option>
                {merchants.map((merchant) => (
                  <option key={merchant.id} value={merchant.id}>
                    {merchant.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-end">
              <Button variant="ghost" className="w-full" onClick={clearFilters}>Clear</Button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Date From</span>
              <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Date To</span>
              <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            </label>
          </div>

          {exportNote && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800">{exportNote}</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="max-h-[62vh] overflow-auto rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 z-20 bg-card">
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>Merchant</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[56px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading || isFetching ? (
                  Array.from({ length: 8 }).map((_, index) => (
                    <TableRow key={`audit-loading-${index}`}>
                      <TableCell colSpan={9}><Skeleton className="h-8 w-full" /></TableCell>
                    </TableRow>
                  ))
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">No audit logs found.</TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => {
                    const isExpanded = expandedRowId === row.id
                    const statusValue = normalizeStatus(row.status)

                    return (
                      <Fragment key={row.id}>
                        <TableRow className={cn(statusValue === 'failed' && 'bg-red-50/40 hover:bg-red-50/60')}>
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(row.created_at)}</TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-0.5">
                              <span className="text-sm font-medium">{row.actor_name || '-'}</span>
                              <span className="text-xs text-muted-foreground">{row.actor_email || row.actor_role || '-'}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm font-medium">{formatActionLabel(row.action)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">{row.action_category || '-'}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-0.5">
                              <span className="text-sm">{row.resource_type || '-'}</span>
                              <span className="text-xs text-muted-foreground">{row.resource_name || row.resource_id || '-'}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{row.merchant_name || '-'}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={severityClass(row.severity)}>{row.severity || 'info'}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={statusClass(statusValue)}>{statusValue}</Badge>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setExpandedRowId(isExpanded ? null : row.id)}
                            >
                              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </Button>
                          </TableCell>
                        </TableRow>

                        {isExpanded && (
                          <TableRow>
                            <TableCell colSpan={9} className="bg-muted/30">
                              <div className="grid gap-4 p-3 md:grid-cols-2">
                                <div className="space-y-2">
                                  <p className="text-xs font-semibold uppercase text-muted-foreground">Changes</p>
                                  <pre className="max-h-72 overflow-auto rounded-md border bg-background p-3 text-xs">
                                    {row.changes ? JSON.stringify(row.changes, null, 2) : 'No change payload'}
                                  </pre>
                                </div>
                                <div className="space-y-2">
                                  <p className="text-xs font-semibold uppercase text-muted-foreground">Metadata</p>
                                  <pre className="max-h-72 overflow-auto rounded-md border bg-background p-3 text-xs">
                                    {row.metadata ? JSON.stringify(row.metadata, null, 2) : 'No metadata payload'}
                                  </pre>
                                  {row.error_message && (
                                    <div className="rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-800">
                                      {row.error_message}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 flex flex-col gap-2 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
            <span>
              Showing {showingFrom.toLocaleString()}-{showingTo.toLocaleString()} of {total.toLocaleString()}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                Previous
              </Button>
              <span>
                Page {page.toLocaleString()} of {totalPages.toLocaleString()}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
