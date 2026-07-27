"use client";

import * as React from "react";
import { PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface AmountRange {
  min?: number;
  max?: number;
}

interface PaymentAmountFilterProps {
  value: AmountRange;
  onChange: (value: AmountRange) => void;
}

function formatBound(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

function summarize({ min, max }: AmountRange): string | null {
  if (min !== undefined && max !== undefined) {
    return `${formatBound(min)} – ${formatBound(max)}`;
  }
  if (min !== undefined) return `≥ ${formatBound(min)}`;
  if (max !== undefined) return `≤ ${formatBound(max)}`;
  return null;
}

/** Parse a currency-ish string to a number; empty/invalid becomes undefined. */
function parseBound(raw: string): number | undefined {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  if (cleaned === "") return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

export function PaymentAmountFilter({
  value,
  onChange,
}: PaymentAmountFilterProps) {
  // Keep the raw text locally so a half-typed "1." doesn't get rewritten mid-edit.
  const [minText, setMinText] = React.useState(
    value.min !== undefined ? String(value.min) : ""
  );
  const [maxText, setMaxText] = React.useState(
    value.max !== undefined ? String(value.max) : ""
  );

  // Resync when the range is cleared from outside (e.g. "Clear all").
  React.useEffect(() => {
    if (value.min === undefined && value.max === undefined) {
      setMinText("");
      setMaxText("");
    }
  }, [value.min, value.max]);

  const commit = (nextMin: string, nextMax: string) => {
    onChange({ min: parseBound(nextMin), max: parseBound(nextMax) });
  };

  const summary = summarize(value);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 border-dashed">
          <PlusCircle className="mr-2 h-4 w-4" />
          Amount
          {summary && (
            <>
              <Separator orientation="vertical" className="mx-2 h-4" />
              <Badge
                variant="secondary"
                className="rounded-sm px-1 font-normal tabular-nums"
              >
                {summary}
              </Badge>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-3 p-3" align="start">
        <div className="space-y-2">
          <Label htmlFor="amount-min" className="text-xs">
            Minimum
          </Label>
          <Input
            id="amount-min"
            inputMode="decimal"
            placeholder="Any"
            value={minText}
            onChange={(e) => {
              setMinText(e.target.value);
              commit(e.target.value, maxText);
            }}
            className="h-8"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="amount-max" className="text-xs">
            Maximum
          </Label>
          <Input
            id="amount-max"
            inputMode="decimal"
            placeholder="Any"
            value={maxText}
            onChange={(e) => {
              setMaxText(e.target.value);
              commit(minText, e.target.value);
            }}
            className="h-8"
          />
        </div>
        {summary && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-full"
            onClick={() => {
              setMinText("");
              setMaxText("");
              onChange({});
            }}
          >
            Clear
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
