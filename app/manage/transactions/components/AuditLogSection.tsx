'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { InfoIcon } from '@/components/ui/info-icon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { PaginationBar } from '@/components/dashboard/PaginationBar'
import type { PaginationMeta } from '@/types/pagination'
import { cn } from '@/lib/utils'
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
import { paymentAuditEventDetailHref } from '../routes'
import {
  CardGridEmpty,
  FilterDate,
  FilterSelect,
  LedgerToolbar,
  LoadError,
  RecordCardSkeletons,
  RecordLinkCard,
  RowLink,
  TableEmptyRow,
} from './ledger-primitives'

// 10 a page, so the table sits in the page with no scroll of its own.
const PAGE_SIZE = 10

/** A column the tablet table leaves out; it joins at `xl`. */
const XL_ONLY = 'hidden xl:table-cell'
/** Per-column visibility, in table order, shared by the loading rows. */
const COLUMN_CLASSES = ['', '', XL_ONLY, '', '', XL_ONLY, '', XL_ONLY, '', XL_ONLY]

const ACTION_OPTIONS = PLATFORM_PAYMENT_AUDIT_ACTIONS.map((actionValue) => ({
  value: actionValue,
  label: formatActionLabel(actionValue),
}))

const OUTCOME_OPTIONS = [
  { value: 'success', label: 'Success' },
  { value: 'failed', label: 'Failed' },
]

export function formatDateTime(value?: string): string {
  if (!value) return '—'
  return format(new Date(value), 'MMM d, yyyy h:mm:ss a')
}

export function formatActionLabel(value: string): string {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function AuditLogSection() {
  const router = useRouter()
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
  const errorCode = auditResult?.errorCode

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages)
    }
  }, [page, totalPages])

  const pagination: PaginationMeta = {
    page,
    pageSize: PAGE_SIZE,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  }

  const merchantOptions = useMemo(
    () => merchants.map((merchant) => ({ value: merchant.id, label: merchant.name })),
    [merchants]
  )

  const hasActiveFilters =
    search !== '' ||
    userFilter !== '' ||
    actionFilter !== 'all' ||
    merchantId !== 'all' ||
    outcome !== 'all' ||
    dateFrom !== '' ||
    dateTo !== ''

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

  const showSkeleton = isLoading || isFetching
  const emptyTitle = hasActiveFilters
    ? 'No payment audit events match these filters'
    : 'No payment audit events yet'
  const emptyHint = hasActiveFilters
    ? 'Clear the filters to widen the results.'
    : 'Events appear here when an admin lists, opens, exports or searches payment data.'

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex items-center gap-1">
        <p className="text-sm text-muted-foreground tabular-nums">{total.toLocaleString()} events</p>
        <InfoIcon tip="Total number of admin audit events logged matching current filters." side="right" />
      </div>

      <LedgerToolbar onRefresh={() => void refetch()} refreshing={isFetching}>
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search email or resource ID"
          aria-label="Search by email or resource ID"
          className="h-9 w-full text-[0.8125rem] sm:w-64"
        />
        <Input
          value={userFilter}
          onChange={(event) => setUserFilter(event.target.value)}
          placeholder="User email"
          aria-label="Filter by user email"
          className="h-9 w-full text-[0.8125rem] sm:w-48"
        />
        <FilterSelect
          value={actionFilter}
          onValueChange={(value) => setActionFilter(value as 'all' | PlatformPaymentAuditActionType)}
          options={ACTION_OPTIONS}
          allLabel="All actions"
          ariaLabel="Action"
        />
        <FilterSelect
          value={merchantId}
          onValueChange={setMerchantId}
          options={merchantOptions}
          allLabel="All merchants"
          ariaLabel="Merchant"
          disabled={loadingMerchants}
        />
        <FilterSelect
          value={outcome}
          onValueChange={(value) => setOutcome(value as 'all' | 'success' | 'failed')}
          options={OUTCOME_OPTIONS}
          allLabel="All outcomes"
          ariaLabel="Outcome"
        />
        <FilterDate value={dateFrom} onChange={setDateFrom} placeholder="From date" />
        <FilterDate value={dateTo} onChange={setDateTo} placeholder="To date" />
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" className="h-9 px-4" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
      </LedgerToolbar>

      {errorCode && (
        <LoadError
          title="Payment audit log is unavailable"
          detail={`Migration 029_adm_019_admin_payment_audit_logging.sql has not been applied. Error ${errorCode}`}
        />
      )}

      {/* A table from `md`; role, resource ID, IP and fields join at `xl`.
          Every row opens the event's own page. */}
      <Table
        variant="data"
        bounded={false}
        containerClassName="hidden md:block"
        className="md:min-w-[720px] xl:min-w-[1150px]"
      >
        <TableHeader>
          <TableRow>
            <TableHead>
              <span className="inline-flex items-center gap-1">Timestamp <InfoIcon tip="Exact UTC date and time the admin action was performed." side="bottom" /></span>
            </TableHead>
            <TableHead>
              <span className="inline-flex items-center gap-1">User <InfoIcon tip="The admin's email address. Each access is attributed to a specific user for accountability." side="bottom" /></span>
            </TableHead>
            <TableHead className={XL_ONLY}>
              <span className="inline-flex items-center gap-1">Role <InfoIcon tip="The user's permission level at the time of the action (e.g. admin, viewer, owner)." side="bottom" /></span>
            </TableHead>
            <TableHead>
              <span className="inline-flex items-center gap-1">Action <InfoIcon tip="What the user did — list (viewed a list), detail (opened a specific record), export (downloaded data), or search (queried by card number or ID)." side="bottom" /></span>
            </TableHead>
            <TableHead>Resource type</TableHead>
            <TableHead className={XL_ONLY}>Resource ID</TableHead>
            <TableHead>
              <span className="inline-flex items-center gap-1">Outcome <InfoIcon tip="Whether the action completed successfully. Failed actions may indicate permission errors or system issues." side="bottom" /></span>
            </TableHead>
            <TableHead className={XL_ONLY}>IP address</TableHead>
            <TableHead>Merchant</TableHead>
            <TableHead className={XL_ONLY}>
              <span className="inline-flex items-center gap-1">Fields accessed <InfoIcon tip="Specific data fields the user viewed or exported. Used to demonstrate the minimum necessary data access for compliance audits." side="bottom" /></span>
            </TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {showSkeleton ? (
            Array.from({ length: 6 }).map((_, rowIndex) => (
              <TableRow key={`payment-audit-loading-${rowIndex}`}>
                {COLUMN_CLASSES.map((cellClass, cellIndex) => (
                  <TableCell key={`payment-audit-loading-${rowIndex}-${cellIndex}`} className={cellClass}>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : rows.length === 0 ? (
            <TableEmptyRow colSpan={COLUMN_CLASSES.length} title={emptyTitle} hint={emptyHint} />
          ) : (
            rows.map((row) => {
              const href = paymentAuditEventDetailHref(row.id)
              return (
                <TableRow key={row.id} className="cursor-pointer" onClick={() => router.push(href)}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
                    <RowLink href={href}>{formatDateTime(row.event_timestamp)}</RowLink>
                  </TableCell>
                  <TableCell className="text-sm">{row.user_email || '—'}</TableCell>
                  <TableCell className={`${XL_ONLY} text-sm text-muted-foreground`}>{row.user_role || '—'}</TableCell>
                  {/* A failed event is marked by weight, not a red row (§3.5). */}
                  <TableCell
                    className={cn(
                      'text-sm',
                      row.success ? 'text-muted-foreground' : 'font-medium text-foreground'
                    )}
                  >
                    {formatActionLabel(row.action)}
                  </TableCell>
                  <TableCell className="text-sm">{row.resource_type}</TableCell>
                  <TableCell className={`${XL_ONLY} font-mono text-xs`}>{row.resource_id || '—'}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{row.success ? 'Success' : 'Failed'}</Badge>
                  </TableCell>
                  <TableCell className={`${XL_ONLY} font-mono text-xs text-muted-foreground`}>{row.ip_address || '—'}</TableCell>
                  <TableCell className="text-sm">
                    {row.merchant_name || row.merchant_id || '—'}
                  </TableCell>
                  <TableCell className={XL_ONLY}>
                    {row.fields_accessed.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {row.fields_accessed.map((field) => (
                          <Badge key={`${row.id}-${field}`} variant="outline" className="font-mono text-[10px]">
                            {field}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              )
            })
          )}
        </TableBody>
      </Table>

      {/* Phones: action, outcome, who and when; the rest is on the event's page. */}
      <div className="grid min-w-0 grid-cols-1 gap-3 md:hidden">
        {showSkeleton ? (
          <RecordCardSkeletons count={4} />
        ) : rows.length === 0 ? (
          <CardGridEmpty title={emptyTitle} hint={emptyHint} />
        ) : (
          rows.map((row) => (
            <RecordLinkCard
              key={row.id}
              href={paymentAuditEventDetailHref(row.id)}
              title={formatActionLabel(row.action)}
              figure={row.success ? 'Success' : 'Failed'}
              subtitle={row.user_email || '—'}
              status={formatDateTime(row.event_timestamp)}
            />
          ))
        )}
      </div>

      <PaginationBar
        pagination={pagination}
        onPageChange={setPage}
        itemLabel="events"
        isLoading={isFetching}
      />
      {total > 0 && total <= PAGE_SIZE && (
        <p className="mt-3 text-xs text-muted-foreground sm:text-sm tabular-nums">
          {total.toLocaleString()} events
        </p>
      )}
    </div>
  )
}
