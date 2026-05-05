'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronsUpDown, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import {
  searchPlatformMerchants,
  getPlatformMerchantById,
  type PlatformMerchant,
} from '@/app/manage/actions/hq-platform/transactions'

interface MerchantSearchSelectProps {
  value: string | 'all'
  onChange: (id: string | 'all') => void
  className?: string
  placeholder?: string
  disabled?: boolean
  allLabel?: string
}

const ALL_LABEL_DEFAULT = 'All merchants'

export function MerchantSearchSelect({
  value,
  onChange,
  className,
  placeholder = 'Select merchant...',
  disabled,
  allLabel = ALL_LABEL_DEFAULT,
}: MerchantSearchSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<PlatformMerchant[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Resolve current selection's name (only when it's a real id, not 'all').
  useEffect(() => {
    if (value === 'all' || !value) {
      setSelectedLabel(null)
      return
    }
    let active = true
    getPlatformMerchantById(value)
      .then((m) => { if (active) setSelectedLabel(m?.name ?? null) })
      .catch(() => { if (active) setSelectedLabel(null) })
    return () => { active = false }
  }, [value])

  // Debounced search-as-you-type. Fetches on open AND on every keystroke.
  useEffect(() => {
    if (!open) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setLoading(true)
    debounceRef.current = setTimeout(() => {
      let active = true
      searchPlatformMerchants(search, 20)
        .then((data) => { if (active) setResults(data) })
        .catch(() => { if (active) setResults([]) })
        .finally(() => { if (active) setLoading(false) })
      return () => { active = false }
    }, 200)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [search, open])

  const triggerLabel = useMemo(() => {
    if (value === 'all' || !value) return allLabel
    return selectedLabel ?? '...'
  }, [value, selectedLabel, allLabel])

  function handleSelect(id: string | 'all') {
    onChange(id)
    setOpen(false)
    setSearch('')
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          disabled={disabled}
          className={cn('h-9 justify-between font-normal', className)}
        >
          <span className={cn('truncate', value === 'all' && 'text-muted-foreground')}>
            {triggerLabel}
          </span>
          <div className="flex items-center gap-1">
            {value !== 'all' && value && (
              <X
                className="h-3.5 w-3.5 opacity-50 hover:opacity-100"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  handleSelect('all')
                }}
              />
            )}
            <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={placeholder}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              {loading ? 'Searching...' : 'No merchants found.'}
            </CommandEmpty>
            <CommandItem
              value="__all__"
              onSelect={() => handleSelect('all')}
              className="text-muted-foreground"
            >
              <Check className={cn('mr-2 h-4 w-4', value === 'all' ? 'opacity-100' : 'opacity-0')} />
              {allLabel}
            </CommandItem>
            {results.map((m) => (
              <CommandItem
                key={m.id}
                value={m.id}
                onSelect={() => handleSelect(m.id)}
              >
                <Check className={cn('mr-2 h-4 w-4', value === m.id ? 'opacity-100' : 'opacity-0')} />
                <span className="truncate">{m.name}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
