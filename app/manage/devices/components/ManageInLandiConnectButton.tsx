'use client'

import type { ComponentProps } from 'react'
import { ExternalLink } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { buildLandiConnectListUrl } from '@/lib/device-registry/landi-connect'

type ManageInLandiConnectButtonProps = {
  /** Device serial number; the action hides when this is missing. */
  serialNumber: string | null | undefined
  variant?: ComponentProps<typeof Button>['variant']
  size?: ComponentProps<typeof Button>['size']
  /** Render an icon-only trigger (for dense table rows). */
  iconOnly?: boolean
  className?: string
}

/**
 * Opens the Landi Connect device list in a new tab and copies the serial to the
 * clipboard so the admin can paste it into Landi's search. Interim "Option B":
 * Landi has no serial-based deep link, so we can't jump straight to the device.
 */
export function ManageInLandiConnectButton({
  serialNumber,
  variant = 'outline',
  size = 'sm',
  iconOnly = false,
  className,
}: ManageInLandiConnectButtonProps) {
  const serial = serialNumber?.trim()
  if (!serial) return null

  const label = `Manage ${serial} in Landi Connect`

  const handleClick = async () => {
    const showManualHint = () => {}

    // Optional chaining alone would let a missing clipboard API resolve to
    // `undefined` and wrongly show "Serial copied", so guard explicitly.
    if (!navigator.clipboard?.writeText) {
      showManualHint()
      return
    }

    try {
      await navigator.clipboard.writeText(serial)
    } catch {
      showManualHint()
    }
  }

  return (
    <Button
      asChild
      variant={variant}
      size={iconOnly ? 'icon-sm' : size}
      className={className}
      onClick={handleClick}
    >
      <a
        href={buildLandiConnectListUrl()}
        target="_blank"
        rel="noopener noreferrer"
        title={iconOnly ? label : undefined}
        aria-label={iconOnly ? label : undefined}
      >
        <ExternalLink className="h-4 w-4" />
        {iconOnly ? null : 'Manage in Landi Connect'}
      </a>
    </Button>
  )
}
