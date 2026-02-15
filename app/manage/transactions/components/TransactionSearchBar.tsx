'use client'

import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Search, X } from 'lucide-react'
import { useDebounce } from '@/lib/hooks/useDebounce'

interface TransactionSearchBarProps {
    value: string
    onChange: (value: string) => void
    className?: string
}

export function TransactionSearchBar({ value, onChange, className }: TransactionSearchBarProps) {
    const inputRef = useRef<HTMLInputElement>(null)
    const [localValue, setLocalValue] = useState(value)
    const debouncedValue = useDebounce(localValue, 300)

    // Sync debounced value upward (only trigger if ≥ 2 chars or empty)
    useEffect(() => {
        const trimmed = debouncedValue.trim()
        onChange(trimmed.length >= 2 ? trimmed : '')
    }, [debouncedValue])

    // Keep local in sync if parent resets value (e.g., clear all filters)
    useEffect(() => {
        if (value === '' && localValue !== '') {
            setLocalValue('')
        }
    }, [value])

    // Cmd+K / Ctrl+K focuses the search bar
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault()
                inputRef.current?.focus()
            }
        }
        document.addEventListener('keydown', handler)
        return () => document.removeEventListener('keydown', handler)
    }, [])

    const clear = () => {
        setLocalValue('')
        onChange('')
        inputRef.current?.focus()
    }

    return (
        <div className={`relative ${className ?? ''}`}>
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
                ref={inputRef}
                placeholder="Search by order #, auth code, card last 4, customer..."
                value={localValue}
                onChange={e => setLocalValue(e.target.value)}
                className="pl-9 pr-24"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {localValue && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={clear}
                        tabIndex={-1}
                    >
                        <X className="h-3 w-3" />
                    </Button>
                )}
                <kbd className="hidden sm:inline-flex h-5 items-center gap-0.5 rounded border bg-muted px-1.5 text-[10px] text-muted-foreground font-mono">
                    <span>⌘</span>K
                </kbd>
            </div>
        </div>
    )
}

// ─── Text highlight helper (exported for use in table cells) ──────────────────

export function highlightText(text: string, query: string): React.ReactNode {
    if (!query || query.length < 2) return text
    const index = text.toLowerCase().indexOf(query.toLowerCase())
    if (index === -1) return text
    return (
        <>
            {text.slice(0, index)}
            <mark className="bg-yellow-200 text-yellow-900 rounded-sm px-0.5">
                {text.slice(index, index + query.length)}
            </mark>
            {text.slice(index + query.length)}
        </>
    )
}
