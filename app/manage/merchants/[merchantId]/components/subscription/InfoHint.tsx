'use client'

import { Info } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/**
 * Small "ⓘ" affordance that reveals a short explanation on hover/focus.
 * Used across the subscription overview + edit flow to make the billing model
 * self-explanatory (tier logic, per-station rule, surcharge, statuses, …).
 */
export function InfoHint({ label, className }: { label: string; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="More info"
          className={cn(
            'inline-flex items-center justify-center text-muted-foreground/70 transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full',
            className,
          )}
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs leading-relaxed">{label}</TooltipContent>
    </Tooltip>
  )
}
