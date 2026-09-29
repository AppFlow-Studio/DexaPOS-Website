'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/utils'

const LINKS = [
  {
    href: '/manage/devices',
    label: 'Inventory',
    match: (pathname: string) =>
      pathname === '/manage/devices' ||
      (
        /^\/manage\/devices\/[^/]+$/.test(pathname) &&
        pathname !== '/manage/devices/overview'
      ),
  },
  {
    href: '/manage/devices/overview',
    label: 'Overview',
    match: (pathname: string) => pathname === '/manage/devices/overview',
  },
  {
    href: '/manage/device-catalog',
    label: 'Catalog',
    match: (pathname: string) => pathname === '/manage/device-catalog',
  },
]

/**
 * The registry's section rail (UI-DESIGN-SYSTEM §4.5). Each pill is a route,
 * so the active state comes from the pathname rather than a `Tabs` value.
 *
 * The rail scrolls itself, never the pill (§13.2, D-24), so the active section
 * is always the one in view on a phone.
 */
export function DeviceRegistrySectionNav() {
  const pathname = usePathname()
  const railRef = useRef<HTMLElement>(null)
  const positioned = useRef(false)

  useEffect(() => {
    const rail = railRef.current
    if (!rail) return
    let done = false
    const align = () => {
      const max = rail.scrollWidth - rail.clientWidth
      const tab = rail.querySelector<HTMLElement>('[aria-current="page"]')
      if (done || !tab || max <= 0) return
      const left = tab.offsetLeft - (rail.clientWidth - tab.offsetWidth) / 2
      const smooth =
        positioned.current && !matchMedia('(prefers-reduced-motion: reduce)').matches
      rail.scrollTo({ left: Math.max(0, Math.min(left, max)), behavior: smooth ? 'smooth' : 'auto' })
      positioned.current = done = true
    }
    align()
    // A cold rail has no width on the first run.
    const observer = new ResizeObserver(align)
    observer.observe(rail)
    return () => observer.disconnect()
  }, [pathname])

  return (
    <nav
      ref={railRef}
      aria-label="Device registry sections"
      className="thin-scrollbar relative w-full min-w-0 overflow-x-auto pb-1"
    >
      <div className="inline-flex h-auto w-max flex-nowrap gap-0.5 rounded-full bg-muted/70 p-1">
        {LINKS.map((link) => {
          const isActive = link.match(pathname)
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium transition-colors',
                isActive
                  ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {link.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
