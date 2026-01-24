'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Search,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Sliders,
  Globe,
  MapPin,
  CheckCircle2,
  XCircle,
  Asterisk,
  ListOrdered,
} from 'lucide-react'

// Admin hooks
import {
  useAdminModifierGroups,
  useAdminModifierGroupDetails,
  type AdminModifierGroup,
} from '@/lib/queries/use-admin-merchant'

// ============================================================================
// HELPERS
// ============================================================================

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface ModifiersTableProps {
  merchantId: string
  locationId: string | null
  isAllLocations: boolean
}

export function ModifiersTable({
  merchantId,
  locationId,
  isAllLocations,
}: ModifiersTableProps) {
  const [search, setSearch] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  // Fetch modifier groups
  const {
    data: modifierGroups,
    isLoading,
    refetch,
    isFetching,
  } = useAdminModifierGroups(merchantId, locationId)

  // Filter by search
  const filteredGroups = (modifierGroups ?? []).filter(
    (group) =>
      group.name.toLowerCase().includes(search.toLowerCase()) ||
      group.description?.toLowerCase().includes(search.toLowerCase())
  )

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const expandAll = () => {
    setExpandedIds(new Set(filteredGroups.map((g) => g.id)))
  }

  const collapseAll = () => {
    setExpandedIds(new Set())
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <CardTitle>Modifier Groups</CardTitle>
            <CardDescription>
              {filteredGroups.length} modifier groups
              {!isAllLocations && ' (including location-specific)'}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search modifiers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 w-[200px]"
              />
            </div>

            {/* Expand/Collapse All */}
            <div className="flex gap-1">
              <Button variant="outline" size="sm" onClick={expandAll}>
                Expand All
              </Button>
              <Button variant="outline" size="sm" onClick={collapseAll}>
                Collapse All
              </Button>
            </div>

            {/* Refresh */}
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Sliders className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="font-medium">No modifier groups found</p>
            <p className="text-sm">
              {search
                ? 'Try adjusting your search'
                : 'No modifier groups have been created yet'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredGroups.map((group) => (
              <ModifierGroupRow
                key={group.id}
                group={group}
                merchantId={merchantId}
                locationId={locationId}
                isAllLocations={isAllLocations}
                isExpanded={expandedIds.has(group.id)}
                onToggle={() => toggleExpanded(group.id)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ============================================================================
// MODIFIER GROUP ROW COMPONENT
// ============================================================================

interface ModifierGroupRowProps {
  group: AdminModifierGroup
  merchantId: string
  locationId: string | null
  isAllLocations: boolean
  isExpanded: boolean
  onToggle: () => void
}

function ModifierGroupRow({
  group,
  merchantId,
  locationId,
  isAllLocations,
  isExpanded,
  onToggle,
}: ModifierGroupRowProps) {
  // Fetch details only when expanded
  const { data: details, isLoading: detailsLoading } = useAdminModifierGroupDetails(
    merchantId,
    isExpanded ? group.id : null,
    locationId
  )

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <div className="border rounded-lg">
        <CollapsibleTrigger asChild>
          <div className="flex items-center gap-4 p-4 cursor-pointer hover:bg-muted/50 transition-colors">
            {/* Expand Icon */}
            <div className="text-muted-foreground">
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </div>

            {/* Icon */}
            <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
              <Sliders className="h-4 w-4 text-muted-foreground" />
            </div>

            {/* Name & Description */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium truncate">{group.name}</p>
                {group.is_global ? (
                  <Badge variant="outline" className="text-xs bg-slate-50 dark:bg-slate-900">
                    <Globe className="h-3 w-3 mr-1" />
                    Global
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                    <MapPin className="h-3 w-3 mr-1" />
                    Location
                  </Badge>
                )}
                {group.is_required && (
                  <Badge variant="outline" className="text-xs bg-red-50 text-red-700 dark:bg-red-900 dark:text-red-300">
                    <Asterisk className="h-3 w-3 mr-1" />
                    Required
                  </Badge>
                )}
              </div>
              {group.description && (
                <p className="text-xs text-muted-foreground truncate">{group.description}</p>
              )}
            </div>

            {/* Selection Rules */}
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                <ListOrdered className="h-3 w-3 mr-1" />
                {group.min_selections}-{group.max_selections ?? '∞'}
              </Badge>
              <Badge variant="secondary">{group.items_count} options</Badge>
            </div>

            {/* Status */}
            <div>
              {group.is_active ? (
                <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-900 dark:text-green-300 border-0">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Active
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-red-50 text-red-700 dark:bg-red-900 dark:text-red-300 border-0">
                  <XCircle className="h-3 w-3 mr-1" />
                  Inactive
                </Badge>
              )}
            </div>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t">
            {detailsLoading ? (
              <div className="p-4 space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : details?.items && details.items.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="w-[40px]">#</TableHead>
                    <TableHead>Option Name</TableHead>
                    <TableHead>Price Modifier</TableHead>
                    <TableHead>Default</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {details.items.map((item, index) => (
                    <TableRow key={item.id}>
                      <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{item.name}</p>
                          {item.description && (
                            <p className="text-xs text-muted-foreground">{item.description}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {item.price_modifier !== 0 ? (
                          <span className={item.price_modifier > 0 ? 'text-green-600' : 'text-red-600'}>
                            {item.price_modifier > 0 ? '+' : ''}
                            {formatCurrency(item.price_modifier)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">No change</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {item.is_default && (
                          <Badge variant="outline" className="text-xs">
                            Default
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {item.is_active ? (
                          <Badge variant="outline" className="text-xs bg-green-50 text-green-700 dark:bg-green-900 dark:text-green-300 border-0">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs bg-red-50 text-red-700 dark:bg-red-900 dark:text-red-300 border-0">
                            Inactive
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="p-4 text-center text-sm text-muted-foreground">
                No modifier options in this group
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}
