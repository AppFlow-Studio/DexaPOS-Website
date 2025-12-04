'use client'

import { useState, useEffect } from 'react'
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Location } from '@/types/merchant_locations'
import { MapPin, FileText, Clock, Users, Settings, Building2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { DetailsTab } from './tabs/DetailsTab'
import { HoursTab } from './tabs/HoursTab'
import { TeamTab } from './tabs/TeamTab'
import { SettingsTab } from './tabs/SettingsTab'

interface LocationDetailSheetProps {
    location: Location | null
    open: boolean
    onOpenChange: (open: boolean) => void
    onUpdate?: () => void
}

export function LocationDetailSheet({
    location,
    open,
    onOpenChange,
    onUpdate
}: LocationDetailSheetProps) {
    const [activeTab, setActiveTab] = useState('details')
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

    // Reset tab when opening with new location
    useEffect(() => {
        if (open) {
            setActiveTab('details')
            setHasUnsavedChanges(false)
        }
    }, [open, location?.id])

    // Warn about unsaved changes on close
    const handleOpenChange = (newOpen: boolean) => {
        if (!newOpen && hasUnsavedChanges) {
            if (window.confirm('You have unsaved changes. Are you sure you want to close?')) {
                onOpenChange(false)
                setHasUnsavedChanges(false)
            }
        } else {
            onOpenChange(newOpen)
        }
    }

    if (!location) return null

    return (
        <Sheet open={open} onOpenChange={handleOpenChange}>
            <SheetContent
                side="right"
                className="w-full sm:max-w-3xl overflow-y-auto p-2"
            >
                <SheetHeader className="pb-4 border-b">
                    <div className="flex items-start gap-4">
                        <div className={cn(
                            "h-12 w-12 rounded-xl flex items-center justify-center shrink-0",
                            location.is_active ? "bg-primary/10" : "bg-muted"
                        )}>
                            <MapPin className={cn(
                                "h-6 w-6",
                                location.is_active ? "text-primary" : "text-muted-foreground"
                            )} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <SheetTitle className="text-xl truncate">
                                    {location.name}
                                </SheetTitle>
                                {location.code && (
                                    <Badge variant="outline" className="font-mono text-xs shrink-0">
                                        {location.code}
                                    </Badge>
                                )}
                            </div>
                            <SheetDescription className="flex items-center gap-2 mt-1">
                                <Building2 className="h-3.5 w-3.5" />
                                {location.city}, {location.state}
                            </SheetDescription>
                            <div className="flex items-center gap-2 mt-2">
                                <Badge
                                    variant={location.is_active ? "default" : "secondary"}
                                    className="text-xs"
                                >
                                    {location.is_active ? 'Active' : 'Inactive'}
                                </Badge>
                                <Badge
                                    variant={location.is_accepting_orders ? "default" : "outline"}
                                    className={cn(
                                        "text-xs",
                                        location.is_accepting_orders && "bg-green-600"
                                    )}
                                >
                                    {location.is_accepting_orders ? 'Accepting Orders' : 'Not Accepting'}
                                </Badge>
                            </div>
                        </div>
                    </div>
                </SheetHeader>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
                    <TabsList className="grid w-full grid-cols-4">
                        <TabsTrigger value="details" className="flex items-center gap-1.5">
                            <FileText className="h-4 w-4" />
                            <span className="hidden sm:inline">Details</span>
                        </TabsTrigger>
                        <TabsTrigger value="hours" className="flex items-center gap-1.5">
                            <Clock className="h-4 w-4" />
                            <span className="hidden sm:inline">Hours</span>
                        </TabsTrigger>
                        <TabsTrigger value="team" className="flex items-center gap-1.5">
                            <Users className="h-4 w-4" />
                            <span className="hidden sm:inline">Team</span>
                        </TabsTrigger>
                        <TabsTrigger value="settings" className="flex items-center gap-1.5">
                            <Settings className="h-4 w-4" />
                            <span className="hidden sm:inline">Settings</span>
                        </TabsTrigger>
                    </TabsList>

                    <div className="mt-4 pb-4">
                        <TabsContent value="details" className="m-0 animate-in fade-in slide-in-from-right-2 duration-200">
                            <DetailsTab
                                location={location}
                                onUpdate={onUpdate}
                                setHasUnsavedChanges={setHasUnsavedChanges}
                            />
                        </TabsContent>
                        <TabsContent value="hours" className="m-0 animate-in fade-in slide-in-from-right-2 duration-200">
                            <HoursTab
                                location={location}
                                onUpdate={onUpdate}
                                setHasUnsavedChanges={setHasUnsavedChanges}
                            />
                        </TabsContent>
                        <TabsContent value="team" className="m-0 animate-in fade-in slide-in-from-right-2 duration-200">
                            <TeamTab location={location} />
                        </TabsContent>
                        <TabsContent value="settings" className="m-0 animate-in fade-in slide-in-from-right-2 duration-200">
                            <SettingsTab
                                location={location}
                                onUpdate={onUpdate}
                                onClose={() => onOpenChange(false)}
                            />
                        </TabsContent>
                    </div>
                </Tabs>
            </SheetContent>
        </Sheet>
    )
}

