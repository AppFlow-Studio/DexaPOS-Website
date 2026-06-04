'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { format, subDays } from 'date-fns'
import { Calendar as CalendarIcon } from 'lucide-react'

interface DateRangePickerProps {
  from: string
  to: string
  onChange: (range: { from: string; to: string }) => void
}

export function DateRangePicker({ from, to, onChange }: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [tempFrom, setTempFrom] = useState<Date>(new Date(from))
  const [tempTo, setTempTo] = useState<Date>(new Date(to))

  const handlePreset = (days: number) => {
    const toDate = new Date()
    const fromDate = subDays(toDate, days)
    onChange({
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
    })
  }

  const handleCustomApply = () => {
    onChange({
      from: tempFrom.toISOString(),
      to: tempTo.toISOString(),
    })
    setIsOpen(false)
  }

  const getPresetLabel = () => {
    const fromDate = new Date(from)
    const toDate = new Date(to)
    const diffDays = Math.floor((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDays === 7) return '7 Days'
    if (diffDays === 30) return '30 Days'
    if (diffDays === 90) return '90 Days'
    return 'Custom'
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">Date Range:</span>

      {/* Preset Buttons */}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant={getPresetLabel() === '7 Days' ? 'default' : 'outline'}
          onClick={() => handlePreset(7)}
          className={`transition-all duration-200 ${
            getPresetLabel() === '7 Days' 
              ? 'bg-blue-600 hover:bg-blue-700 text-white' 
              : 'border-blue-200 hover:border-blue-300 hover:bg-blue-50/50'
          }`}
        >
          7D
        </Button>
        <Button
          size="sm"
          variant={getPresetLabel() === '30 Days' ? 'default' : 'outline'}
          onClick={() => handlePreset(30)}
          className={`transition-all duration-200 ${
            getPresetLabel() === '30 Days' 
              ? 'bg-blue-600 hover:bg-blue-700 text-white' 
              : 'border-blue-200 hover:border-blue-300 hover:bg-blue-50/50'
          }`}
        >
          30D
        </Button>
        <Button
          size="sm"
          variant={getPresetLabel() === '90 Days' ? 'default' : 'outline'}
          onClick={() => handlePreset(90)}
          className={`transition-all duration-200 ${
            getPresetLabel() === '90 Days' 
              ? 'bg-blue-600 hover:bg-blue-700 text-white' 
              : 'border-blue-200 hover:border-blue-300 hover:bg-blue-50/50'
          }`}
        >
          90D
        </Button>
      </div>

      {/* Custom Popover */}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button 
            size="sm" 
            variant="outline" 
            className="gap-2 border-blue-200 hover:border-blue-300 hover:bg-blue-50/50 transition-all duration-200"
          >
            <CalendarIcon className="h-4 w-4 text-blue-500" />
            <span className="text-sm">
              {format(new Date(from), 'MMM d')} - {format(new Date(to), 'MMM d')}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 bg-white/95 backdrop-blur-sm border border-blue-100/50 shadow-lg rounded-xl" align="end">
          <div className="p-4 space-y-4">
            <div className="flex gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">From</label>
                <Calendar
                  mode="single"
                  selected={tempFrom}
                  onSelect={(date) => date && setTempFrom(date)}
                  disabled={(date) => date > tempTo}
                  className="rounded-lg border border-blue-100"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">To</label>
                <Calendar
                  mode="single"
                  selected={tempTo}
                  onSelect={(date) => date && setTempTo(date)}
                  disabled={(date) => date < tempFrom}
                  className="rounded-lg border border-blue-100"
                />
              </div>
            </div>
            <Button
              onClick={handleCustomApply}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white transition-all duration-200"
              size="sm"
            >
              Apply Range
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}