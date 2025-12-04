'use client'

import { cn } from '@/lib/utils'
import { Globe, Layers, Check } from 'lucide-react'

interface MenuModeStepProps {
    data: { uses_global_menu: boolean }
    onChange: (data: { uses_global_menu: boolean }) => void
}

export function MenuModeStep({ data, onChange }: MenuModeStepProps) {
    return (
        <div className="space-y-6">
            <p className="text-sm text-muted-foreground">
                Choose how this location's menu will be managed. You can change this later.
            </p>

            <div className="grid gap-4 md:grid-cols-2">
                {/* Global Menu Option */}
                <button
                    type="button"
                    onClick={() => onChange({ uses_global_menu: true })}
                    className={cn(
                        "relative flex flex-col items-start gap-4 p-6 rounded-xl border-2 text-left transition-all",
                        data.uses_global_menu
                            ? "border-primary bg-primary/5 shadow-sm"
                            : "border-muted hover:border-muted-foreground/30 hover:bg-muted/30"
                    )}
                >
                    {data.uses_global_menu && (
                        <div className="absolute top-4 right-4">
                            <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center">
                                <Check className="h-4 w-4 text-primary-foreground" />
                            </div>
                        </div>
                    )}

                    <div className={cn(
                        "h-12 w-12 rounded-lg flex items-center justify-center",
                        data.uses_global_menu ? "bg-primary/10" : "bg-muted"
                    )}>
                        <Globe className={cn(
                            "h-6 w-6",
                            data.uses_global_menu ? "text-primary" : "text-muted-foreground"
                        )} />
                    </div>

                    <div>
                        <h3 className="font-semibold text-lg">Use Global Menu</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                            This location will share the same menu as your other locations. Any changes to the global menu will apply here.
                        </p>
                    </div>

                    <div className="w-full pt-4 border-t">
                        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                            Best for
                        </h4>
                        <ul className="text-sm space-y-1">
                            <li className="flex items-center gap-2">
                                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                                Consistent branding across locations
                            </li>
                            <li className="flex items-center gap-2">
                                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                                Easier menu management
                            </li>
                            <li className="flex items-center gap-2">
                                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                                Franchise-style operations
                            </li>
                        </ul>
                    </div>
                </button>

                {/* Custom Menu Option */}
                <button
                    type="button"
                    onClick={() => onChange({ uses_global_menu: false })}
                    className={cn(
                        "relative flex flex-col items-start gap-4 p-6 rounded-xl border-2 text-left transition-all",
                        !data.uses_global_menu
                            ? "border-primary bg-primary/5 shadow-sm"
                            : "border-muted hover:border-muted-foreground/30 hover:bg-muted/30"
                    )}
                >
                    {!data.uses_global_menu && (
                        <div className="absolute top-4 right-4">
                            <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center">
                                <Check className="h-4 w-4 text-primary-foreground" />
                            </div>
                        </div>
                    )}

                    <div className={cn(
                        "h-12 w-12 rounded-lg flex items-center justify-center",
                        !data.uses_global_menu ? "bg-primary/10" : "bg-muted"
                    )}>
                        <Layers className={cn(
                            "h-6 w-6",
                            !data.uses_global_menu ? "text-primary" : "text-muted-foreground"
                        )} />
                    </div>

                    <div>
                        <h3 className="font-semibold text-lg">Custom Menu</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                            This location will have its own independent menu. You can customize items, prices, and availability.
                        </p>
                    </div>

                    <div className="w-full pt-4 border-t">
                        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                            Best for
                        </h4>
                        <ul className="text-sm space-y-1">
                            <li className="flex items-center gap-2">
                                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                                Location-specific pricing
                            </li>
                            <li className="flex items-center gap-2">
                                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                                Regional menu variations
                            </li>
                            <li className="flex items-center gap-2">
                                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                                Exclusive local items
                            </li>
                        </ul>
                    </div>
                </button>
            </div>

            <div className="bg-muted/50 rounded-lg p-4">
                <p className="text-xs text-muted-foreground">
                    <strong>Note:</strong> Even with a global menu, you can still override individual item prices and availability for this location later.
                </p>
            </div>
        </div>
    )
}

