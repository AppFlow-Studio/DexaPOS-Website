'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart3, List, Package } from 'lucide-react'

import { cn } from '@/lib/utils'

const LINKS = [
  {
    href: '/manage/devices',
    label: 'Inventory',
    icon: List,
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
    icon: BarChart3,
    match: (pathname: string) => pathname === '/manage/devices/overview',
  },
  {
    href: '/manage/device-catalog',
    label: 'Catalog',
    icon: Package,
    match: (pathname: string) => pathname === '/manage/device-catalog',
  },
]

export function DeviceRegistrySectionNav() {
  const pathname = usePathname()

  return (
    <div className="inline-flex w-fit flex-wrap items-center gap-2 rounded-2xl border bg-muted/20 p-1.5">
      {LINKS.map((link) => {
        const isActive = link.match(pathname)
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              'inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-background/70 hover:text-foreground'
            )}
          >
            <link.icon className="h-4 w-4" />
            {link.label}
          </Link>
        )
      })}
    </div>
  )
}
