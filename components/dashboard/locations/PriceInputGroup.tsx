"use client";

import React, { useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Info, Lock, Unlock } from "lucide-react";
import { useSelectedLocation } from "@/stores/location-store";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface PriceInputGroupProps {
  price: number;
  cashPrice: number | null;
  onPriceChange: (value: number) => void;
  onCashPriceChange: (value: number | null) => void;
  label?: string;
  disabled?: boolean;
  pricingStrategy?: "manual" | "dual";
  dualPricingPercentage?: number;
}

export function PriceInputGroup({
  price,
  cashPrice,
  onPriceChange,
  onCashPriceChange,
  label = "Price",
  disabled = false,
  pricingStrategy: propStrategy,
  dualPricingPercentage: propPercentage,
}: PriceInputGroupProps) {
  const selectedLocation = useSelectedLocation();
  
  // Use props if provided, otherwise fall back to store
  // This allows the parent to explicitly control the strategy
  const pricingStrategy = propStrategy ?? (selectedLocation as any)?.pricing_strategy ?? "manual";
  const startDualPercentage = propPercentage ?? (selectedLocation as any)?.dual_pricing_percentage ?? 4.0;

  const isDual = pricingStrategy === "dual";
  const percentage = Number(startDualPercentage);

  // Force sync on mount or strategy change if values are out of sync
  useEffect(() => { 
      if (isDual && price > 0 && (cashPrice === null || cashPrice === 0)) {
          const rawCash = price / (1 + percentage / 100);
          const roundedCash = Math.round(rawCash * 100) / 100;
          if (roundedCash !== cashPrice) {
               onCashPriceChange(roundedCash);
          }
      }
  }, [isDual, price, cashPrice, percentage, onCashPriceChange]);

  // Sync logic
  const handlePriceChange = (newPrice: number) => {
    onPriceChange(newPrice);
    
    if (isDual && !disabled) {
      // If Card Price changes, Cash Price = Card Price / (1 + p/100)
      // Round to 2 decimals
      const rawCash = newPrice / (1 + percentage / 100);
      const roundedCash = Math.round(rawCash * 100) / 100;
      onCashPriceChange(roundedCash);
    }
  };

  const handleCashPriceChange = (newCashPrice: number | null) => {
    onCashPriceChange(newCashPrice);

    if (isDual && !disabled && newCashPrice !== null) {
      // If Cash Price changes, Card Price = Cash Price * (1 + p/100)
      const rawCard = newCashPrice * (1 + percentage / 100);
      const roundedCard = Math.round(rawCard * 100) / 100;
      onPriceChange(roundedCard);
    }
  };

  return (
    <div className="space-y-4 p-4 rounded-lg bg-muted/20 border border-border/50">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-medium flex items-center gap-2">
          {label} Configuration
          {isDual && (
            <Badge variant="outline" className="text-[10px] h-5 bg-blue-50 text-blue-700 border-blue-200">
              Dual Pricing Active ({percentage}%)
            </Badge>
          )}
        </h4>
        {isDual && (
           <TooltipProvider>
           <Tooltip>
             <TooltipTrigger asChild>
               <Info className="h-4 w-4 text-muted-foreground cursor-help" />
             </TooltipTrigger>
             <TooltipContent className="max-w-xs">
               <p>Dual Pricing is enabled/enforced by Admin settings.</p>
               <p>Card Price is automatically {percentage}% higher than Cash Price.</p>
             </TooltipContent>
           </Tooltip>
         </TooltipProvider>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Card Price Input */}
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Card Price</Label>
                {/* No lock icon on Card Price as it's the driver */}
            </div>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={price || ""}
              onChange={(e) => handlePriceChange(parseFloat(e.target.value) || 0)}
              disabled={disabled}
              className={cn("pl-7", isDual && "border-blue-200 focus-visible:ring-blue-500")}
            />
          </div>
        </div>

        {/* Cash Price Input */}
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Cash Price</Label>
                {isDual && <Lock className="h-3 w-3 text-muted-foreground opacity-50" />}
            </div>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={cashPrice ?? ""} 
              onChange={(e) => {
                  if (isDual) return; // Prevent manual editing in dual mode
                  const val = e.target.value === "" ? null : parseFloat(e.target.value);
                  handleCashPriceChange(val);
              }}
              disabled={disabled || isDual} // Disable input if Dual Pricing is active
              readOnly={isDual}
              className={cn("pl-7", isDual && "bg-muted text-muted-foreground")}
            />
          </div>
        </div>
      </div>
        {isDual && (
             <p className="text-[11px] text-muted-foreground mt-2">
             * Changing one price automatically updates the other to maintain the {percentage}% offset.
           </p>
        )}
    </div>
  );
}
