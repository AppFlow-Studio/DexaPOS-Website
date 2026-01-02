'use client'

import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command'
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

export interface CategoryOption {
    id: string
    name: string
}

interface CategoryPickerProps {
    label?: string
    options: CategoryOption[]
    value: string[]
    onChange: (value: string[]) => void
    placeholder?: string
    emptyLabel?: string
}

export function CategoryPicker({
    label = 'Categories',
    options,
    value,
    onChange,
    placeholder = 'Select categories',
    emptyLabel = 'No categories available',
}: CategoryPickerProps) {
    const [open, setOpen] = useState(false)

    const selected = useMemo(
        () => options.filter((opt) => value.includes(opt.id)),
        [options, value],
    )

    const toggleValue = (id: string) => {
        if (value.includes(id)) {
            onChange(value.filter((v) => v !== id))
        } else {
            onChange([...value, id])
        }
    }

    return (
        <div className="space-y-2">
            <Label>{label}</Label>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-between">
                        <span>
                            {selected.length > 0
                                ? `${selected.length} selected`
                                : placeholder}
                        </span>
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-64" align="start">
                    <Command>
                        <CommandInput placeholder="Search categories" />
                        <CommandList>
                            <CommandEmpty>{emptyLabel}</CommandEmpty>
                            <CommandGroup>
                                {options.map((opt) => (
                                    <CommandItem
                                        key={opt.id}
                                        onSelect={() => toggleValue(opt.id)}
                                        className="flex items-center gap-2"
                                    >
                                        <Checkbox checked={value.includes(opt.id)} />
                                        <span>{opt.name}</span>
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
            {selected.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {selected.map((opt) => (
                        <Badge key={opt.id} variant="secondary" className="gap-1">
                            {opt.name}
                            <button
                                type="button"
                                className="text-xs"
                                onClick={() => toggleValue(opt.id)}
                            >
                                ×
                            </button>
                        </Badge>
                    ))}
                </div>
            )}
        </div>
    )
}

