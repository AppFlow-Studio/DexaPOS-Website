'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ExternalLink } from 'lucide-react'

import { PageHeader, useRailAutoScroll } from '@/components/dashboard/shell'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const LINKS = [
  {
    href: '/manage/website-editor',
    label: 'Pages',
    match: (pathname: string) => pathname === '/manage/website-editor',
  },
  {
    href: '/manage/website-editor/categories',
    label: 'Categories',
    match: (pathname: string) => pathname === '/manage/website-editor/categories',
  },
  {
    href: '/manage/website-editor/blocks',
    label: 'Content blocks',
    match: (pathname: string) => pathname === '/manage/website-editor/blocks',
  },
]

/**
 * Header for the editor's three list screens: the page title, "View site",
 * and a route pill rail (UI-DESIGN-SYSTEM §4.5). Each pill is a route, so the
 * active state comes from the pathname. The shell hook keeps the active pill
 * centred by scrolling the rail itself (§13.2, D-24).
 */
export function WebsiteEditorHeader({ actions }: { actions?: React.ReactNode }) {
  const pathname = usePathname()
  const activeHref = LINKS.find((link) => link.match(pathname))?.href ?? ''
  const railRef = useRailAutoScroll<HTMLElement>(activeHref)

  return (
    <>
      <PageHeader
        title="Website Editor"
        subtitle="Pages, categories and shared content for the public marketing site"
        actions={
          <>
            <Button variant="outline" className="h-9 px-4 text-[0.8125rem] font-medium shadow-sm" asChild>
              <a href="/" target="_blank" rel="noopener noreferrer">
                View site
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            </Button>
            {actions}
          </>
        }
      />

      <nav
        ref={railRef}
        aria-label="Website editor sections"
        className="no-scrollbar w-full min-w-0 overflow-x-auto"
      >
        <div className="inline-flex h-auto w-max flex-nowrap gap-0.5 rounded-full bg-muted/70 p-1">
          {LINKS.map((link) => {
            const isActive = link.match(pathname)
            return (
              <Link
                key={link.href}
                href={link.href}
                data-tab-value={link.href}
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
    </>
  )
}
