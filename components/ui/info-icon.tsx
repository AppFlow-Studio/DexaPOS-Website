'use client'

import { Info } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface InfoIconProps {
  tip: string
  className?: string
  side?: 'top' | 'right' | 'bottom' | 'left'
  asButton?: boolean
}

export function InfoIcon({ tip, className, side = 'top', asButton = false }: InfoIconProps) {
  const iconClassName = cn(
    'inline-flex cursor-help items-center text-muted-foreground/60 transition-colors hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    asButton && 'size-7 shrink-0 justify-center rounded-full',
    className,
  )

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {asButton ? (
          <button type="button" className={iconClassName} aria-label={tip}>
            <Info className="h-3.5 w-3.5" />
          </button>
        ) : (
          <span className={iconClassName} tabIndex={0} aria-label={tip}>
            <Info className="h-3.5 w-3.5" />
          </span>
        )}
      </TooltipTrigger>
      <TooltipContent side={side} sideOffset={6} className="max-w-xs text-xs leading-snug">
        {tip}
      </TooltipContent>
    </Tooltip>
  )
}
