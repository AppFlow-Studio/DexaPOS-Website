'use client'

import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'

import {
  Table,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

/**
 * Shared table shell for the static (non-TanStack) report tables.
 *
 * Nine report pages each hand-rolled the same markup: a `p-0 overflow-x-auto`
 * container, a `border-b border-border/50` header row, `text-xs font-semibold`
 * header cells, `pl-5` insets, and their own copy of `SortIcon`. That drifted —
 * some rows carried `border-border/30`, some `/50` — and every visual change
 * meant editing nine files.
 *
 * These primitives wrap the staff-directory treatment (`variant="data"`: a
 * rounded tinted container, a tinted header band, borderless `bg-card/70` rows)
 * so the reports and the staff table cannot drift apart again.
 *
 * TanStack-driven report tables use `ReportDataTable` instead; this is for the
 * hand-written ones that only need consistent chrome.
 */

/** The scrolling, rounded container + tinted header band. */
export function ReportTable({
  children,
  className,
  containerClassName,
}: {
  children: React.ReactNode
  className?: string
  containerClassName?: string
}) {
  return (
    <Table
      variant="data"
      className={className}
      containerClassName={containerClassName}
    >
      {children}
    </Table>
  )
}

/** Header wrapper — strips the primitive's default row border. */
export function ReportTableHeader({ children }: { children: React.ReactNode }) {
  return (
    <TableHeader className="[&_tr]:border-0">
      <TableRow className="hover:bg-transparent">{children}</TableRow>
    </TableHeader>
  )
}

/**
 * A header cell. Pass `onSort` to make it sortable; `sorted` drives the icon.
 * `numeric` right-aligns, matching the figures beneath it.
 */
export function ReportTableHead({
  children,
  numeric = false,
  onSort,
  sorted,
  className,
}: {
  children: React.ReactNode
  numeric?: boolean
  onSort?: () => void
  /** `false` when this column is not the active sort. */
  sorted?: 'asc' | 'desc' | false
  className?: string
}) {
  return (
    <TableHead
      onClick={onSort}
      className={cn(
        'text-[0.8125rem] font-normal text-muted-foreground',
        numeric && 'text-right',
        onSort && 'cursor-pointer select-none',
        className
      )}
    >
      <div
        className={cn(
          'flex items-center',
          numeric && 'justify-end'
        )}
      >
        {children}
        {onSort && <ReportSortIcon sorted={sorted} />}
      </div>
    </TableHead>
  )
}

/**
 * Sort indicator. Replaces nine duplicate `SortIcon` definitions, which all
 * used `text-primary` — violet, not the brand blue (UI-DESIGN-SYSTEM.md C5).
 * The active state now uses the accent pair, written literally so Tailwind
 * generates it (C7).
 */
export function ReportSortIcon({ sorted }: { sorted?: 'asc' | 'desc' | false }) {
  if (!sorted) {
    return (
      <ArrowUpDown className="ml-1 h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
    )
  }

  return sorted === 'asc' ? (
    <ArrowUp className="ml-1 h-3.5 w-3.5 shrink-0 text-[#0C4FD1] dark:text-[#6CA0FF]" />
  ) : (
    <ArrowDown className="ml-1 h-3.5 w-3.5 shrink-0 text-[#0C4FD1] dark:text-[#6CA0FF]" />
  )
}

/** Body row carrying the staff-table treatment. */
export const REPORT_TABLE_ROW =
  'border-0 bg-card/70 transition-colors hover:bg-muted/40'
