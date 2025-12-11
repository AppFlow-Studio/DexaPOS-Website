'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Globe, MapPin } from 'lucide-react'
import { MenuWithCategories } from '@/types/menu'

interface MenuHeaderProps {
    menu: MenuWithCategories
    onBack: () => void
    onNavigateToMenus: () => void
}

export function MenuHeader({ menu, onBack, onNavigateToMenus }: MenuHeaderProps) {
    return (
        <div className="flex items-center gap-4">
            <div className="flex-1">
                {/* Breadcrumbs */}
                <div className="text-sm text-muted-foreground flex items-center gap-2 mb-2">
                    <Button variant="ghost" size="icon" onClick={onBack}>
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <button
                        type="button"
                        className="hover:underline"
                        onClick={onNavigateToMenus}
                    >
                        Menus
                    </button>
                    <span className="mx-2">/</span>
                    <div className="text-foreground">{menu.name}</div>
                </div>
                <div className="flex items-center gap-2">
                    <h2 className='text-2xl font-bold tracking-tight'>{menu.name}</h2>
                    <Badge variant={menu.is_location_owned ? "secondary" : "default"}>
                        {menu.is_location_owned ? (
                            <div className="flex items-center gap-2">
                                <MapPin className="h-4 w-4" />
                                <p>Location Menu</p>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2">
                                <Globe className="h-4 w-4" />
                                <p>Global Menu</p>
                            </div>
                        )}
                    </Badge>
                </div>
                {menu.description && (
                    <p className="text-muted-foreground">{menu.description}</p>
                )}
            </div>

            <div className="flex items-center gap-2">
                <Badge variant={menu.is_active ? "default" : "secondary"}>
                    {menu.is_active ? 'Active' : 'Inactive'}
                </Badge>
            </div>
        </div>
    )
}

