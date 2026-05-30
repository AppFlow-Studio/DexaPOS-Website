'use client'

import { Info } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface InfoIconProps {
  tip: string
  className?: string
  side?: 'top' | 'right' | 'bottom' | 'left'
}

export function InfoIcon({ tip, className, side = 'top' }: InfoIconProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'inline-flex cursor-help items-center text-muted-foreground/60 hover:text-muted-foreground transition-colors',
            className,
          )}
          tabIndex={0}
          aria-label={tip}
        >
          <Info className="h-3.5 w-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-xs text-xs leading-snug">
        {tip}
      </TooltipContent>
    </Tooltip>
  )
}
