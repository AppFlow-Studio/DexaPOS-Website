'use client'

import * as React from 'react'
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
  SortingState,
  getSortedRowModel,
} from '@tanstack/react-table'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Figures belong on the right so decimal points line up down a column, while
 * labels stay left. Columns can state this explicitly via
 * `meta: { numeric: true }`; absent that, the header text is matched against
 * the money/count/duration wording the reports already use, so the eight
 * existing report definitions get the right alignment without each being
 * rewritten.
 */
const NUMERIC_HEADER =
  /(sales|amount|total|orders|qty|quantity|count|tax|tips?|refunds?|discounts?|revenue|avg|average|price|minutes|min\)|threshold|turns|covers|rate|%|bumped)/i

/** Timestamp columns read as text, so they must not be caught by "time". */
const TEXT_HEADER = /(date|name|reason|item|station|server|staff|by$|method|type)/i

function isNumericColumn(columnDef: ColumnDef<any, any>): boolean {
  const meta = columnDef.meta as { numeric?: boolean } | undefined
  if (typeof meta?.numeric === 'boolean') return meta.numeric

  const header = columnDef.header
  if (typeof header !== 'string') return false
  if (TEXT_HEADER.test(header)) return false
  return NUMERIC_HEADER.test(header)
}

function isMobileHidden(columnDef: ColumnDef<any, any>): boolean {
  const meta = columnDef.meta as { mobileHidden?: boolean } | undefined
  return meta?.mobileHidden === true
}

interface ReportDataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  loading?: boolean
}

export function ReportDataTable<TData, TValue>({
  columns,
  data,
  loading = false,
}: ReportDataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([])

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    initialState: {
      pagination: {
        pageSize: 20,
      },
    },
    state: {
      sorting,
    },
  })

  const pageIndex = table.getState().pagination.pageIndex
  const pageCount = table.getPageCount()

  return (
    <div>
      {/* No outer border: the table sits inside a report panel that already
          provides the one visual boundary. Columns are separated by hairlines
          under each row, the way the Overview lists read. */}
      <div className="-mx-2 overflow-x-auto px-2">
        <Table className="min-w-max">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow
                key={headerGroup.id}
                className="border-b border-border/60 hover:bg-transparent"
              >
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={cn(
                      'h-auto py-2.5 text-[0.8125rem] font-normal text-muted-foreground',
                      isMobileHidden(header.column.columnDef) &&
                        'hidden sm:table-cell',
                      isNumericColumn(header.column.columnDef) && 'text-right'
                    )}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  Loading...
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                  className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cn(
                        'py-3 text-sm',
                        isMobileHidden(cell.column.columnDef) &&
                          'hidden sm:table-cell',
                        isNumericColumn(cell.column.columnDef) &&
                          'text-right tabular-nums'
                      )}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination hides itself on a single page rather than showing two
          permanently-disabled buttons. */}
      {pageCount > 1 && (
        <div className="flex items-center justify-between gap-3 pt-4">
          <p className="text-[0.8125rem] text-muted-foreground tabular-nums">
            Page {pageIndex + 1} of {pageCount}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
