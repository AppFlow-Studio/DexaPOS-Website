'use client'

import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'
import { exportToCsv, type ExportColumn } from '@/utils/export'

interface ExportButtonProps<T extends Record<string, any>> {
  data: T[]
  columns: ExportColumn<T>[]
  filename: string
  disabled?: boolean
}

export function ExportButton<T extends Record<string, any>>({
  data,
  columns,
  filename,
  disabled,
}: ExportButtonProps<T>) {
  const handleExport = () => {
    exportToCsv(data, columns, filename)
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={disabled || data.length === 0}
      className="gap-2"
    >
      <Download className="h-4 w-4" />
      Export CSV
    </Button>
  )
}
