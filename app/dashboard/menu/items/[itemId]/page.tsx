'use client'

import { useParams, useRouter } from 'next/navigation'
import { useState } from 'react'
import { useMenuItem } from '../../../hooks/useMenuItem'
import { useCategories } from '../../../hooks/useCategories'
import { useModifierGroups } from '../../../hooks/useModifierGroups'
import { useUserInfo } from '../../../../manage/hooks/useUserInfo.'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import {
    ArrowLeft,
    Utensils,
    Package,
    Settings,
    DollarSign,
    ChefHat,
    Layers,
    Edit3,
    Plus,
    ChevronDown,
    AlertTriangle,
    Image as ImageIcon,
    Tag,
    Clock,
    CheckCircle2,
    XCircle,
    Sparkles,
    Link as LinkIcon,
    Unlink,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Empty } from '@/components/ui/empty'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { ItemFormSheet } from '@/components/dashboard/menu/ItemFormSheet'
import { ItemPreviewCard } from '@/components/dashboard/menu/ItemPreviewCard'
import { AssignModifierToItem, RemoveModifierFromItem } from '../../../actions/item-assignments'
import { DeleteMenuItem } from '../../../actions/menu-items'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'

export default function MenuItemDetailPage() {
    const params = useParams()
    const router = useRouter()
    const queryClient = useQueryClient()
    const itemId = params.itemId as string
    const { data: item, isLoading, refetch } = useMenuItem(itemId)

    const { data: userInfo } = useUserInfo()
    const clerkOrgId = userInfo?.members?.[0]?.organizations?.id

    const { data: allCategories } = useCategories(clerkOrgId || '')
    const { data: allModifierGroups } = useModifierGroups(clerkOrgId)

    const [expandedModifiers, setExpandedModifiers] = useState<Record<string, boolean>>({})
    const [isEditSheetOpen, setIsEditSheetOpen] = useState(false)
    const [linkingModifier, setLinkingModifier] = useState(false)
    const [unlinkingModifier, setUnlinkingModifier] = useState<any>(null)
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)

    const toggleModifierExpand = (modifierId: string) => {
        setExpandedModifiers(prev => ({ ...prev, [modifierId]: !prev[modifierId] }))
    }

    if (isLoading) {
        return (
            <div className="space-y-6 animate-in fade-in duration-500">
                <Skeleton className="h-10 w-64" />
                <div className="grid gap-6 lg:grid-cols-3">
                    <div className="lg:col-span-2 space-y-6">
                        <Skeleton className="h-96 w-full" />
                        <Skeleton className="h-48 w-full" />
                    </div>
                    <Skeleton className="h-[500px]" />
                </div>
            </div>
        )
    }

    if (!item) {
        return (
            <div className="space-y-6">
                <Empty
                    icon={Utensils}
                    title="Item not found"
                    description="The item you're looking for doesn't exist or has been deleted."
                    action={
                        <Button onClick={() => router.push('/dashboard/menu/items')}>
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Back to Items
                        </Button>
                    }
                />
            </div>
        )
    }

    const menuItem = item as any
    const categories = menuItem.menu_item_categories || []
    const modifierGroups = menuItem.menu_item_modifier_groups || []
    const recipes = menuItem.menu_item_recipes || []
    const menus = menuItem.menu_item_menus || []

    const allCategoriesList = Array.isArray(allCategories) ? allCategories : []
    const allModifierGroupsList = Array.isArray(allModifierGroups) ? allModifierGroups : []

    // Find unlinked modifier groups (ones not already assigned to this item)
    const linkedModifierIds = modifierGroups.map((mg: any) => mg.modifier_group?.id)
    const unlinkedModifierGroups = allModifierGroupsList.filter(
        mg => !linkedModifierIds.includes(mg.id)
    )

    const handleLinkModifier = async (modifierGroupId: string) => {
        try {
            const result = await AssignModifierToItem(itemId, modifierGroupId)
            if (result.error) {
                toast.error('Link Failed', {
                    description: result.error
                })
                return
            }
            toast.success('Modifier Linked', {
                description: 'The modifier group has been linked to this item.'
            })
            queryClient.invalidateQueries({ queryKey: ['menu-item', itemId] })
            refetch()
        } catch {
            toast.error('Link Failed', {
                description: 'Unable to link the modifier group. Please try again.'
            })
        }
        setLinkingModifier(false)
    }

    const handleUnlinkModifier = async () => {
        if (!unlinkingModifier) return
        try {
            const result = await RemoveModifierFromItem(itemId, unlinkingModifier.modifier_group?.id)
            if (result.error) {
                toast.error('Unlink Failed', {
                    description: result.error
                })
                return
            }
            toast.success('Modifier Unlinked', {
                description: 'The modifier group has been removed from this item.'
            })
            queryClient.invalidateQueries({ queryKey: ['menu-item', itemId] })
            refetch()
        } catch {
            toast.error('Unlink Failed', {
                description: 'Unable to unlink the modifier group. Please try again.'
            })
        }
        setUnlinkingModifier(null)
    }

    const handleDeleteItem = async () => {
        setIsDeleting(true)
        try {
            const result = await DeleteMenuItem(itemId)
            if (result.error) {
                toast.error('Delete Failed', {
                    description: result.error
                })
                return
            }
            toast.success('Item Deleted', {
                description: `"${menuItem.name}" has been permanently deleted.`
            })
            queryClient.invalidateQueries({ queryKey: ['menu-items'] })
            router.push('/dashboard/menu/items')
        } catch {
            toast.error('Delete Failed', {
                description: 'Unable to delete the item. Please try again.'
            })
        } finally {
            setIsDeleting(false)
            setIsDeleteDialogOpen(false)
        }
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Breadcrumb & Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/menu/items')}>
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div>
                        <div className="text-sm text-muted-foreground flex items-center gap-1">
                            <button
                                type="button"
                                className="hover:underline"
                                onClick={() => router.push('/dashboard/menu/items')}
                            >
                                Items
                            </button>
                            <span>/</span>
                            <span className="text-foreground font-medium">{menuItem.name}</span>
                        </div>
                        <h1 className="text-2xl font-bold">{menuItem.name}</h1>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Badge variant={menuItem.availability ? "default" : "secondary"} className="h-7">
                        {menuItem.availability ? (
                            <><CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Available</>
                        ) : (
                            <><XCircle className="h-3.5 w-3.5 mr-1" /> Unavailable</>
                        )}
                    </Badge>
                    <Button onClick={() => setIsEditSheetOpen(true)}>
                        <Edit3 className="h-4 w-4 mr-2" />
                        Edit Item
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={() => setIsDeleteDialogOpen(true)}
                    >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                    </Button>
                </div>
            </div>

            {/* Main Content Grid */}
            <div className="grid gap-6 lg:grid-cols-3">
                {/* Left Column - Details */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Basic Info Card */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Sparkles className="h-5 w-5 text-primary" />
                                Item Details
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid gap-6 md:grid-cols-2">
                                {/* Image */}
                                <div className="aspect-square rounded-lg bg-muted/30 overflow-hidden border">
                                    {menuItem.image ? (
                                        <img
                                            src={menuItem.image}
                                            alt={menuItem.name}
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                            <div className="text-center text-muted-foreground">
                                                <ImageIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
                                                <p className="text-sm">No image</p>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Details */}
                                <div className="space-y-4">
                                    <div>
                                        <div className="text-sm font-medium text-muted-foreground mb-1">Name</div>
                                        <div className="text-xl font-semibold">{menuItem.name}</div>
                                    </div>

                                    {menuItem.description && (
                                        <div>
                                            <div className="text-sm font-medium text-muted-foreground mb-1">Description</div>
                                            <div className="text-sm">{menuItem.description}</div>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <div className="text-sm font-medium text-muted-foreground mb-1">Card Price</div>
                                            <div className="text-2xl font-bold text-primary">${menuItem.price?.toFixed(2)}</div>
                                        </div>
                                        {menuItem.cash_price && (
                                            <div>
                                                <div className="text-sm font-medium text-muted-foreground mb-1">Cash Price</div>
                                                <div className="text-2xl font-bold text-green-600">${menuItem.cash_price.toFixed(2)}</div>
                                            </div>
                                        )}
                                    </div>

                                    {menuItem.meal_types && menuItem.meal_types.length > 0 && (
                                        <div>
                                            <div className="text-sm font-medium text-muted-foreground mb-2">Meal Types</div>
                                            <div className="flex flex-wrap gap-1">
                                                {menuItem.meal_types.map((type: string) => (
                                                    <Badge key={type} variant="outline">
                                                        <Clock className="h-3 w-3 mr-1" />
                                                        {type}
                                                    </Badge>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Allergens */}
                            {menuItem.allergens && menuItem.allergens.length > 0 && (
                                <div className="pt-4 border-t">
                                    <div className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                                        <AlertTriangle className="h-4 w-4 text-orange-500" />
                                        Allergens
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                        {menuItem.allergens.map((allergen: string) => (
                                            <Badge key={allergen} variant="secondary" className="bg-orange-500/10 text-orange-600 border-orange-200">
                                                {allergen}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Categories */}
                            <div className="pt-4 border-t">
                                <div className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                                    <Tag className="h-4 w-4" />
                                    Categories
                                </div>
                                {categories.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">No categories assigned</p>
                                ) : (
                                    <div className="flex flex-wrap gap-2">
                                        {categories.map((cat: any) => (
                                            <Badge key={cat.id} variant="outline" className="px-3 py-1">
                                                {cat.category?.name}
                                            </Badge>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Menus this item is in */}
                            {menus.length > 0 && (
                                <div className="pt-4 border-t">
                                    <div className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                                        <Utensils className="h-4 w-4" />
                                        Appears in {menus.length} Menu(s)
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {menus.map((m: any) => (
                                            <Badge key={m.id} variant="secondary">
                                                {m.menu?.name}
                                                {m.custom_price && (
                                                    <span className="ml-1 text-green-600">${m.custom_price}</span>
                                                )}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Modifier Groups Section */}
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="flex items-center gap-2">
                                        <Layers className="h-5 w-5 text-purple-500" />
                                        Modifier Groups
                                    </CardTitle>
                                    <CardDescription>
                                        Customization options available for this item
                                    </CardDescription>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setLinkingModifier(true)}
                                    disabled={unlinkedModifierGroups.length === 0}
                                >
                                    <Plus className="h-4 w-4 mr-1" />
                                    Link Modifier
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {modifierGroups.length === 0 ? (
                                <Empty
                                    icon={Layers}
                                    title="No modifier groups"
                                    description="Link modifier groups to let customers customize this item"
                                    action={
                                        unlinkedModifierGroups.length > 0 ? (
                                            <Button variant="outline" onClick={() => setLinkingModifier(true)}>
                                                <Plus className="h-4 w-4 mr-2" />
                                                Link Modifier Group
                                            </Button>
                                        ) : (
                                            <Button variant="outline" onClick={() => router.push('/dashboard/menu/modifiers')}>
                                                <Plus className="h-4 w-4 mr-2" />
                                                Create Modifier Group
                                            </Button>
                                        )
                                    }
                                />
                            ) : (
                                <div className="space-y-3">
                                    {modifierGroups.map((mg: any, index: number) => {
                                        const group = mg.modifier_group
                                        if (!group) return null

                                        return (
                                            <Collapsible
                                                key={mg.id}
                                                open={expandedModifiers[mg.id]}
                                                onOpenChange={() => toggleModifierExpand(mg.id)}
                                            >
                                                <Card
                                                    className={cn(
                                                        "transition-all hover:shadow-md animate-in fade-in slide-in-from-left-4",
                                                        expandedModifiers[mg.id] && "ring-2 ring-purple-500/20"
                                                    )}
                                                    style={{ animationDelay: `${index * 50}ms` }}
                                                >
                                                    <CollapsibleTrigger asChild>
                                                        <CardContent className="p-4 cursor-pointer">
                                                            <div className="flex items-center justify-between">
                                                                <div className="flex items-center gap-4 flex-1">
                                                                    <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0">
                                                                        <Layers className="h-5 w-5 text-purple-500" />
                                                                    </div>
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="font-semibold flex items-center gap-2">
                                                                            {group.name}
                                                                            {group.is_required && (
                                                                                <Badge variant="destructive" className="text-xs">Required</Badge>
                                                                            )}
                                                                        </div>
                                                                        {group.description && (
                                                                            <div className="text-sm text-muted-foreground line-clamp-1">
                                                                                {group.description}
                                                                            </div>
                                                                        )}
                                                                        {/* Preview of options */}
                                                                        <div className="flex flex-wrap gap-1 mt-2">
                                                                            {group.modifier_group_items?.slice(0, 4).map((opt: any) => (
                                                                                <Badge key={opt.id} variant="outline" className="text-xs">
                                                                                    {opt.name}
                                                                                    {opt.price_modifier > 0 && (
                                                                                        <span className="text-green-600 ml-1">+${opt.price_modifier}</span>
                                                                                    )}
                                                                                </Badge>
                                                                            ))}
                                                                            {(group.modifier_group_items?.length || 0) > 4 && (
                                                                                <Badge variant="outline" className="text-xs">
                                                                                    +{group.modifier_group_items.length - 4} more
                                                                                </Badge>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center gap-3 shrink-0">
                                                                    <div className="text-right text-sm text-muted-foreground">
                                                                        {group.modifier_group_items?.length || 0} options
                                                                    </div>
                                                                    <ChevronDown className={cn(
                                                                        "h-5 w-5 text-muted-foreground transition-transform duration-200",
                                                                        expandedModifiers[mg.id] && "rotate-180"
                                                                    )} />
                                                                </div>
                                                            </div>
                                                        </CardContent>
                                                    </CollapsibleTrigger>

                                                    <CollapsibleContent>
                                                        <div className="px-4 pb-4 pt-0 border-t">
                                                            {/* Options Grid */}
                                                            <div className="mt-4 space-y-2">
                                                                <h4 className="text-sm font-medium text-muted-foreground">
                                                                    Options ({group.modifier_group_items?.length || 0})
                                                                </h4>
                                                                {group.modifier_group_items && group.modifier_group_items.length > 0 ? (
                                                                    <div className="grid gap-2 md:grid-cols-2">
                                                                        {group.modifier_group_items.map((opt: any) => (
                                                                            <div
                                                                                key={opt.id}
                                                                                className={cn(
                                                                                    "flex items-center justify-between p-3 rounded-lg bg-muted/50 transition-colors",
                                                                                    !opt.is_active && "opacity-50"
                                                                                )}
                                                                            >
                                                                                <div>
                                                                                    <div className="font-medium flex items-center gap-2">
                                                                                        {opt.name}
                                                                                        {!opt.is_active && (
                                                                                            <Badge variant="secondary" className="text-xs">Inactive</Badge>
                                                                                        )}
                                                                                    </div>
                                                                                    {opt.description && (
                                                                                        <div className="text-sm text-muted-foreground">{opt.description}</div>
                                                                                    )}
                                                                                </div>
                                                                                <div className={cn(
                                                                                    "font-semibold shrink-0",
                                                                                    opt.price_modifier > 0 ? "text-green-600" :
                                                                                        opt.price_modifier < 0 ? "text-red-500" : "text-muted-foreground"
                                                                                )}>
                                                                                    {opt.price_modifier !== 0 ? (
                                                                                        <>{opt.price_modifier > 0 ? '+' : ''}${opt.price_modifier.toFixed(2)}</>
                                                                                    ) : (
                                                                                        'Free'
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                ) : (
                                                                    <p className="text-sm text-muted-foreground">No options in this group</p>
                                                                )}
                                                            </div>

                                                            {/* Selection Rules */}
                                                            <div className="mt-4 p-3 rounded-lg bg-muted/30">
                                                                <h4 className="text-sm font-medium mb-2">Selection Rules</h4>
                                                                <div className="grid grid-cols-2 gap-4 text-sm">
                                                                    <div>
                                                                        <span className="text-muted-foreground">Minimum:</span>
                                                                        <span className="ml-2 font-medium">{group.min_selections || 0}</span>
                                                                    </div>
                                                                    <div>
                                                                        <span className="text-muted-foreground">Maximum:</span>
                                                                        <span className="ml-2 font-medium">{group.max_selections || 'Unlimited'}</span>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* Actions */}
                                                            <div className="mt-4 flex items-center gap-2">
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    onClick={() => router.push('/dashboard/menu/modifiers')}
                                                                >
                                                                    <Edit3 className="h-4 w-4 mr-1" />
                                                                    Edit Group
                                                                </Button>
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation()
                                                                        setUnlinkingModifier(mg)
                                                                    }}
                                                                    className="text-destructive hover:text-destructive"
                                                                >
                                                                    <Unlink className="h-4 w-4 mr-1" />
                                                                    Unlink
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    </CollapsibleContent>
                                                </Card>
                                            </Collapsible>
                                        )
                                    })}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Recipes Section */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <ChefHat className="h-5 w-5 text-orange-500" />
                                Recipes
                            </CardTitle>
                            <CardDescription>
                                Recipes and ingredients for this item
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {recipes.length === 0 ? (
                                <Empty
                                    icon={ChefHat}
                                    title="No recipes"
                                    description="Add recipes to track ingredients and costs"
                                />
                            ) : (
                                <div className="space-y-2">
                                    {recipes.map((recipe: any) => (
                                        <div key={recipe.id} className="p-3 rounded-lg border bg-card">
                                            <div className="font-semibold">{recipe.recipe?.name}</div>
                                            {recipe.recipe?.description && (
                                                <div className="text-sm text-muted-foreground">
                                                    {recipe.recipe.description}
                                                </div>
                                            )}
                                            {recipe.quantity_multiplier !== 1 && (
                                                <Badge variant="outline" className="mt-2">
                                                    ×{recipe.quantity_multiplier}
                                                </Badge>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Right Column - Preview & Quick Info */}
                <div className="space-y-6">
                    {/* POS Preview */}
                    <Card className="sticky top-6">
                        <CardHeader>
                            <CardTitle className="text-sm font-medium text-muted-foreground">POS Preview</CardTitle>
                        </CardHeader>
                        <CardContent className="flex justify-center">
                            <ItemPreviewCard
                                name={menuItem.name}
                                description={menuItem.description || undefined}
                                price={menuItem.price || 0}
                                cashPrice={menuItem.cash_price || undefined}
                                image={menuItem.image || undefined}
                                categories={categories.map((c: any) => c.category?.name).filter(Boolean)}
                                availability={menuItem.availability ?? true}
                            />
                        </CardContent>
                    </Card>

                    {/* Quick Stats */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm font-medium text-muted-foreground">Quick Stats</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex items-center justify-between py-2 border-b">
                                <span className="text-sm text-muted-foreground">Categories</span>
                                <Badge variant="secondary">{categories.length}</Badge>
                            </div>
                            <div className="flex items-center justify-between py-2 border-b">
                                <span className="text-sm text-muted-foreground">Modifier Groups</span>
                                <Badge variant="secondary">{modifierGroups.length}</Badge>
                            </div>
                            <div className="flex items-center justify-between py-2 border-b">
                                <span className="text-sm text-muted-foreground">Menus</span>
                                <Badge variant="secondary">{menus.length}</Badge>
                            </div>
                            <div className="flex items-center justify-between py-2 border-b">
                                <span className="text-sm text-muted-foreground">Recipes</span>
                                <Badge variant="secondary">{recipes.length}</Badge>
                            </div>
                            <div className="flex items-center justify-between py-2">
                                <span className="text-sm text-muted-foreground">Stock Mode</span>
                                <Badge variant="outline">
                                    {menuItem.stock_tracking_mode || 'in_stock'}
                                </Badge>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Metadata */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm font-medium text-muted-foreground">Metadata</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Created</span>
                                <span>{new Date(menuItem.created_at).toLocaleDateString()}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Updated</span>
                                <span>{new Date(menuItem.updated_at).toLocaleDateString()}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">ID</span>
                                <span className="font-mono text-xs truncate max-w-32">{menuItem.id}</span>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Edit Item Sheet */}
            <ItemFormSheet
                open={isEditSheetOpen}
                onOpenChange={setIsEditSheetOpen}
                clerkOrgId={clerkOrgId}
                categories={allCategoriesList}
                modifierGroups={allModifierGroupsList}
                editItem={menuItem}
                onSuccess={() => {
                    setIsEditSheetOpen(false)
                    refetch()
                }}
            />

            {/* Link Modifier Dialog */}
            <Dialog open={linkingModifier} onOpenChange={setLinkingModifier}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Link Modifier Group</DialogTitle>
                        <DialogDescription>
                            Select a modifier group to add to this item
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 max-h-[400px] overflow-y-auto">
                        {unlinkedModifierGroups.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-8">
                                All modifier groups are already linked to this item.
                            </p>
                        ) : (
                            unlinkedModifierGroups.map((group) => (
                                <button
                                    key={group.id}
                                    type="button"
                                    className="w-full p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors text-left"
                                    onClick={() => handleLinkModifier(group.id)}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0">
                                            <Layers className="h-5 w-5 text-purple-500" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-semibold flex items-center gap-2">
                                                {group.name}
                                                {group.is_required && (
                                                    <Badge variant="destructive" className="text-xs">Required</Badge>
                                                )}
                                            </div>
                                            <div className="text-sm text-muted-foreground">
                                                {group.modifier_group_items?.length || 0} options
                                            </div>
                                        </div>
                                        <LinkIcon className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Unlink Modifier Confirmation */}
            <Dialog open={!!unlinkingModifier} onOpenChange={(open) => !open && setUnlinkingModifier(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Unlink Modifier Group</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to remove "{unlinkingModifier?.modifier_group?.name}" from this item?
                            The modifier group itself won't be deleted.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setUnlinkingModifier(null)}>
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={handleUnlinkModifier}>
                            Unlink
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Item Confirmation */}
            <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-destructive">
                            <Trash2 className="h-5 w-5" />
                            Delete Item
                        </DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete "{menuItem.name}"? This action cannot be undone.
                            The item will be removed from all menus and categories.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setIsDeleteDialogOpen(false)}
                            disabled={isDeleting}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleDeleteItem}
                            disabled={isDeleting}
                        >
                            {isDeleting ? (
                                <>
                                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                    Deleting...
                                </>
                            ) : (
                                <>
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete Item
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
