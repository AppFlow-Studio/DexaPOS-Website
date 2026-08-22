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
    <div className="flex min-w-0 items-center gap-2">
      <Label
        htmlFor="report-channel"
        className="shrink-0 text-[0.8125rem] font-medium text-muted-foreground"
      >
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
        <SelectTrigger
          id="report-channel"
          className="h-9 w-[180px] rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
        >
          <SelectValue placeholder="All Channels" />
        </SelectTrigger>
        {/* Rounded to match the pill trigger and the reports date popover, with
            the options themselves pill-shaped so a highlighted row sits inside
            the panel's curve instead of squaring off against it. */}
        <SelectContent className="rounded-2xl p-1.5">
          {REPORT_CHANNEL_OPTIONS.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              className="rounded-full py-1.5 pl-3 text-[0.8125rem]"
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
