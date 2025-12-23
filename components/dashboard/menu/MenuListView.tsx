'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty } from '@/components/ui/empty'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Utensils, Plus, MapPin, Globe, GripVertical, ChevronUp, ChevronDown } from 'lucide-react'
import { MenuActionsDropdown } from './MenuActionsDropdown'

// Extended Menu type with location info
export interface MenuWithLocation {
    id: string
    merchant_id: string
    location_id: string | null
    name: string
    description: string | null
    is_active: boolean
    display_order: number | null
    created_at: string
    updated_at: string
    // Location relation from join
    locations?: {
        id: string
        name: string
    } | null
}

interface MenuListViewProps {
    menus: MenuWithLocation[]
    isLoading?: boolean
    viewMode: 'grid' | 'list'
    onToggleActive: (menuId: string) => void
    onDelete: (menuId: string) => void
    onCreateNew?: () => void
    /** Duplicate menu handler - receives menuId and target locationId (null = global) */
    onDuplicate?: (menuId: string, targetLocationId: string | null) => void
    onSettings?: (menuId: string) => void
    emptyStateTitle?: string
    emptyStateDescription?: string
    onMoveUp?: (index: number) => void
    onMoveDown?: (index: number) => void
    hasOrderChanges?: boolean
}

export function MenuListView({
    menus,
    isLoading = false,
    viewMode,
    onToggleActive,
    onDelete,
    onCreateNew,
    onDuplicate,
    onSettings,
    emptyStateTitle = "No menus yet",
    emptyStateDescription = "Get started by creating your first menu",
    onMoveUp,
    onMoveDown,
    hasOrderChanges = false,
}: MenuListViewProps) {
    const router = useRouter()

    const handleRowClick = (menuId: string) => {
        router.push(`/dashboard/menu/${menuId}`)
    }

    // Loading State
    if (isLoading) {
        return viewMode === 'grid' ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                    <Skeleton key={i} className="h-48" />
                ))}
            </div>
        ) : (
            <div className="space-y-2">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                    <Skeleton key={i} className="h-16" />
                ))}
            </div>
        )
    }

    // Empty State
    if (menus.length === 0) {
        return (
            <Empty
                icon={Utensils}
                title={emptyStateTitle}
                description={emptyStateDescription}
                action={
                    onCreateNew ? (
                        <Button onClick={onCreateNew}>
                            <Plus className="h-4 w-4 mr-2" />
                            Create Menu
                        </Button>
                    ) : null
                }
            />
        )
    }

    // Grid View
    if (viewMode === 'grid') {
        return (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {menus.map((menu, index) => (
                    <Card
                        key={menu.id}
                        className="group transition-all hover:shadow-lg hover:scale-[1.02] cursor-pointer animate-in fade-in slide-in-from-bottom-4"
                        style={{ animationDelay: `${index * 50}ms` }}
                        onClick={() => handleRowClick(menu.id)}
                    >
                        <CardHeader>
                            <div className="flex items-start justify-between">
                                <div className="flex-1 space-y-1">
                                    <div className="flex items-center gap-2">
                                        <CardTitle className="group-hover:text-primary transition-colors">
                                            {menu.name}
                                        </CardTitle>
                                        {menu.display_order !== null && (
                                            <Badge variant="outline" className="text-xs">
                                                #{menu.display_order}
                                            </Badge>
                                        )}
                                    </div>
                                    {menu.description && (
                                        <CardDescription className="line-clamp-2">
                                            {menu.description}
                                        </CardDescription>
                                    )}
                                </div>
                                <MenuActionsDropdown
                                    menuId={menu.id}
                                    menuName={menu.name}
                                    isActive={menu.is_active}
                                    menuLocationId={menu.location_id}
                                    onToggleActive={onToggleActive}
                                    onDelete={onDelete}
                                    onDuplicate={onDuplicate}
                                    onSettings={onSettings}
                                />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div className="flex items-center gap-2">
                                    <Badge variant={menu.is_active ? "default" : "secondary"}>
                                        {menu.is_active ? 'Active' : 'Inactive'}
                                    </Badge>
                                    <LocationBadge menu={menu} />
                                </div>
                                <span className="text-sm text-muted-foreground">
                                    {new Date(menu.created_at).toLocaleDateString()}
                                </span>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        )
    }

    // Table/List View
    return (
        <div className="rounded-md border animate-in fade-in duration-300">
            <Table>
                <TableHeader>
                    <TableRow className="bg-muted/50">
                        <TableHead className="w-[60px]">Order</TableHead>
                        <TableHead className="w-[300px]">Menu Name</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="w-[150px]">Location</TableHead>
                        <TableHead className="w-[100px]">Status</TableHead>
                        <TableHead className="w-[120px]">Created</TableHead>
                        <TableHead className="w-[80px] text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {menus.map((menu, index) => (
                        <TableRow
                            key={menu.id}
                            className="group transition-colors hover:bg-muted/50 animate-in fade-in slide-in-from-left-2"
                            style={{ animationDelay: `${index * 30}ms` }}
                        >
                            <TableCell>
                                <div className="flex items-center gap-1">
                                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                                    <div className="flex flex-col gap-0.5">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-5 w-5"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                onMoveUp?.(index)
                                            }}
                                            disabled={index === 0 || !onMoveUp}
                                            title="Move up"
                                        >
                                            <ChevronUp className="h-3 w-3" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-5 w-5"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                onMoveDown?.(index)
                                            }}
                                            disabled={index === menus.length - 1 || !onMoveDown}
                                            title="Move down"
                                        >
                                            <ChevronDown className="h-3 w-3" />
                                        </Button>
                                    </div>
                                    <span className="text-xs text-muted-foreground ml-1">
                                        {menu.display_order ?? '—'}
                                    </span>
                                </div>
                            </TableCell>
                            <TableCell
                                className="font-medium cursor-pointer"
                                onClick={() => handleRowClick(menu.id)}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors shrink-0">
                                        <Utensils className="h-5 w-5 text-primary" />
                                    </div>
                                    <span className="group-hover:text-primary transition-colors">
                                        {menu.name}
                                    </span>
                                </div>
                            </TableCell>
                            <TableCell
                                className="cursor-pointer"
                                onClick={() => handleRowClick(menu.id)}
                            >
                                <span className="text-muted-foreground line-clamp-1 max-w-[300px]">
                                    {menu.description || '—'}
                                </span>
                            </TableCell>
                            <TableCell
                                className="cursor-pointer"
                                onClick={() => handleRowClick(menu.id)}
                            >
                                <LocationBadge menu={menu} />
                            </TableCell>
                            <TableCell
                                className="cursor-pointer"
                                onClick={() => handleRowClick(menu.id)}
                            >
                                <Badge variant={menu.is_active ? "default" : "secondary"}>
                                    {menu.is_active ? 'Active' : 'Inactive'}
                                </Badge>
                            </TableCell>
                            <TableCell
                                className="text-muted-foreground cursor-pointer"
                                onClick={() => handleRowClick(menu.id)}
                            >
                                {new Date(menu.created_at).toLocaleDateString()}
                            </TableCell>
                            <TableCell className="text-right">
                                <MenuActionsDropdown
                                    menuId={menu.id}
                                    menuName={menu.name}
                                    isActive={menu.is_active}
                                    menuLocationId={menu.location_id}
                                    onToggleActive={onToggleActive}
                                    onDelete={onDelete}
                                    onDuplicate={onDuplicate}
                                    onSettings={onSettings}
                                />
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    )
}

// Location Badge Component
function LocationBadge({ menu }: { menu: MenuWithLocation }) {
    if (menu.location_id && menu.locations) {
        return (
            <Badge
                variant="outline"
                className="gap-1 bg-blue-50 text-blue-700 border-blue-200 shrink-0"
            >
                <MapPin className="h-3 w-3" />
                {menu.locations.name}
            </Badge>
        )
    }

    return (
        <Badge
            variant="outline"
            className="gap-1 bg-emerald-50 text-emerald-700 border-emerald-200 shrink-0"
        >
            <Globe className="h-3 w-3" />
            Global
        </Badge>
    )
}

// Export the LocationBadge for use elsewhere if needed
export { LocationBadge }
