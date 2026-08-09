'use client'

import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'
import { exportToCsv, exportToPdf, type ExportColumn, type SummaryCardData } from '@/utils/export'

interface ReportToolbarProps<T extends Record<string, any>> {
  searchQuery: string
  onSearchChange: (query: string) => void
  filteredCount: number
  totalCount: number
  data: T[]
  exportColumns: ExportColumn<T>[]
  filename: string
  searchPlaceholder?: string
  merchantName?: string
  locationName?: string
  dateFrom?: Date
  dateTo?: Date
  summaryCards?: SummaryCardData[]
}

export function ReportToolbar<T extends Record<string, any>>({
  searchQuery,
  onSearchChange,
  filteredCount,
  totalCount,
  data,
  exportColumns,
  filename,
  searchPlaceholder = 'Search...',
  merchantName,
  locationName,
  dateFrom,
  dateTo,
  summaryCards,
}: ReportToolbarProps<T>) {
  const isFiltered = filteredCount < totalCount
  const isExportDisabled = data.length === 0

  const handleExportCsv = () => {
    exportToCsv(data, exportColumns, filename)
  }

  const handleExportPdf = async () => {
    await exportToPdf(data, exportColumns, filename, merchantName, locationName, dateFrom, dateTo, summaryCards)
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {/* Search sits on the same row as the exports rather than stacked above
          them, so the controls read as one quiet bar over the table. */}
      {/* Filled pill, matching the Orders table search: no border or shadow,
          and the fill drops away on focus. */}
      <div className="relative min-w-0 sm:max-w-sm sm:flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
        <Input
          placeholder={searchPlaceholder}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-9 pl-9 text-[0.8125rem]"
        />
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {isFiltered && (
          <p className="mr-1 hidden text-[0.8125rem] text-muted-foreground tabular-nums sm:block">
            {filteredCount.toLocaleString()} of {totalCount.toLocaleString()}
          </p>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={handleExportCsv}
          disabled={isExportDisabled}
          className="h-9 gap-1.5 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
        >
          <Download className="h-4 w-4" />
          CSV
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportPdf}
          disabled={isExportDisabled}
          className="h-9 gap-1.5 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
        >
          <Download className="h-4 w-4" />
          PDF
        </Button>
      </div>
    </div>
  )
}