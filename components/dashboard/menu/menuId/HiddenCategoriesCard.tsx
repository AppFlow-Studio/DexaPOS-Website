'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tag, EyeOff } from 'lucide-react'
import { MenuCategory } from '@/types/menu'
import { Switch } from '@/components/ui/switch'
import { useState } from 'react'
import { ToggleCategoryInMenu } from '@/app/dashboard/actions/categories'
import { toast } from 'sonner'
interface HiddenCategoriesCardProps {
    menuId: string
    selectedLocationId: string | null
    hiddenCategories: MenuCategory[]
    refetchMenu: () => void
}


export function HiddenCategoriesCard({ menuId, hiddenCategories, selectedLocationId, refetchMenu }: HiddenCategoriesCardProps) {
    console.log('hiddenCategories', hiddenCategories)
    if (hiddenCategories.length === 0) return null
    const [isToggling, setIsToggling] = useState(false)
    const handleToggleCategoryVisibility = async (categoryId: string, isActive: boolean) => {
        setIsToggling(true)
        try {
            const result = await ToggleCategoryInMenu(
                menuId,
                categoryId,
                isActive,
                selectedLocationId === 'all' ? null : selectedLocationId
            )

            if (result.error) {
                toast.error('Update Failed', { description: result.error })
                return
            }

            toast.success(isActive ? 'Category Shown' : 'Category Hidden', {
                description: isActive
                    ? 'This category is now visible in the menu.'
                    : 'This category is now hidden from the menu.'
            })

            refetchMenu()

        } catch {
            toast.error('Update Failed', {
                description: 'Unable to update category visibility. Please try again.'
            })
        }
        finally {
            setIsToggling(false)
        }
    }



    return (
        <Card className="border-amber-200 bg-amber-50/40">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <EyeOff className="h-4 w-4 text-amber-600" />
                    Hidden at this location
                </CardTitle>
                <CardDescription>These categories are turned off via location overrides.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
                {hiddenCategories.map((c) => (
                    <div key={c.id} className="flex items-center justify-between p-3 border rounded-lg bg-background">
                        <div className="flex items-center gap-3">
                            <Tag className="h-4 w-4 text-muted-foreground" />
                            <div>
                                <p className="font-medium">{c.category?.name}</p>
                                <p className="text-xs text-muted-foreground">Disabled at this location</p>
                            </div>
                        </div>
                        <Switch
                            checked={c.is_active}
                            onCheckedChange={() => { }}
                            onClick={async () => await handleToggleCategoryVisibility(c.category_id, !c.is_active)}
                            disabled={isToggling}
                        />
                    </div>
                ))}
            </CardContent>
        </Card>
    )
}

