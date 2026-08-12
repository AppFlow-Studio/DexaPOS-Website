'use client'

import { useState, useEffect } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Location } from '@/types/merchant_locations'
import { MapPin, FileText, Clock, Users, Settings, Building2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { DetailsTab } from './tabs/DetailsTab'
import { HoursTab } from './tabs/HoursTab'
import { TeamTab } from './tabs/TeamTab'
import { SettingsTab } from './tabs/SettingsTab'
import { roundedPanelControls } from './LocationPanelSection'

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
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent
                overlayClassName="bg-background/60 backdrop-blur-md"
                className="flex max-h-[92vh] w-full max-w-[calc(100vw-1rem)] flex-col gap-0 overflow-hidden rounded-3xl border bg-card p-0 max-sm:h-dvh max-sm:max-h-none max-sm:overflow-hidden sm:max-w-3xl"
            >
                <DialogHeader className="shrink-0 border-b border-border/60 px-4 py-5 pr-14 text-left sm:px-6">
                    <div className="flex items-start gap-4">
                        <div className={cn(
                            "hidden h-12 w-12 shrink-0 items-center justify-center rounded-xl sm:flex",
                            location.is_active ? "bg-primary/10" : "bg-muted"
                        )}>
                            <MapPin className={cn(
                                "h-6 w-6",
                                location.is_active ? "text-primary" : "text-muted-foreground"
                            )} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <DialogTitle className="truncate text-xl">
                                    {location.name}
                                </DialogTitle>
                                {location.code && (
                                    <Badge variant="secondary" className="rounded-full border-transparent bg-muted text-muted-foreground font-mono text-xs px-2.5 py-0.5 shrink-0">
                                        {location.code}
                                    </Badge>
                                )}
                            </div>
                            <DialogDescription className="mt-1 flex items-center gap-2">
                                <Building2 className="h-3.5 w-3.5" />
                                {location.city}, {location.state}
                            </DialogDescription>
                            <div className="flex items-center gap-2 mt-2">
                                <Badge
                                    variant={location.is_active ? "default" : "secondary"}
                                    className="rounded-full text-xs font-medium px-2.5 py-0.5"
                                >
                                    {location.is_active ? 'Active' : 'Inactive'}
                                </Badge>
                                <Badge
                                    variant={location.is_accepting_orders ? "default" : "outline"}
                                    className={cn(
                                        "rounded-full text-xs font-medium px-2.5 py-0.5",
                                        location.is_accepting_orders && "bg-emerald-600 hover:bg-emerald-600"
                                    )}
                                >
                                    {location.is_accepting_orders ? 'Accepting Orders' : 'Not Accepting'}
                                </Badge>
                            </div>
                        </div>
                    </div>
                </DialogHeader>

                <Tabs
                    value={activeTab}
                    onValueChange={setActiveTab}
                    className="flex min-h-0 flex-1 flex-col px-4 py-4 sm:px-6"
                >
                    {/* Pill tabs, matching the status filter on the locations page. */}
                    <TabsList className="grid w-full grid-cols-4 rounded-full bg-muted/70 p-1 h-auto">
                        {([
                            { value: 'details', icon: FileText, label: 'Details' },
                            { value: 'hours', icon: Clock, label: 'Hours' },
                            { value: 'team', icon: Users, label: 'Team' },
                            { value: 'settings', icon: Settings, label: 'Settings' },
                        ] as const).map(tab => (
                            <TabsTrigger
                                key={tab.value}
                                value={tab.value}
                                className={cn(
                                    "flex items-center gap-1.5 rounded-full px-4 py-2 text-[0.8125rem] font-medium",
                                    "data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border"
                                )}
                            >
                                <tab.icon className="h-4 w-4" />
                                <span className="hidden sm:inline">{tab.label}</span>
                            </TabsTrigger>
                        ))}
                    </TabsList>

                    <div
                        className={cn(
                            'thin-scrollbar mt-4 min-h-0 flex-1 overflow-y-auto px-1 pb-4 pt-1',
                            roundedPanelControls,
                        )}
                    >
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
            </DialogContent>
        </Dialog>
    )
}

