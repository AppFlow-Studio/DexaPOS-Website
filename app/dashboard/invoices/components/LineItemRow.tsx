"use client";

import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface LineItem {
  id: string; // client-side UUID
  menu_item_id?: string | null;
  name: string;
  description?: string | null;
  quantity: number;
  unit_price: number;
  is_to_go?: boolean;
}

interface LineItemRowProps {
  item: LineItem;
  onChange: (id: string, field: keyof LineItem, value: string | number) => void;
  onRemove: (id: string) => void;
}

export function LineItemRow({ item, onChange, onRemove }: LineItemRowProps) {
  const total = item.quantity * item.unit_price;

  return (
    // Borderless row on the table's tinted well (§5.5) — the `border-b` that
    // separated rows is gone; spacing and the row fill carry the separation.
    // Below `sm` the row stacks so the three number fields keep a usable width.
    <div className="min-w-0 rounded-2xl bg-card/70 p-2 transition-colors hover:bg-muted/40 sm:grid sm:grid-cols-[1fr_80px_100px_90px_36px] sm:items-center sm:gap-2">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-medium">{item.name}</span>
          {item.is_to_go && (
            <span className="shrink-0 rounded-full bg-muted/60 px-1.5 py-0 text-[10px] font-medium text-muted-foreground">
              To Go
            </span>
          )}
        </span>
        {item.description && (
          <span className="truncate text-xs text-muted-foreground">
            {item.description}
          </span>
        )}
      </div>

      {/* Field row: sits beneath the name below `sm`, in columns above it. */}
      <div className="mt-2 flex min-w-0 items-center gap-2 sm:contents sm:mt-0">
        <Input
          type="number"
          min="1"
          step="1"
          value={item.quantity}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            onChange(item.id, "quantity", Number.isNaN(v) ? 0 : v);
          }}
          onBlur={(e) => {
            const v = parseInt(e.target.value, 10);
            onChange(item.id, "quantity", Number.isNaN(v) || v < 1 ? 1 : v);
          }}
          className="h-8 w-16 rounded-full border-0 bg-muted/60 px-2 text-center text-sm shadow-none focus-visible:bg-background sm:w-full"
          aria-label="Quantity"
        />

        <Input
          type="number"
          min="0"
          step="0.01"
          value={item.unit_price}
          onChange={(e) =>
            onChange(item.id, "unit_price", parseFloat(e.target.value) || 0)
          }
          className="h-8 min-w-0 flex-1 rounded-full border-0 bg-muted/60 px-3 text-right text-sm shadow-none focus-visible:bg-background sm:flex-none"
          aria-label="Unit price"
        />

        <div className="shrink-0 text-right text-sm font-medium tabular-nums">
          ${total.toFixed(2)}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 rounded-full text-muted-foreground hover:text-destructive"
          onClick={() => onRemove(item.id)}
          aria-label="Remove item"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
