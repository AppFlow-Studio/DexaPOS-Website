'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  UtensilsCrossed,
  FolderTree,
  Sliders,
  MapPin,
  Package,
  CheckCircle2,
  AlertCircle,
  LayoutList,
} from 'lucide-react'

// Admin hooks
import { useAdminMenuStats, useAdminMenus } from '@/lib/queries/use-admin-merchant'

// Types
import type { MerchantDetails } from '@/types/merchant'

// Sub-components
import { MenusTable } from './MenuTab/MenusTable'
import { ItemsTable } from './MenuTab/ItemsTable'
import { CategoriesTable } from './MenuTab/CategoriesTable'
import { ModifiersTable } from './MenuTab/ModifiersTable'

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface MenuTabProps {
  merchantDetails?: MerchantDetails | null
  clerkOrgId: string
}

export function MenuTab({ merchantDetails, clerkOrgId }: MenuTabProps) {
  const [selectedLocationId, setSelectedLocationId] = useState<string>('all')
  const [activeSubTab, setActiveSubTab] = useState<'menus' | 'items' | 'categories' | 'modifiers'>('menus')

  // Get merchant data
  const merchantId = merchantDetails?.id ?? ''
  const locations = merchantDetails?.locations ?? []

  // Get location name
  const isAllLocations = selectedLocationId === 'all'
  const selectedLocation = locations.find((loc) => loc.id === selectedLocationId)
  const locationName = isAllLocations ? 'All Locations' : selectedLocation?.name ?? 'Unknown'

  // Fetch menu stats
  const { data: stats, isLoading: statsLoading } = useAdminMenuStats(
    merchantId,
    isAllLocations ? null : selectedLocationId
  )

  // Fetch menus count
  const { data: menus } = useAdminMenus(merchantId, isAllLocations ? null : selectedLocationId)
 
  if (!merchantId) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No merchant selected</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with Location Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <UtensilsCrossed className="h-5 w-5" />
            Menu Management
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {isAllLocations ? (
              <>
                Viewing <span className="font-medium">global prices (L1)</span> for all locations
              </>
            ) : (
              <>
                Viewing <span className="font-medium">effective prices</span> for{' '}
                <span className="text-foreground">{locationName}</span>
              </>
            )}
          </p>
        </div>

        {/* Location Selector */}
        {locations.length > 0 && (
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <Select
              value={selectedLocationId}
              onValueChange={setSelectedLocationId}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select location" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  <span className="flex items-center gap-2">
                    All Locations (Global)
                  </span>
                </SelectItem>
                {locations.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>
                    {loc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4 lg:grid-cols-6">
        <StatsCard
          title="Total Items"
          value={stats?.totalItems ?? 0}
          icon={<Package className="h-4 w-4" />}
          isLoading={statsLoading}
        />
        <StatsCard
          title="Active Items"
          value={stats?.activeItems ?? 0}
          icon={<CheckCircle2 className="h-4 w-4" />}
          variant="success"
          isLoading={statsLoading}
        />
        {!isAllLocations && (
          <StatsCard
            title="With Overrides"
            value={stats?.itemsWithOverrides ?? 0}
            icon={<Sliders className="h-4 w-4" />}
            variant="info"
            isLoading={statsLoading}
          />
        )}
        <StatsCard
          title="Categories"
          value={stats?.totalCategories ?? 0}
          icon={<FolderTree className="h-4 w-4" />}
          isLoading={statsLoading}
        />
        <StatsCard
          title="Active Categories"
          value={stats?.activeCategories ?? 0}
          icon={<CheckCircle2 className="h-4 w-4" />}
          variant="success"
          isLoading={statsLoading}
        />
        <StatsCard
          title="Modifier Groups"
          value={stats?.totalModifierGroups ?? 0}
          icon={<Sliders className="h-4 w-4" />}
          isLoading={statsLoading}
        />
      </div>

      {/* Price Level Legend */}
      {!isAllLocations && (
        <Card className="bg-muted/50">
          <CardContent className="py-3">
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <span className="text-muted-foreground">Price Levels:</span>
              <PriceLevelBadge level="L1" label="Base" color="slate" />
              <PriceLevelBadge level="L2" label="Location" color="blue" />
              <PriceLevelBadge level="L3" label="Category" color="green" />
              <PriceLevelBadge level="L4" label="Loc+Cat" color="purple" />
              <PriceLevelBadge level="L5" label="Loc+Menu" color="orange" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sub-tabs */}
      <Tabs value={activeSubTab} onValueChange={(v) => setActiveSubTab(v as typeof activeSubTab)}>
        <TabsList>
          <TabsTrigger value="menus" className="flex items-center gap-2">
            <LayoutList className="h-4 w-4" />
            Menus
            {menus && <Badge variant="secondary" className="ml-1">{menus.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="items" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            Items
            {stats && <Badge variant="secondary" className="ml-1">{stats.totalItems}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="categories" className="flex items-center gap-2">
            <FolderTree className="h-4 w-4" />
            Categories
            {stats && <Badge variant="secondary" className="ml-1">{stats.totalCategories}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="modifiers" className="flex items-center gap-2">
            <Sliders className="h-4 w-4" />
            Modifiers
            {stats && <Badge variant="secondary" className="ml-1">{stats.totalModifierGroups}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="menus" className="mt-6">
          <MenusTable
            clerkOrgId={clerkOrgId}
            merchantId={merchantId}
            locationId={isAllLocations ? null : selectedLocationId}
            isAllLocations={isAllLocations}
          />
        </TabsContent>

        <TabsContent value="items" className="mt-6">
          <ItemsTable
            merchantId={merchantId}
            locationId={isAllLocations ? null : selectedLocationId}
            isAllLocations={isAllLocations}
          />
        </TabsContent>

        <TabsContent value="categories" className="mt-6">
          <CategoriesTable
            merchantId={merchantId}
            locationId={isAllLocations ? null : selectedLocationId}
            isAllLocations={isAllLocations}
          />
        </TabsContent>

        <TabsContent value="modifiers" className="mt-6">
          <ModifiersTable
            merchantId={merchantId}
            locationId={isAllLocations ? null : selectedLocationId}
            isAllLocations={isAllLocations}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ============================================================================
// STATS CARD COMPONENT
// ============================================================================

interface StatsCardProps {
  title: string
  value: number
  icon: React.ReactNode
  variant?: 'default' | 'success' | 'info' | 'warning'
  isLoading?: boolean
}

function StatsCard({ title, value, icon, variant = 'default', isLoading }: StatsCardProps) {
  const colorClasses = {
    default: 'text-muted-foreground',
    success: 'text-green-600',
    info: 'text-blue-600',
    warning: 'text-amber-600',
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className={colorClasses[variant]}>{icon}</div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-7 w-12" />
        ) : (
          <div className={`text-2xl font-bold ${variant === 'success' ? 'text-green-600' : variant === 'info' ? 'text-blue-600' : ''}`}>
            {value}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ============================================================================
// PRICE LEVEL BADGE COMPONENT
// ============================================================================

interface PriceLevelBadgeProps {
  level: string
  label: string
  color: 'slate' | 'blue' | 'green' | 'purple' | 'orange'
}

function PriceLevelBadge({ level, label, color }: PriceLevelBadgeProps) {
  const colorClasses = {
    slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    green: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
    purple: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
    orange: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  }

  return (
    <Badge variant="outline" className={`${colorClasses[color]} border-0`}>
      <span className="font-semibold mr-1">{level}</span>
      <span className="font-normal">{label}</span>
    </Badge>
  )
}

// Re-export for convenience
export { PriceLevelBadge }
