'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight, Search } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { PanelSection } from '@/components/dashboard/shell'
import { PaginationBar } from '@/components/dashboard/PaginationBar'
import { useClientPagination } from '@/lib/hooks/useClientPagination'
import {
  CardField,
  CardFields,
  CardGridEmpty,
  RecordCardSkeletons,
  TableEmptyRow,
} from '@/app/manage/transactions/components/ledger-primitives'
import { Money } from './money'
import { MerchantAvatar } from './merchant-avatar'
import type { MerchantFeeRow } from '@/app/manage/actions/hq-platform/platform-fees'

const COLUMN_COUNT = 8

/**
 * The per-merchant fee table (a `PanelSection`; the host supplies the `Panel`).
 * Rows arrive ranked by net fee, so page 1 holds the largest earners (§5.7).
 * The table shows from `xl`, where its `min-w` fits; below that, record cards
 * (§5.3).
 */
export function MerchantFeesTable({
  rows,
  loading,
}: {
  rows: MerchantFeeRow[]
  loading: boolean
}) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const query = search.trim().toLowerCase()
  const filtered = useMemo(() => {
    if (!query) return rows
    return rows.filter(
      (r) =>
        r.merchant_name.toLowerCase().includes(query) ||
        r.merchant_id.toLowerCase().includes(query)
    )
  }, [rows, query])

  const { pageRows, pagination, setPage } = useClientPagination(filtered, 10)

  const emptyTitle = query
    ? `No merchants match “${search.trim()}”`
    : 'No platform fees in this period'
  const emptyHint = query
    ? 'Clear the search to see every merchant.'
    : 'Merchants appear here once they take card payments with a surcharge.'

  const hrefFor = (id: string) => `/manage/platform-fees/${id}`

  return (
    <PanelSection
      label="Merchants"
      caption="Open a merchant for per-location and per-payment fee detail."
      action={
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            placeholder="Search merchants…"
            aria-label="Search merchants"
            className="h-9 pl-9 text-[0.8125rem]"
          />
        </div>
      }
    >
      <Table variant="data" containerClassName="hidden xl:block" className="min-w-[900px]">
        <TableHeader>
          <TableRow>
            <TableHead>Merchant</TableHead>
            <TableHead className="text-right">Locations</TableHead>
            <TableHead className="text-right">Card surcharge</TableHead>
            <TableHead className="text-right">Refunded</TableHead>
            <TableHead className="text-right">Net fee</TableHead>
            <TableHead className="text-right">Payments</TableHead>
            <TableHead className="text-right">Avg fee</TableHead>
            <TableHead className="w-8">
              <span className="sr-only">Open</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell colSpan={COLUMN_COUNT}>
                  <Skeleton className="h-6 w-full" />
                </TableCell>
              </TableRow>
            ))
          ) : pageRows.length === 0 ? (
            <TableEmptyRow colSpan={COLUMN_COUNT} title={emptyTitle} hint={emptyHint} />
          ) : (
            pageRows.map((r) => {
              const refunded = r.refunded_dual_pricing_fee + r.refunded_tip_fee
              const avg = r.payment_count ? r.net_platform_fee / r.payment_count : null
              return (
                <TableRow
                  key={r.merchant_id}
                  // The whole row opens the merchant; the name is the keyboard
                  // and screen-reader route to the same place.
                  onClick={() => router.push(hrefFor(r.merchant_id))}
                  className="cursor-pointer"
                >
                  <TableCell className="font-medium">
                    <Link
                      href={hrefFor(r.merchant_id)}
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-3 rounded-full hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <MerchantAvatar name={r.merchant_name} />
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate">{r.merchant_name}</span>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {r.merchant_id.slice(0, 8)}…
                        </span>
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.location_count}</TableCell>
                  <TableCell className="text-right">
                    <Money value={r.gross_dual_pricing_fee} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Money value={-refunded} />
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    <Money value={r.net_platform_fee} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.payment_count.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Money value={avg} />
                  </TableCell>
                  <TableCell className="text-right">
                    <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
                  </TableCell>
                </TableRow>
              )
            })
          )}
        </TableBody>
      </Table>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:hidden">
        {loading ? (
          <RecordCardSkeletons count={4} />
        ) : pageRows.length === 0 ? (
          <CardGridEmpty title={emptyTitle} hint={emptyHint} />
        ) : (
          pageRows.map((r) => {
            const refunded = r.refunded_dual_pricing_fee + r.refunded_tip_fee
            const avg = r.payment_count ? r.net_platform_fee / r.payment_count : null
            return (
              <Link
                key={r.merchant_id}
                href={hrefFor(r.merchant_id)}
                className="block min-w-0 rounded-2xl border-0 bg-muted/45 p-4 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-center gap-3">
                  <MerchantAvatar name={r.merchant_name} className="hidden sm:inline-flex" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{r.merchant_name}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {r.merchant_id.slice(0, 8)}…
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                </div>
                <CardFields>
                  <CardField label="Net fee" value={<Money value={r.net_platform_fee} />} />
                  <CardField label="Card surcharge" value={<Money value={r.gross_dual_pricing_fee} />} />
                  <CardField label="Refunded" value={<Money value={-refunded} />} />
                  <CardField label="Payments" value={r.payment_count.toLocaleString()} />
                  <CardField label="Avg fee" value={<Money value={avg} />} />
                  <CardField label="Locations" value={r.location_count} />
                </CardFields>
              </Link>
            )
          })
        )}
      </div>

      <PaginationBar pagination={pagination} onPageChange={setPage} itemLabel="merchants" />
      {!loading && pagination.total > 0 && pagination.total <= pagination.pageSize && (
        <p className="mt-3 text-xs text-muted-foreground tabular-nums sm:text-sm">
          {pagination.total} merchant{pagination.total === 1 ? '' : 's'}
        </p>
      )}
    </PanelSection>
  )
}
