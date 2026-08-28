'use client'

import { Panel, PanelSection } from '@/components/dashboard/shell'
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
        /* Amber tint carries the "hidden" meaning — keep it, but with the dark
           variant the original omitted (C4). */
        <Panel className="border-0 bg-amber-50/60 dark:bg-amber-950/20">
            <PanelSection
                label={
                    <span className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                        <EyeOff className="h-[1.125rem] w-[1.125rem] shrink-0" />
                        Hidden at this location
                    </span>
                }
                caption="These categories are turned off via location overrides."
                className="space-y-2"
            >
                {hiddenCategories.map((c) => (
                    <div key={c.id} className="flex items-center justify-between gap-3 rounded-2xl border-0 bg-background p-3 shadow-none">
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
            </PanelSection>
        </Panel>
    )
}

