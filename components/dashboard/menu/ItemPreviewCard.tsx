'use client'

import * as React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn, isValidImageUrl } from '@/lib/utils'
import Image from 'next/image'

interface ItemPreviewCardProps {
    name: string
    description?: string
    price: number
    cashPrice?: number
    image?: string
    categories?: string[]
    allergens?: string[]
    availability?: boolean
    expandDescription?: boolean
    className?: string
}

export function ItemPreviewCard({
    name,
    description,
    price,
    cashPrice,
    image,
    categories = [],
    allergens = [],
    availability = true,
    expandDescription = false,
    className,
}: ItemPreviewCardProps) {
    const safePrice = Number(price) || 0
    const safeCashPrice = cashPrice ? Number(cashPrice) : undefined
    const validImage = isValidImageUrl(image) ? image : null

    return (
        <Card className={cn(
            "w-full overflow-hidden transition-all duration-300",
            "bg-card border-2 border-border/50",
            "hover:shadow-xl hover:border-primary/30",
            className
        )}>
            {/* Image Section */}
            <div className="relative aspect-square bg-muted/30 overflow-hidden">
                {validImage ? (
                    <Image
                        src={validImage}
                        alt={name || 'Menu item'}
                        fill
                        className="object-cover transition-transform duration-500 hover:scale-105"
                    />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-24 h-24 rounded-full bg-muted/50 flex items-center justify-center">
                            <svg
                                className="w-12 h-12 text-muted-foreground/50"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={1.5}
                                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                                />
                            </svg>
                        </div>
                    </div>
                )}

                {/* Availability Badge */}
                {!availability && (
                    <div className="absolute top-2 right-2">
                        <Badge variant="destructive" className="text-xs">
                            Unavailable
                        </Badge>
                    </div>
                )}
            </div>

            {/* Content Section */}
            <CardContent className="p-4 space-y-2">
                {/* Name */}
                <h3 className={cn(
                    "font-semibold text-lg line-clamp-1 transition-colors duration-200",
                    name ? "text-foreground" : "text-muted-foreground/50 italic"
                )}>
                    {name || 'Item Name'}
                </h3>

                {/* Description */}
                <p className={cn(
                    expandDescription
                        ? "text-sm whitespace-pre-wrap break-words"
                        : "text-sm line-clamp-3 min-h-[3.75rem]",
                    description ? "text-muted-foreground" : "text-muted-foreground/30 italic"
                )}>
                    {description || 'Add a description...'}
                </p>

                {/* Categories */}
                {categories.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                        {categories.slice(0, 2).map((cat, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">
                                {cat}
                            </Badge>
                        ))}
                        {categories.length > 2 && (
                            <Badge variant="outline" className="text-xs">
                                +{categories.length - 2}
                            </Badge>
                        )}
                    </div>
                )}

                {/* Price */}
                <div className="pt-2 flex items-baseline gap-2">
                    <span className={cn(
                        "text-2xl font-bold transition-all duration-300",
                        safePrice > 0 ? "text-primary" : "text-muted-foreground/30"
                    )}>
                        ${safePrice > 0 ? safePrice.toFixed(2) : '0.00'}
                    </span>
                    {safeCashPrice && safeCashPrice > 0 && (
                        <span className="text-sm text-muted-foreground">
                            / ${safeCashPrice.toFixed(2)} cash
                        </span>
                    )}
                </div>

                {/* Allergens */}
                {allergens.length > 0 && (
                    <div className="pt-2 border-t border-orange-200/50">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-orange-600 mb-1">
                            Contains
                        </p>
                        <div className="flex flex-wrap gap-1">
                            {allergens.map((a) => (
                                <Badge
                                    key={a}
                                    variant="secondary"
                                    className="text-[10px] bg-orange-500/10 text-orange-600 border-orange-200"
                                >
                                    {a}
                                </Badge>
                            ))}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

// Compact version for list views
export function ItemPreviewRow({
    name,
    description,
    price,
    cashPrice,
    image,
    categories = [],
    availability = true,
    className,
}: ItemPreviewCardProps) {
    const safePrice = Number(price) || 0
    const safeCashPrice = cashPrice ? Number(cashPrice) : undefined
    const validImage = isValidImageUrl(image) ? image : null

    return (
        <div className={cn(
            "flex items-center gap-4 p-3 rounded-lg border bg-card",
            "transition-all duration-200 hover:shadow-md hover:border-primary/30",
            className
        )}>
            {/* Image */}
            <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-muted/30 shrink-0">
                {validImage ? (
                    <Image
                        src={validImage}
                        alt={name || 'Menu item'}
                        fill
                        className="object-cover"
                    />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <svg
                            className="w-6 h-6 text-muted-foreground/50"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={1.5}
                                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                            />
                        </svg>
                    </div>
                )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                    <div>
                        <h4 className={cn(
                            "font-medium truncate",
                            name ? "text-foreground" : "text-muted-foreground/50"
                        )}>
                            {name || 'Item Name'}
                        </h4>
                        {description && (
                            <p className="text-sm text-muted-foreground truncate">
                                {description}
                            </p>
                        )}
                    </div>
                    <div className="text-right shrink-0">
                        <span className="font-semibold text-primary">
                            ${safePrice > 0 ? safePrice.toFixed(2) : '0.00'}
                        </span>
                        {!availability && (
                            <Badge variant="secondary" className="ml-2 text-xs">
                                Off
                            </Badge>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

