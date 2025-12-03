'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tag, Plus, Search, Edit3, Trash2, Sparkles, Utensils, ChevronDown, ChevronUp, ExternalLink, X } from 'lucide-react'
import { useState, useMemo } from 'react'
import { useCategories } from '../../hooks/useCategories'
import { useMenus } from '../../hooks/useMenus'
import { useSchedules } from '../../hooks/useSchedules'
import { useUserInfo } from '../../../manage/hooks/useUserInfo.'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Empty } from '@/components/ui/empty'
import { CategoryFormSheet } from '@/components/dashboard/menu/CategoryFormSheet'
import { DeleteCategory } from '../../actions/categories'
import { GetMenuItemsByCategory } from '../../actions/menu-items'
import { toast } from 'sonner'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { CategoriesModel, MenuItemsModel } from '@/types/db-modles'
import { useRouter } from 'next/navigation'

export default function CategoriesPage() {
    const router = useRouter()
    const { data: userInfo } = useUserInfo()
    const clerkOrgId = userInfo?.members?.[0]?.organizations?.id
    const queryClient = useQueryClient()

    const { data: categories, isLoading, refetch } = useCategories(clerkOrgId || '')
    const { data: menus } = useMenus(clerkOrgId || '')
    const { data: schedules } = useSchedules(clerkOrgId || '')

    const [searchTerm, setSearchTerm] = useState('')
    const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false)
    const [editingCategory, setEditingCategory] = useState<CategoriesModel | null>(null)
    const [deletingCategory, setDeletingCategory] = useState<CategoriesModel | null>(null)
    const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(null)

    const categoriesList = Array.isArray(categories) ? categories : []
    const menusList = Array.isArray(menus) ? menus : []
    const schedulesList = Array.isArray(schedules) ? schedules : []

    const filteredCategories = categoriesList.filter(category =>
        category.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        category.description?.toLowerCase().includes(searchTerm.toLowerCase())
    )

    const merchantGlobalCategories = categoriesList.filter(c => !c.menu_id).length
    const menuSpecificCategories = categoriesList.filter(c => c.menu_id).length
    const activeCategories = categoriesList.filter(c => c.is_active).length

    // Fetch items for expanded category
    const { data: categoryItems, isLoading: itemsLoading } = useQuery({
        queryKey: ['category-items', expandedCategoryId],
        queryFn: () => GetMenuItemsByCategory(expandedCategoryId || ''),
        enabled: !!expandedCategoryId,
    })

    const handleDelete = async () => {
        if (!deletingCategory) return

        try {
            const result = await DeleteCategory(deletingCategory.id)
            if (result.error) {
                toast.error('Delete Failed', {
                    description: result.error
                })
                return
            }
            toast.success('Category Deleted', {
                description: `"${deletingCategory.name}" has been permanently deleted.`
            })
            queryClient.invalidateQueries({ queryKey: ['categories'] })
            refetch()
        } catch (error) {
            toast.error('Delete Failed', {
                description: 'Unable to delete the category. Please try again.'
            })
        } finally {
            setDeletingCategory(null)
        }
    }

    const handleCategoryClick = (category: CategoriesModel) => {
        // Toggle expansion
        if (expandedCategoryId === category.id) {
            setExpandedCategoryId(null)
        } else {
            setExpandedCategoryId(category.id)
        }
    }

    const handleEditCategory = (category: CategoriesModel, e: React.MouseEvent) => {
        e.stopPropagation()
        setEditingCategory(category)
    }

    const handleNavigateToItem = (itemId: string) => {
        router.push(`/dashboard/menu/items/${itemId}`)
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Categories</h2>
                    <p className="text-muted-foreground">
                        Manage categories for your menus
                    </p>
                </div>
                <Button onClick={() => setIsCreateSheetOpen(true)} className="gap-2">
                    <Plus className="h-4 w-4" />
                    Create Category
                </Button>
            </div>

            {/* Stats Overview */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card className="transition-all hover:shadow-md">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Categories</CardTitle>
                        <Tag className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{categoriesList.length}</div>
                        <p className="text-xs text-muted-foreground">
                            All categories
                        </p>
                    </CardContent>
                </Card>
                <Card className="transition-all hover:shadow-md">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Global</CardTitle>
                        <Sparkles className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-blue-600">{merchantGlobalCategories}</div>
                        <p className="text-xs text-muted-foreground">
                            Reusable across menus
                        </p>
                    </CardContent>
                </Card>
                <Card className="transition-all hover:shadow-md">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Menu Specific</CardTitle>
                        <Tag className="h-4 w-4 text-purple-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-purple-600">{menuSpecificCategories}</div>
                        <p className="text-xs text-muted-foreground">
                            Menu-specific categories
                        </p>
                    </CardContent>
                </Card>
                <Card className="transition-all hover:shadow-md">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active</CardTitle>
                        <Tag className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">{activeCategories}</div>
                        <p className="text-xs text-muted-foreground">
                            Currently active
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Categories List */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>All Categories</CardTitle>
                            <CardDescription>Click a category to see its items</CardDescription>
                        </div>
                        <div className="relative">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search categories..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-8 w-64"
                            />
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="space-y-4">
                            {[1, 2, 3, 4, 5, 6].map((i) => (
                                <Skeleton key={i} className="h-32 w-full" />
                            ))}
                        </div>
                    ) : filteredCategories.length === 0 ? (
                        <Empty
                            icon={Tag}
                            title={categoriesList.length === 0 ? "No categories yet" : "No categories found"}
                            description={
                                categoriesList.length === 0
                                    ? "Get started by creating your first category"
                                    : "Try adjusting your search terms"
                            }
                            action={
                                categoriesList.length === 0 ? (
                                    <Button onClick={() => setIsCreateSheetOpen(true)}>
                                        <Plus className="h-4 w-4 mr-2" />
                                        Create Category
                                    </Button>
                                ) : null
                            }
                        />
                    ) : (
                        <div className="space-y-3">
                            {filteredCategories.map((category, index) => {
                                const isExpanded = expandedCategoryId === category.id
                                const items = isExpanded ? (categoryItems || []) : []

                                return (
                                    <Card
                                        key={category.id}
                                        className={cn(
                                            "transition-all animate-in fade-in slide-in-from-bottom-4 overflow-hidden",
                                            isExpanded
                                                ? "ring-2 ring-primary shadow-lg"
                                                : "hover:shadow-md hover:border-primary/30 cursor-pointer"
                                        )}
                                        style={{ animationDelay: `${index * 50}ms` }}
                                    >
                                        {/* Category Header */}
                                        <div
                                            className={cn(
                                                "p-4 cursor-pointer transition-colors",
                                                isExpanded && "bg-muted/30"
                                            )}
                                            onClick={() => handleCategoryClick(category)}
                                        >
                                            <div className="flex items-start gap-4">
                                                {/* Icon/Image */}
                                                {category.image_url ? (
                                                    <div className="h-16 w-16 rounded-lg overflow-hidden bg-muted shrink-0">
                                                        <img
                                                            src={category.image_url}
                                                            alt={category.name}
                                                            className="w-full h-full object-cover"
                                                        />
                                                    </div>
                                                ) : (
                                                    <div className={cn(
                                                        "h-16 w-16 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                                                        isExpanded
                                                            ? "bg-primary/20"
                                                            : "bg-primary/10 group-hover:bg-primary/20"
                                                    )}>
                                                        <Tag className="h-8 w-8 text-primary" />
                                                    </div>
                                                )}

                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div>
                                                            <h3 className={cn(
                                                                "font-semibold transition-colors truncate",
                                                                isExpanded && "text-primary"
                                                            )}>
                                                                {category.name}
                                                            </h3>
                                                            {category.description && (
                                                                <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                                                                    {category.description}
                                                                </p>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-2 shrink-0">
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-8 w-8"
                                                                onClick={(e) => handleEditCategory(category, e)}
                                                            >
                                                                <Edit3 className="h-4 w-4" />
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-8 w-8 text-destructive hover:text-destructive"
                                                                onClick={(e) => {
                                                                    e.stopPropagation()
                                                                    setDeletingCategory(category)
                                                                }}
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                            <div className={cn(
                                                                "p-1 rounded-full transition-colors",
                                                                isExpanded ? "bg-primary text-primary-foreground" : "bg-muted"
                                                            )}>
                                                                {isExpanded ? (
                                                                    <ChevronUp className="h-4 w-4" />
                                                                ) : (
                                                                    <ChevronDown className="h-4 w-4" />
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-2 mt-3">
                                                        <Badge variant={category.is_active ? "default" : "secondary"} className="text-xs">
                                                            {category.is_active ? 'Active' : 'Inactive'}
                                                        </Badge>
                                                        <Badge variant="outline" className="text-xs">
                                                            {category.menu_id
                                                                ? menusList.find(m => m.id === category.menu_id)?.name || 'Menu Specific'
                                                                : 'Global'
                                                            }
                                                        </Badge>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Expanded Items Section */}
                                        {isExpanded && (
                                            <div className="border-t bg-muted/10 animate-in slide-in-from-top-2">
                                                <div className="p-4">
                                                    <div className="flex items-center justify-between mb-3">
                                                        <h4 className="text-sm font-medium flex items-center gap-2">
                                                            <Utensils className="h-4 w-4" />
                                                            Items in this category
                                                        </h4>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                router.push(`/dashboard/menu/items?category=${category.id}`)
                                                            }}
                                                        >
                                                            View All
                                                            <ExternalLink className="h-3 w-3 ml-1" />
                                                        </Button>
                                                    </div>

                                                    {itemsLoading ? (
                                                        <div className="space-y-2">
                                                            {[1, 2, 3].map(i => (
                                                                <Skeleton key={i} className="h-16 w-full" />
                                                            ))}
                                                        </div>
                                                    ) : items.length === 0 ? (
                                                        <div className="text-center py-8 text-muted-foreground">
                                                            <Utensils className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                                            <p className="text-sm">No items in this category yet</p>
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                className="mt-3"
                                                                onClick={(e) => {
                                                                    e.stopPropagation()
                                                                    router.push('/dashboard/menu/items')
                                                                }}
                                                            >
                                                                <Plus className="h-3 w-3 mr-1" />
                                                                Add Items
                                                            </Button>
                                                        </div>
                                                    ) : (
                                                        <div className="space-y-2">
                                                            {items.slice(0, 5).map((item, itemIndex) => (
                                                                <div
                                                                    key={item.id}
                                                                    className={cn(
                                                                        "flex items-center gap-3 p-3 rounded-lg bg-background border",
                                                                        "hover:shadow-sm hover:border-primary/30 cursor-pointer transition-all",
                                                                        "animate-in fade-in slide-in-from-left-2"
                                                                    )}
                                                                    style={{ animationDelay: `${itemIndex * 50}ms` }}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation()
                                                                        handleNavigateToItem(item.id)
                                                                    }}
                                                                >
                                                                    {/* Item Image */}
                                                                    <div className="w-12 h-12 rounded-lg overflow-hidden bg-muted/30 shrink-0">
                                                                        {item.image ? (
                                                                            <img
                                                                                src={item.image}
                                                                                alt={item.name}
                                                                                className="w-full h-full object-cover"
                                                                            />
                                                                        ) : (
                                                                            <div className="w-full h-full flex items-center justify-center">
                                                                                <Utensils className="h-5 w-5 text-muted-foreground/50" />
                                                                            </div>
                                                                        )}
                                                                    </div>

                                                                    {/* Item Details */}
                                                                    <div className="flex-1 min-w-0">
                                                                        <h5 className="font-medium text-sm truncate">
                                                                            {item.name}
                                                                        </h5>
                                                                        {item.description && (
                                                                            <p className="text-xs text-muted-foreground truncate">
                                                                                {item.description}
                                                                            </p>
                                                                        )}
                                                                    </div>

                                                                    {/* Price & Status */}
                                                                    <div className="text-right shrink-0">
                                                                        <span className="font-semibold text-sm text-primary">
                                                                            ${item.price.toFixed(2)}
                                                                        </span>
                                                                        {!item.availability && (
                                                                            <Badge variant="secondary" className="ml-2 text-xs">
                                                                                Off
                                                                            </Badge>
                                                                        )}
                                                                    </div>

                                                                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                                                                </div>
                                                            ))}

                                                            {items.length > 5 && (
                                                                <Button
                                                                    variant="ghost"
                                                                    className="w-full"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation()
                                                                        router.push(`/dashboard/menu/items?category=${category.id}`)
                                                                    }}
                                                                >
                                                                    View all {items.length} items
                                                                    <ExternalLink className="h-3 w-3 ml-1" />
                                                                </Button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </Card>
                                )
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Create/Edit Bottom Sheet */}
            <CategoryFormSheet
                open={isCreateSheetOpen || !!editingCategory}
                onOpenChange={(open) => {
                    if (!open) {
                        setIsCreateSheetOpen(false)
                        setEditingCategory(null)
                    }
                }}
                clerkOrgId={clerkOrgId}
                menus={menusList}
                schedules={schedulesList}
                editCategory={editingCategory}
                onSuccess={() => {
                    setIsCreateSheetOpen(false)
                    setEditingCategory(null)
                    refetch()
                }}
            />

            {/* Delete Confirmation Dialog */}
            <Dialog open={!!deletingCategory} onOpenChange={(open) => !open && setDeletingCategory(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete Category</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete "{deletingCategory?.name}"? This will unlink all items from this category. This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeletingCategory(null)}>
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={handleDelete}>
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
