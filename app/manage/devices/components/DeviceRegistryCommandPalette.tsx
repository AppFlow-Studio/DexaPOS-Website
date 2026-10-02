'use client'

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { BarChart3, Boxes, Monitor, Search } from 'lucide-react'

import { useDeviceRegistryCommandSearch } from '@/app/manage/hooks/useDeviceRegistry'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command'
import { useDebounce } from '@/lib/hooks/useDebounce'
import {
  formatDeviceCategory,
  formatDeviceStatus,
  getDeviceCategoryIcon,
} from '@/lib/device-registry/presentation'

type DeviceRegistryCommandPaletteContextValue = {
  inScope: boolean
  open: boolean
  setOpen: (open: boolean) => void
}

const DeviceRegistryCommandPaletteContext =
  createContext<DeviceRegistryCommandPaletteContextValue | null>(null)

const PAGE_ITEMS = [
  {
    href: '/manage/devices',
    label: 'Inventory',
    subtitle: 'Browse and filter physical inventory',
    icon: Boxes,
  },
  {
    href: '/manage/devices/overview',
    label: 'Overview',
    subtitle: 'Open KPIs, charts, and warranty watchlists',
    icon: BarChart3,
  },
  {
    href: '/manage/device-catalog',
    label: 'Catalog',
    subtitle: 'Manage supported hardware models',
    icon: Monitor,
  },
]

function isEditableElement(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false

  const tagName = target.tagName.toLowerCase()
  return (
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select' ||
    target.isContentEditable
  )
}

function isRegistryPath(pathname: string) {
  return pathname.startsWith('/manage/devices') || pathname === '/manage/device-catalog'
}

export function DeviceRegistryCommandPaletteProvider({
  children,
}: {
  children: ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const inScope = isRegistryPath(pathname)
  const debouncedQuery = useDebounce(query, 150)
  const searchQuery = useDeviceRegistryCommandSearch(debouncedQuery, inScope && open)

  useEffect(() => {
    if (!inScope) {
      setOpen(false)
      setQuery('')
    }
  }, [inScope])

  useEffect(() => {
    if (!open) {
      setQuery('')
    }
  }, [open])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!inScope) return
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return
      if (isEditableElement(event.target)) return

      event.preventDefault()
      setOpen((current) => !current)
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [inScope])

  const deviceResults = searchQuery.data ?? []

  const contextValue = useMemo(
    () => ({
      inScope,
      open,
      setOpen,
    }),
    [inScope, open]
  )

  const openPath = (href: string) => {
    router.push(href)
    setOpen(false)
  }

  return (
    <DeviceRegistryCommandPaletteContext.Provider value={contextValue}>
      {children}
      <CommandDialog open={inScope && open} onOpenChange={setOpen}>
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Search registry devices or jump to a page…"
        />
        <CommandList className="max-h-[60vh]">
          <CommandEmpty>
            {debouncedQuery.trim()
              ? 'No matching devices or pages.'
              : 'Search by serial, model, merchant, or location.'}
          </CommandEmpty>

          <CommandGroup heading="Pages">
            {PAGE_ITEMS.map((item) => (
              <CommandItem
                key={item.href}
                value={`${item.label} ${item.subtitle}`}
                onSelect={() => openPath(item.href)}
                className="gap-3"
              >
                <item.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{item.label}</div>
                  <div className="truncate text-xs text-muted-foreground">{item.subtitle}</div>
                </div>
                <CommandShortcut>Jump</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>

          <CommandGroup heading="Devices">
            {searchQuery.isLoading && debouncedQuery.trim() ? (
              // Result rows in their own shape while the search runs, not a "Searching…" line (§4.10).
              <div className="space-y-1 px-2 py-1">
                <p role="status" className="sr-only">Searching devices</p>
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="flex items-center gap-3 py-2" aria-hidden>
                    <Skeleton className="h-5 w-5 shrink-0 rounded-full" />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-56 max-w-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : deviceResults.length > 0 ? (
              deviceResults.map((device) => {
                const CategoryIcon = getDeviceCategoryIcon(device.device_category)

                return (
                  <CommandItem
                    key={device.id}
                    value={[
                      device.serial_number,
                      device.manufacturer,
                      device.model_name,
                      device.model_sku,
                      device.pos_id,
                      device.merchant_name,
                      device.location_name,
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onSelect={() => openPath(`/manage/devices/${device.id}`)}
                    className="gap-3"
                  >
                    <CategoryIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{device.serial_number}</span>
                        {/* Neutral pill: the word carries the status (§4.6b). */}
                        <Badge variant="outline" className="shrink-0 whitespace-nowrap">
                          {formatDeviceStatus(device.status)}
                        </Badge>
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {device.manufacturer} {device.model_name}
                        {device.model_sku ? ` · ${device.model_sku}` : ''}
                        {device.pos_id ? ` · POS ID ${device.pos_id}` : ''}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {formatDeviceCategory(device.device_category)}
                        {device.merchant_name ? ` · ${device.merchant_name}` : ' · DEXA HQ'}
                        {device.location_name ? ` · ${device.location_name}` : ''}
                      </div>
                    </div>
                    <CommandShortcut>Open</CommandShortcut>
                  </CommandItem>
                )
              })
            ) : (
              <div className="px-2 py-3 text-sm text-muted-foreground">
                {debouncedQuery.trim()
                  ? 'No registry devices match the current search.'
                  : 'Type to search serials, models, merchants, or locations.'}
              </div>
            )}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </DeviceRegistryCommandPaletteContext.Provider>
  )
}

export function useDeviceRegistryCommandPalette() {
  const context = useContext(DeviceRegistryCommandPaletteContext)

  if (!context) {
    throw new Error('useDeviceRegistryCommandPalette must be used inside DeviceRegistryCommandPaletteProvider')
  }

  return context
}

export function DeviceRegistryCommandPaletteTrigger() {
  const { inScope, setOpen } = useDeviceRegistryCommandPalette()

  if (!inScope) {
    return null
  }

  return (
    <Button variant="outline" onClick={() => setOpen(true)} className="justify-between gap-3">
      <span className="inline-flex items-center gap-2">
        <Search className="h-4 w-4" />
        Search
      </span>
      <span className="hidden rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">
        Ctrl/Cmd K
      </span>
    </Button>
  )
}
