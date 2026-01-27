'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import {
    CheckCircle2,
    Package,
    Search,
    Truck,
    AlertTriangle,
    TrendingDown,
    MapPin,
    Globe,
    Filter,
    Ghost,
    Boxes,
    Plus,
    Edit2
} from 'lucide-react'
import {
    useAdminInventoryItems,
    useAdminVendors,
    useAdminInventoryStats
} from '@/lib/queries/use-admin-inventory'
import { MerchantDetails } from '@/types/merchant'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { SetLocationStock } from '@/app/dashboard/actions/location-stock'
import { UpdateItemStock } from '@/app/dashboard/actions/inventory'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2 as Spinner } from 'lucide-react'
import { AdminAddItemDialog } from './inventory/AdminAddItemDialog'
import { AdminEditItemDialog } from './inventory/AdminEditItemDialog'

interface ProductsTabProps {
    merchantInfo?: MerchantDetails
}

export function ProductsTab({ merchantInfo }: ProductsTabProps) {
    const [activeTab, setActiveTab] = useState('catalog')
    const [searchTerm, setSearchTerm] = useState('')
    const [selectedLocationId, setSelectedLocationId] = useState<string>('all')

    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
    const [editingItem, setEditingItem] = useState<any | null>(null)
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)

    const clerkOrgId = merchantInfo?.clerk_org_id || ''
    const locations = merchantInfo?.locations || []
    
    // Determine location_id for query (null for all/global)
    const queryLocationId = selectedLocationId === 'all' ? null : selectedLocationId
    const isAllLocations = selectedLocationId === 'all'

    // Queries
    const { data: items = [], isLoading: isLoadingItems } = useAdminInventoryItems(clerkOrgId, queryLocationId)
    const { data: vendors = [], isLoading: isLoadingVendors } = useAdminVendors(clerkOrgId, queryLocationId)
    const { data: stats, isLoading: isLoadingStats } = useAdminInventoryStats(clerkOrgId, queryLocationId)

    // Filter items
    const filteredItems = items.filter(
        (item) =>
            item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.category?.toLowerCase().includes(searchTerm.toLowerCase())
    )

    const filteredVendors = vendors.filter(
        (vendor) =>
            vendor.name.toLowerCase().includes(searchTerm.toLowerCase())
    )

    const queryClient = useQueryClient()
    const [editingStockId, setEditingStockId] = useState<string | null>(null)
    const [stockValue, setStockValue] = useState<string>('')
    const [isUpdatingStock, setIsUpdatingStock] = useState(false)

    const handleStockUpdate = async (itemId: string, currentStock: number) => {
        if (!stockValue) {
            setEditingStockId(null)
            return
        }

        setIsUpdatingStock(true)
        try {
            let newValue = currentStock
            if (stockValue.startsWith('+')) {
                newValue += parseFloat(stockValue.substring(1))
            } else if (stockValue.startsWith('-')) {
                newValue -= parseFloat(stockValue.substring(1))
            } else {
                newValue = parseFloat(stockValue)
            }

            if (isNaN(newValue)) {
                toast.error('Invalid quantity')
                return
            }

            let result
            if (isAllLocations) {
                // Update base inventory item stock
                result = await UpdateItemStock(itemId, newValue)
            } else {
                // Update location-specific stock
                result = await SetLocationStock(selectedLocationId, itemId, newValue)
            }

            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success('Stock updated')
                queryClient.invalidateQueries({ queryKey: ['admin', 'inventory', 'items', clerkOrgId, selectedLocationId] })
                queryClient.invalidateQueries({ queryKey: ['admin', 'inventory', 'stats', clerkOrgId, selectedLocationId] })
            }
        } catch (error) {
            toast.error('Failed to update stock')
            console.error(error)
        } finally {
            setIsUpdatingStock(false)
            setEditingStockId(null)
            setStockValue('')
        }
    }

    if (!clerkOrgId) {
        return (
            <Card>
                <CardContent className="py-10 text-center text-muted-foreground">
                    Missing merchant configuration (clerk_org_id)
                </CardContent>
            </Card>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                   <h3 className="text-lg font-semibold flex items-center gap-2">
                        <Package className="h-5 w-5" />
                        Inventory & Products
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                        Viewing inventory for {selectedLocationId === 'all' ? 'all locations' : locations.find(l => l.id === selectedLocationId)?.name || 'selected location'}
                    </p>
                </div>
                <div className="flex items-center gap-4">
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
                                    <SelectItem value="all">Global (All Locations)</SelectItem>
                                    {locations.map((loc: any) => (
                                        <SelectItem key={loc.id} value={loc.id}>
                                            {loc.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    <Button onClick={() => setIsAddDialogOpen(true)} className="gap-2">
                        <Plus className="h-4 w-4" />
                        Add Product
                    </Button>
                </div>
            </div>

            {/* Stats Overview */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Items</CardTitle>
                        <Package className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoadingStats ? <Skeleton className="h-8 w-16" /> : <div className="text-2xl font-bold">{stats?.totalItems || 0}</div>}
                        <p className="text-xs text-muted-foreground">{isAllLocations ? "Global catalog items" : "Items at this location"}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Low Stock</CardTitle>
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                    </CardHeader>
                    <CardContent>
                         {isLoadingStats ? <Skeleton className="h-8 w-16" /> : <div className="text-2xl font-bold">{stats?.lowStock || 0}</div>}
                        <p className="text-xs text-muted-foreground">Items below reorder point</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Out of Stock</CardTitle>
                        <TrendingDown className="h-4 w-4 text-rose-500" />
                    </CardHeader>
                    <CardContent>
                         {isLoadingStats ? <Skeleton className="h-8 w-16" /> : <div className="text-2xl font-bold">{stats?.outOfStock || 0}</div>}
                        <p className="text-xs text-muted-foreground">Items with 0 stock</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Inventory Val.</CardTitle>
                        <div className="font-serif italic font-bold text-muted-foreground">$</div>
                    </CardHeader>
                    <CardContent>
                         {isLoadingStats ? <Skeleton className="h-8 w-24" /> : <div className="text-2xl font-bold">${(stats?.totalValue || 0).toLocaleString()}</div>}
                        <p className="text-xs text-muted-foreground">Total asset value</p>
                    </CardContent>
                </Card>
            </div>

            {/* Content Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <div className="flex items-center justify-between mb-4">
                    <TabsList>
                        <TabsTrigger value="catalog" className="flex items-center gap-2">
                             <Boxes className="h-4 w-4" />
                            Catalog
                            <Badge variant="secondary" className="ml-1 px-1 h-5 text-xs">{items.length}</Badge>
                        </TabsTrigger>
                        <TabsTrigger value="vendors" className="flex items-center gap-2">
                             <Truck className="h-4 w-4" />
                            Vendors
                             <Badge variant="secondary" className="ml-1 px-1 h-5 text-xs">{vendors.length}</Badge>
                        </TabsTrigger>
                    </TabsList>
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9 w-[200px] lg:w-[300px]"
                            />
                        </div>
                    </div>
                </div>

                <TabsContent value="catalog" className="mt-0">
                    <Card>
                        <CardContent className="p-0">
                            {isLoadingItems ? (
                                <div className="p-8 space-y-4">
                                    {[1, 2, 3].map((i) => (
                                        <Skeleton key={i} className="h-16 w-full" />
                                    ))}
                                </div>
                            ) : filteredItems.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-16 text-center">
                                    <Ghost className="h-10 w-10 text-muted-foreground mb-4" />
                                    <h3 className="text-lg font-medium">No items found</h3>
                                    <p className="text-muted-foreground text-sm max-w-sm mt-2">
                                        No inventory items match your search.
                                    </p>
                                </div>
                            ) : (
                                <div className="divide-y">
                                     <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-muted/30 text-sm font-medium text-muted-foreground">
                                        <div className="col-span-1"></div>
                                        <div className="col-span-4">Item</div>
                                        <div className="col-span-2">Stock</div>
                                        <div className="col-span-3">Status</div>
                                        <div className="col-span-2 text-right">Cost</div>
                                    </div>
                                    {filteredItems.map((item) => (
                                        <div key={item.id} className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-muted/50 transition-colors group">
                                            <div className="col-span-1">
                                                <Button 
                                                    size="icon" 
                                                    variant="ghost" 
                                                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                                                    onClick={() => {
                                                        setEditingItem(item);
                                                        setIsEditDialogOpen(true);
                                                    }}
                                                >
                                                    <Edit2 className="h-4 w-4 text-muted-foreground" />
                                                </Button>
                                            </div>
                                             <div className="col-span-4">
                                                <div 
                                                    className="flex items-center gap-3 cursor-pointer"
                                                    onClick={() => {
                                                        setEditingItem(item);
                                                        setIsEditDialogOpen(true);
                                                    }}
                                                >
                                                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                                                        <Package className="h-5 w-5" />
                                                    </div>
                                                    <div>
                                                        <div className="font-medium">{item.name}</div>
                                                        <div className="text-xs text-muted-foreground">
                                                            {item.sku ? `SKU: ${item.sku}` : 'No SKU'}
                                                            {item.category && ` • ${item.category}`}
                                                        </div>
                                                    </div>
                                                </div>
                                             </div>
                                             <div className="col-span-2">
                                                 {editingStockId === item.id ? (
                                                     <div className="flex items-center gap-1">
                                                         <Input
                                                              autoFocus
                                                              className="h-8 w-20 text-sm"
                                                              value={stockValue}
                                                              onChange={(e) => setStockValue(e.target.value)}
                                                              onKeyDown={(e) => {
                                                                  if (e.key === 'Enter') handleStockUpdate(item.id, item.current_stock)
                                                                  if (e.key === 'Escape') setEditingStockId(null)
                                                              }}
                                                              placeholder={item.current_stock.toString()}
                                                              disabled={isUpdatingStock}
                                                         />
                                                         {isUpdatingStock ? (
                                                              <Spinner className="h-4 w-4 animate-spin text-muted-foreground" />
                                                         ) : (
                                                              <Button 
                                                                 size="icon" 
                                                                 variant="ghost" 
                                                                 className="h-8 w-8"
                                                                 onClick={() => handleStockUpdate(item.id, item.current_stock)}
                                                              >
                                                                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                                                              </Button>
                                                         )}
                                                     </div>
                                                 ) : (
                                                     <div 
                                                         className="font-medium cursor-pointer hover:bg-muted/80 hover:scale-105 transition-all p-1 rounded inline-block"
                                                         onClick={() => {
                                                              setEditingStockId(item.id)
                                                              setStockValue('')
                                                         }}
                                                         title="Click to adjust stock (+/- supported)"
                                                     >
                                                         {item.current_stock} <span className="text-xs text-muted-foreground">{item.unit_type}</span>
                                                     </div>
                                                 )}
                                                 {isAllLocations && (item as any).location_count !== undefined && (
                                                     <div className="text-xs text-muted-foreground">across {(item as any).location_count} locs</div>
                                                 )}
                                             </div>
                                             <div className="col-span-3">
                                                 <Badge variant={
                                                     item.stock_mode === 'out_of_stock' || item.current_stock === 0 ? 'destructive' :
                                                     item.current_stock <= (item.reorder_point || 5) ? 'outline' : 'outline'
                                                 } className={cn(
                                                     item.stock_mode === 'in_stock' ? 'border-green-200 bg-green-50 text-green-700' :
                                                     item.current_stock <= (item.reorder_point || 5) && item.stock_mode !== 'out_of_stock' ? 'border-amber-200 bg-amber-50 text-amber-700' : ''
                                                 )}>
                                                     {item.stock_mode === 'in_stock' ? 'In Stock (Untracked)' :
                                                      item.stock_mode === 'out_of_stock' ? 'Out of Stock' :
                                                      item.current_stock === 0 ? 'Out of Stock' :
                                                      item.current_stock <= (item.reorder_point || 5) ? 'Low Stock' : 'In Stock'}
                                                 </Badge>
                                             </div>
                                             <div className="col-span-2 text-right font-medium">
                                                 ${item.cost_per_unit.toFixed(2)}
                                             </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="vendors" className="mt-0">
                     <Card>
                        <CardContent className="p-0">
                            {isLoadingVendors ? (
                                <div className="p-8 space-y-4">
                                    {[1, 2, 3].map((i) => (
                                        <Skeleton key={i} className="h-16 w-full" />
                                    ))}
                                </div>
                            ) : filteredVendors.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-16 text-center">
                                    <Ghost className="h-10 w-10 text-muted-foreground mb-4" />
                                    <h3 className="text-lg font-medium">No vendors found</h3>
                                </div>
                            ) : (
                                <div className="divide-y">
                                    <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-muted/30 text-sm font-medium text-muted-foreground">
                                        <div className="col-span-4">Vendor</div>
                                        <div className="col-span-3">Contact</div>
                                        <div className="col-span-3">Details</div>
                                        <div className="col-span-2 text-right">Spend</div>
                                    </div>
                                    {filteredVendors.map((vendor) => (
                                        <div key={vendor.id} className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-muted/50">
                                            <div className="col-span-4">
                                                <div className="font-medium">{vendor.name}</div>
                                                {vendor.location_id ? (
                                                    <Badge variant="outline" className="mt-1 text-xs">Local: {locations.find(l => l.id === vendor.location_id)?.name || 'Unknown'}</Badge>
                                                ) : (
                                                    <Badge variant="outline" className="mt-1 text-xs border-blue-200 bg-blue-50 text-blue-700">Global</Badge>
                                                )}
                                            </div>
                                            <div className="col-span-3 text-sm">
                                                <div>{vendor.contact_name}</div>
                                                <div className="text-muted-foreground">{vendor.email}</div>
                                            </div>
                                            <div className="col-span-3 text-sm text-muted-foreground">
                                                {vendor.phone && <div>{vendor.phone}</div>}
                                                {vendor.city && <div>{vendor.city}, {vendor.state}</div>}
                                            </div>
                                            <div className="col-span-2 text-right">
                                                <div className="font-medium">${(vendor.total_spend || 0).toLocaleString()}</div>
                                                <div className="text-xs text-muted-foreground">{vendor.total_orders || 0} orders</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Dialogs */}
            <AdminAddItemDialog 
                open={isAddDialogOpen}
                onOpenChange={setIsAddDialogOpen}
                clerkOrgId={clerkOrgId}
                merchantId={merchantInfo?.id || ''}
                selectedLocationId={queryLocationId}
                locations={locations}
                vendors={vendors}
            />

            <AdminEditItemDialog 
                open={isEditDialogOpen}
                onOpenChange={setIsEditDialogOpen}
                item={editingItem}
                clerkOrgId={clerkOrgId}
                vendors={vendors}
            />
        </div>
    )
}
