'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
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
import { Money } from './money'
import { MerchantAvatar } from './merchant-avatar'
import type { MerchantFeeRow } from '@/app/manage/actions/hq-platform/platform-fees'

export function MerchantFeesTable({
  rows,
  loading,
}: {
  rows: MerchantFeeRow[]
  loading: boolean
}) {
  const [search, setSearch] = useState('')
  const filtered = useMemo(() => {
    if (!search.trim()) return rows
    const q = search.trim().toLowerCase()
    return rows.filter(
      (r) =>
        r.merchant_name.toLowerCase().includes(q) ||
        r.merchant_id.toLowerCase().includes(q)
    )
  }, [rows, search])

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
        <div>
          <h3 className="text-sm font-semibold">Merchants</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Click a row to drill into per-location and per-payment fee detail.
          </p>
        </div>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search merchants…"
          className="w-full max-w-xs"
        />
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Merchant</TableHead>
              <TableHead className="text-right">Locations</TableHead>
              <TableHead className="text-right">Card surcharge</TableHead>
              <TableHead className="text-right">Refunded</TableHead>
              <TableHead className="text-right">Net fee</TableHead>
              <TableHead className="text-right">Payments</TableHead>
              <TableHead className="text-right">Avg fee</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={8}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="text-center text-sm text-muted-foreground py-10"
                >
                  {search
                    ? 'No merchants match your search.'
                    : 'No fees collected in this period yet.'}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => {
                const refunded = r.refunded_dual_pricing_fee + r.refunded_tip_fee
                const avg = r.payment_count
                  ? r.net_platform_fee / r.payment_count
                  : 0
                return (
                  <TableRow
                    key={r.merchant_id}
                    className="group hover:bg-muted/40 cursor-pointer transition-colors"
                  >
                    <TableCell className="font-medium">
                      <Link
                        href={`/manage/platform-fees/${r.merchant_id}`}
                        className="flex items-center gap-3 outline-none"
                      >
                        <MerchantAvatar name={r.merchant_name} />
                        <span className="flex flex-col">
                          <span>{r.merchant_name}</span>
                          <span className="text-[11px] font-mono text-muted-foreground">
                            {r.merchant_id.slice(0, 8)}…
                          </span>
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {r.location_count}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      <Money value={r.gross_dual_pricing_fee} zeroAsDash />
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      <Money value={-refunded} zeroAsDash />
                    </TableCell>
                    <TableCell className="text-right text-sm font-semibold">
                      <Money value={r.net_platform_fee} />
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {r.payment_count}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      <Money value={avg} zeroAsDash />
                    </TableCell>
                    <TableCell className="text-right">
                      <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
      <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
        {loading ? '…' : `${filtered.length} merchant${filtered.length === 1 ? '' : 's'}`}
      </div>
    </div>
  )
}
