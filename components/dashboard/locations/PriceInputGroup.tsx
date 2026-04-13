"use client";

import React, { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Info, ArrowLeftRight } from "lucide-react";
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

/** Strips any character that isn't a digit or a single decimal point */
function sanitizeNumeric(raw: string): string {
  // Remove everything except digits and dot
  let cleaned = raw.replace(/[^0-9.]/g, "");
  // Keep only the first decimal point
  const firstDot = cleaned.indexOf(".");
  if (firstDot !== -1) {
    cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, "");
  }
  return cleaned;
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
  const pricingStrategy = propStrategy ?? (selectedLocation as any)?.pricing_strategy ?? "manual";
  const startDualPercentage = propPercentage ?? (selectedLocation as any)?.dual_pricing_percentage ?? 4.0;

  const isDual = pricingStrategy === "dual";
  const percentage = Number(startDualPercentage);

  // Local string state so the user can type freely (e.g. "1." mid-entry)
  const [cardDisplay, setCardDisplay] = useState(price > 0 ? String(price) : "");
  const [cashDisplay, setCashDisplay] = useState(cashPrice != null ? String(cashPrice) : "");

  // Keep display in sync when the parent drives a change (dual-mode auto-calc)
  const lastEditedRef = useRef<"cash" | "card" | null>(null);

  useEffect(() => {
    if (lastEditedRef.current !== "card") {
      setCardDisplay(price > 0 ? String(price) : "");
    }
  }, [price]);

  useEffect(() => {
    if (lastEditedRef.current !== "cash") {
      setCashDisplay(cashPrice != null ? String(cashPrice) : "");
    }
  }, [cashPrice]);

  // On mount/dual mode: if we have card price but no cash, derive cash
  useEffect(() => {
    if (isDual && price > 0 && (cashPrice === null || cashPrice === 0)) {
      const rawCash = price / (1 + percentage / 100);
      const roundedCash = Math.round(rawCash * 100) / 100;
      if (roundedCash !== cashPrice) {
        lastEditedRef.current = "card";
        onCashPriceChange(roundedCash);
      }
    }
  }, [isDual, price, cashPrice, percentage, onCashPriceChange]);

  const handleCardInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cleaned = sanitizeNumeric(e.target.value);
    setCardDisplay(cleaned);
    lastEditedRef.current = "card";
    const num = parseFloat(cleaned) || 0;
    onPriceChange(num);
    if (isDual) {
      const rawCash = num / (1 + percentage / 100);
      const roundedCash = Math.round(rawCash * 100) / 100;
      onCashPriceChange(roundedCash);
    }
  };

  const handleCashInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cleaned = sanitizeNumeric(e.target.value);
    setCashDisplay(cleaned);
    lastEditedRef.current = "cash";
    const num = cleaned === "" ? null : parseFloat(cleaned) || 0;
    onCashPriceChange(num);
    // Only reverse-calc card from cash when card is empty/zero (new item entry).
    // If the user already has a card price set, editing cash should NOT overwrite it —
    // that prevents the infinite card↔cash recalc loop when working with L5 overrides.
    if (isDual && !disabled && num !== null && (!price || price === 0)) {
      const rawCard = num * (1 + percentage / 100);
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
                <p>Dual Pricing is enabled.</p>
                <p>Edit either price — the other is auto-calculated at {percentage}%.</p>
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
            {isDual && <ArrowLeftRight className="h-3 w-3 text-blue-500 opacity-70" />}
          </div>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
            <Input
              type="text"
              inputMode="decimal"
              value={cardDisplay}
              onChange={handleCardInput}
              disabled={disabled}
              placeholder="0.00"
              className={cn("pl-7", isDual && "border-blue-200 focus-visible:ring-blue-500")}
            />
          </div>
        </div>

        {/* Cash Price Input */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Cash Price</Label>
            {isDual && <ArrowLeftRight className="h-3 w-3 text-blue-500 opacity-70" />}
          </div>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
            <Input
              type="text"
              inputMode="decimal"
              value={cashDisplay}
              onChange={handleCashInput}
              disabled={disabled}
              placeholder="0.00"
              className={cn("pl-7", isDual && "border-blue-200 focus-visible:ring-blue-500")}
            />
          </div>
        </div>
      </div>

      {isDual && (
        <p className="text-[11px] text-muted-foreground mt-2">
          * Edit either price — the other is auto-calculated at {percentage}%.
        </p>
      )}
    </div>
  );
}
