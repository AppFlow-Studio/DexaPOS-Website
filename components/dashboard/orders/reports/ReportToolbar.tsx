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
    <div className="space-y-3">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={searchPlaceholder}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Record Count */}
      {isFiltered && (
        <p className="text-sm text-muted-foreground">
          Showing {filteredCount.toLocaleString()} of {totalCount.toLocaleString()} records
        </p>
      )}

      {/* Export Buttons */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportCsv}
          disabled={isExportDisabled}
          className="gap-2"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportPdf}
          disabled={isExportDisabled}
          className="gap-2"
        >
          <Download className="h-4 w-4" />
          Export PDF
        </Button>
      </div>
    </div>
  )
}
