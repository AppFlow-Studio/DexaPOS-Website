'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import {
  REPORT_CHANNEL_OPTIONS,
  toOrderSourceRpcParam,
  type ReportChannelSelection,
} from '@/lib/reporting/order-channel'
import type { OrderSource } from '@/lib/orderout/platform'

interface ReportChannelFilterProps {
  value: OrderSource | null
  onChange: (value: OrderSource | null) => void
}

export function ReportChannelFilter({
  value,
  onChange,
}: ReportChannelFilterProps) {
  return (
    <div className="flex items-center gap-3">
      <Label htmlFor="report-channel" className="text-sm font-medium">
        Channel
      </Label>
      <Select
        value={value ?? 'all'}
        onValueChange={(selection) =>
          onChange(
            toOrderSourceRpcParam(selection as ReportChannelSelection)
          )
        }
      >
        <SelectTrigger id="report-channel" className="w-[190px]">
          <SelectValue placeholder="All Channels" />
        </SelectTrigger>
        <SelectContent>
          {REPORT_CHANNEL_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
