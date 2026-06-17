"use client";

import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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
    <div className="grid grid-cols-[1fr_80px_100px_90px_36px] gap-2 items-center py-2 border-b last:border-b-0">
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="font-medium truncate text-sm">{item.name}</span>
          {item.is_to_go && (
            <Badge variant="secondary" className="shrink-0 text-[10px] px-1.5 py-0">
              To Go
            </Badge>
          )}
        </span>
        {item.description && (
          <span className="text-xs text-muted-foreground truncate">
            {item.description}
          </span>
        )}
      </div>

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
        className="h-8 text-center text-sm"
        aria-label="Quantity"
      />

      <Input
        type="number"
        min="0"
        step="0.01"
        value={item.unit_price}
        onChange={(e) => onChange(item.id, "unit_price", parseFloat(e.target.value) || 0)}
        className="h-8 text-right text-sm"
        aria-label="Unit price"
      />

      <div className="text-right text-sm font-medium tabular-nums">
        ${total.toFixed(2)}
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground hover:text-destructive"
        onClick={() => onRemove(item.id)}
        aria-label="Remove item"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
