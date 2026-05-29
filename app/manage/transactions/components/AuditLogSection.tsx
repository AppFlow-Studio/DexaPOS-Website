'use client'

import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { ChevronDown, ChevronUp, RefreshCcwDot, ShieldCheck } from 'lucide-react'
import { InfoIcon } from '@/components/ui/info-icon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
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
import {
  getPlatformMerchants,
  PlatformMerchant,
  PlatformPaymentAuditLogFilters,
} from '@/app/manage/actions/hq-platform/transactions'
import {
  PLATFORM_PAYMENT_AUDIT_ACTIONS,
  type PlatformPaymentAuditActionType,
} from '@/app/manage/actions/hq-platform/transactions-shared'
import { usePlatformPaymentAuditLogs } from '@/lib/queries/use-platform-analytics'

const PAGE_SIZE = 25

function formatDateTime(value?: string): string {
  if (!value) return '-'
  return format(new Date(value), 'MMM d, yyyy h:mm:ss a')
}

function formatActionLabel(value: string): string {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function getOutcomeBadge(success: boolean) {
  if (success) {
    return (
      <Badge variant="outline" className="border-emerald-300 bg-emerald-100 text-emerald-800">
        Success
      </Badge>
    )
  }

  return (
    <Badge variant="outline" className="border-red-300 bg-red-100 text-red-800">
      Failed
    </Badge>
  )
}

export function AuditLogSection() {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [userFilter, setUserFilter] = useState('')
  const [actionFilter, setActionFilter] = useState<'all' | PlatformPaymentAuditActionType>('all')
  const [merchantId, setMerchantId] = useState('all')
  const [outcome, setOutcome] = useState<'all' | 'success' | 'failed'>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [merchants, setMerchants] = useState<PlatformMerchant[]>([])
  const [loadingMerchants, setLoadingMerchants] = useState(true)

  const filters = useMemo<PlatformPaymentAuditLogFilters>(
    () => ({
      search: search.trim() || undefined,
      user: userFilter.trim() || undefined,
      action: actionFilter === 'all' ? undefined : actionFilter,
      merchantIds: merchantId !== 'all' ? [merchantId] : undefined,
      outcome: outcome === 'all' ? undefined : outcome,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    }),
    [search, userFilter, actionFilter, merchantId, outcome, dateFrom, dateTo]
  )

  useEffect(() => {
    let active = true
    setLoadingMerchants(true)

    getPlatformMerchants()
      .then((rows) => {
        if (!active) return
        setMerchants(rows)
      })
      .catch((error) => {
        console.error('[AuditLogSection] Failed to load merchants:', error)
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
  }, [search, userFilter, actionFilter, merchantId, outcome, dateFrom, dateTo])

  const {
    data: auditResult,
    isLoading,
    isFetching,
    refetch,
  } = usePlatformPaymentAuditLogs(filters, PAGE_SIZE, (page - 1) * PAGE_SIZE)

  const rows = auditResult?.data || []
  const total = auditResult?.total || 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const showingFrom = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const showingTo = total === 0 ? 0 : Math.min((page - 1) * PAGE_SIZE + rows.length, total)
  const errorCode = auditResult?.errorCode

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages)
    }
  }, [page, totalPages])

  const clearFilters = () => {
    setSearch('')
    setUserFilter('')
    setActionFilter('all')
    setMerchantId('all')
    setOutcome('all')
    setDateFrom('')
    setDateTo('')
    setPage(1)
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" />
                Payment Audit Log
                <InfoIcon tip="Immutable record of every time an admin accessed, searched, exported, or viewed payment data. Used to demonstrate compliance with data privacy requirements and to investigate unauthorized access." />
              </CardTitle>
              <CardDescription>
                Track admin access to sensitive payment data (list, detail, export, and card-last-four search).
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1">
                <Badge variant="outline">{total.toLocaleString()} events</Badge>
                <InfoIcon tip="Total number of admin audit events logged matching current filters." side="left" />
              </span>
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm">
                  {open ? (
                    <>
                      Hide
                      <ChevronUp className="ml-2 h-4 w-4" />
                    </>
                  ) : (
                    <>
                      Show
                      <ChevronDown className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </CollapsibleTrigger>
            </div>
          </div>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-7">
              <label className="flex flex-col gap-1 text-sm md:col-span-2">
                <span className="text-muted-foreground">Search (email or resource id)</span>
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="john@company.com or payment UUID"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted-foreground">User</span>
                <Input
                  value={userFilter}
                  onChange={(event) => setUserFilter(event.target.value)}
                  placeholder="Filter by user email"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted-foreground">Action</span>
                <select
                  className="h-9 rounded-md border bg-background px-2"
                  value={actionFilter}
                  onChange={(event) => setActionFilter(event.target.value as 'all' | PlatformPaymentAuditActionType)}
                >
                  <option value="all">All actions</option>
                  {PLATFORM_PAYMENT_AUDIT_ACTIONS.map((actionValue) => (
                    <option key={actionValue} value={actionValue}>
                      {formatActionLabel(actionValue)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-sm">
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

              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted-foreground">Outcome</span>
                <select
                  className="h-9 rounded-md border bg-background px-2"
                  value={outcome}
                  onChange={(event) => setOutcome(event.target.value as 'all' | 'success' | 'failed')}
                >
                  <option value="all">All</option>
                  <option value="success">Success</option>
                  <option value="failed">Failed</option>
                </select>
              </label>

              <div className="flex items-end">
                <Button variant="ghost" className="w-full" onClick={clearFilters}>
                  Clear
                </Button>
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

              <div className="md:col-span-2 flex items-end justify-end">
                <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>
                  <RefreshCcwDot className="mr-2 h-4 w-4" />
                  Refresh
                </Button>
              </div>
            </div>

            {errorCode && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                Payment audit logs unavailable (migration `029_adm_019_admin_payment_audit_logging.sql` pending approval/apply).{` Error: ${errorCode}`}
              </div>
            )}

            <Table containerClassName="max-h-[44vh] overflow-auto rounded-md border">
              <TableHeader className="sticky top-0 z-20 bg-card">
                <TableRow>
                  <TableHead>
                    <span className="inline-flex items-center gap-1">Timestamp <InfoIcon tip="Exact UTC date and time the admin action was performed." side="bottom" /></span>
                  </TableHead>
                  <TableHead>
                    <span className="inline-flex items-center gap-1">User <InfoIcon tip="The admin's email address. Each access is attributed to a specific user for accountability." side="bottom" /></span>
                  </TableHead>
                  <TableHead>
                    <span className="inline-flex items-center gap-1">Role <InfoIcon tip="The user's permission level at the time of the action (e.g. admin, viewer, owner)." side="bottom" /></span>
                  </TableHead>
                  <TableHead>
                    <span className="inline-flex items-center gap-1">Action <InfoIcon tip="What the user did — list (viewed a list), detail (opened a specific record), export (downloaded data), or search (queried by card number or ID)." side="bottom" /></span>
                  </TableHead>
                  <TableHead>Resource Type</TableHead>
                  <TableHead>Resource ID</TableHead>
                  <TableHead>
                    <span className="inline-flex items-center gap-1">Outcome <InfoIcon tip="Whether the action completed successfully. Failed actions may indicate permission errors or system issues." side="bottom" /></span>
                  </TableHead>
                  <TableHead>IP Address</TableHead>
                  <TableHead>Merchant</TableHead>
                  <TableHead>
                    <span className="inline-flex items-center gap-1">Fields Accessed <InfoIcon tip="Specific data fields the user viewed or exported. Used to demonstrate the minimum necessary data access for compliance audits." side="bottom" /></span>
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {isLoading || isFetching ? (
                  Array.from({ length: 6 }).map((_, rowIndex) => (
                    <TableRow key={`payment-audit-loading-${rowIndex}`}>
                      {Array.from({ length: 10 }).map((__, cellIndex) => (
                        <TableCell key={`payment-audit-loading-${rowIndex}-${cellIndex}`}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                      No payment audit events found.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row.id} className={!row.success ? 'bg-red-50/60 hover:bg-red-50/80' : undefined}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatDateTime(row.event_timestamp)}
                      </TableCell>
                      <TableCell className="text-sm">{row.user_email || '-'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{row.user_role || '-'}</TableCell>
                      <TableCell className="text-sm font-medium">{formatActionLabel(row.action)}</TableCell>
                      <TableCell className="text-sm">{row.resource_type}</TableCell>
                      <TableCell className="font-mono text-xs">{row.resource_id || '-'}</TableCell>
                      <TableCell>{getOutcomeBadge(row.success)}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{row.ip_address || '-'}</TableCell>
                      <TableCell className="text-sm">
                        {row.merchant_name || (row.merchant_id ? row.merchant_id : '-')}
                      </TableCell>
                      <TableCell>
                        {row.fields_accessed.length === 0 ? (
                          <span className="text-muted-foreground">-</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {row.fields_accessed.map((field) => (
                              <Badge key={`${row.id}-${field}`} variant="secondary" className="font-mono text-[10px]">
                                {field}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            <div className="flex flex-col gap-2 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
              <span>
                Showing {showingFrom.toLocaleString()}-{showingTo.toLocaleString()} of {total.toLocaleString()}
              </span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
                  Previous
                </Button>
                <span>
                  Page {page.toLocaleString()} of {totalPages.toLocaleString()}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}
