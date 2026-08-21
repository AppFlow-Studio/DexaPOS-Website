'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  CreditCard,
  DollarSign,
  Flame,
  Gift,
  Monitor,
  MonitorPlay,
  Receipt,
  Settings2,
  SlidersHorizontal,
} from 'lucide-react'

import { cn } from '@/lib/utils'

const SETTINGS_SECTIONS = [
  { label: 'General & tax', href: '/dashboard/settings', icon: SlidersHorizontal },
  { label: 'Stations', href: '/dashboard/settings/stations', icon: Monitor },
  { label: 'POS defaults', href: '/dashboard/settings/pos', icon: Settings2 },
  { label: 'Prep stations', href: '/dashboard/settings/prep-stations', icon: Flame },
  { label: 'Customer display', href: '/dashboard/settings/customer-display', icon: MonitorPlay },
  { label: 'Receipt templates', href: '/dashboard/settings/receipt-templates', icon: Receipt },
  { label: 'Tips', href: '/dashboard/settings/tips', icon: DollarSign },
  { label: 'Loyalty', href: '/dashboard/settings/loyalty', icon: Gift },
  { label: 'Billing', href: '/dashboard/settings/billing', icon: CreditCard },
] as const

export function SettingsSectionNav() {
  const pathname = usePathname()
  const railRef = React.useRef<HTMLElement>(null)

  // §13.2 — the active section must never sit off-screen on the mobile rail.
  // `block: "nearest"` keeps the browser from scrolling the page vertically
  // to the rail as well.
  React.useEffect(() => {
    railRef.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [pathname])

  return (
    <aside ref={railRef} className="min-w-0 pb-3 xl:sticky xl:top-6 xl:self-start xl:pb-0 xl:pr-5">
      <div className="mb-3 hidden xl:block">
        <p className="text-sm font-semibold">Settings</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Location and account configuration
        </p>
      </div>

      {/* Never `overflow-x-hidden` (§13.2): it silently truncates the section
          list and the sections past the cut become unreachable. */}
      <nav
        aria-label="Settings sections"
        className="thin-scrollbar -mx-1 overflow-x-auto px-1 pb-1"
      >
        <div className="flex min-w-max items-center gap-1 xl:min-w-0 xl:flex-col xl:items-stretch">
          {SETTINGS_SECTIONS.map(({ label, href, icon: Icon }) => {
            const isActive =
              href === '/dashboard/settings'
                ? pathname === href
                : pathname === href || pathname.startsWith(`${href}/`)

            return (
              <Link
                key={href}
                href={href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground xl:rounded-xl',
                  isActive && 'bg-muted/60 text-[#0C4FD1] dark:text-[#6CA0FF]'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            )
          })}
        </div>
      </nav>
    </aside>
  )
}

