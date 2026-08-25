"use client";

import React, { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Info, ArrowLeftRight } from "lucide-react";
import { useSelectedLocation } from "@/stores/location-store";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { deriveCashPrice, deriveCardPrice } from "@/lib/pricing";
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

  // Toggle: when ON, editing cash auto-calculates card at the dual pricing %
  const [autoCalcCard, setAutoCalcCard] = useState(true);
  // Dual-pricing info tooltip — controlled so it can toggle on click/tap.
  const [infoOpen, setInfoOpen] = useState(false);

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

  // On mount/dual mode: if we have card price but no cash, derive cash.
  // Skip when the user just explicitly cleared the cash field — otherwise
  // deleting the last digit would snap back to a derived value.
  useEffect(() => {
    if (lastEditedRef.current === "cash") return;
    if (isDual && price > 0 && (cashPrice === null || cashPrice === 0)) {
      const derived = deriveCashPrice(price, percentage);
      if (derived !== cashPrice) {
        lastEditedRef.current = "card";
        onCashPriceChange(derived);
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
      onCashPriceChange(deriveCashPrice(num, percentage));
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
    if (isDual && !disabled && num !== null && (autoCalcCard || !price || price === 0)) {
      onPriceChange(deriveCardPrice(num, percentage));
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border-0 bg-muted/60 p-4 shadow-none">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-medium flex items-center gap-2">
          {label} Configuration
          {isDual && (
            <Badge variant="outline" className="h-5 bg-blue-50 text-[10px] text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">
              Dual Pricing Active ({percentage}%)
            </Badge>
          )}
        </h4>
        {isDual && (
          // Controlled + button trigger: Radix tooltips open on hover/focus
          // only, and `asChild` onto a bare <svg> leaves nothing focusable — so
          // clicking (and any touch device) did nothing. A real button with an
          // explicit click toggle makes it work by pointer, touch and keyboard.
          <TooltipProvider>
            <Tooltip open={infoOpen} onOpenChange={setInfoOpen}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="About dual pricing"
                  onClick={() => setInfoOpen((prev) => !prev)}
                  className="rounded-full text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Info className="h-4 w-4 cursor-help" />
                </button>
              </TooltipTrigger>
              {/* z-[250]: TooltipContent portals at z-50, but the dialogs this
                  group renders inside sit at z-[100]–z-[210], so the default
                  tooltip painted *behind* the dialog and looked like nothing
                  happened on click. */}
              <TooltipContent className="z-[250] max-w-xs">
                <p>Dual Pricing is enabled.</p>
                <p>Cash price is {percentage}% off the card price.</p>
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
              className={cn(
                "border-0 bg-background pl-7 shadow-none tabular-nums",
                isDual && "focus-visible:ring-blue-500/40",
              )}
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
              className={cn(
                "border-0 bg-background pl-7 shadow-none tabular-nums",
                isDual && "focus-visible:ring-blue-500/40",
              )}
            />
          </div>
        </div>
      </div>

      {isDual && (
        <div className="flex items-center justify-between mt-2">
          <p className="text-[11px] text-muted-foreground">
            * Cash price is {percentage}% off the card price.
          </p>
          <div className="flex items-center gap-2">
            <label htmlFor="auto-calc-toggle" className="text-[11px] text-muted-foreground whitespace-nowrap">
              Auto-set card from cash
            </label>
            <Switch
              id="auto-calc-toggle"
              checked={autoCalcCard}
              onCheckedChange={setAutoCalcCard}
              disabled={disabled}
            />
          </div>
        </div>
      )}
    </div>
  );
}
