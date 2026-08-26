"use client";

import * as React from "react";
import Link from "next/link";
import { Grid3x3, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isValidImageUrl } from "@/lib/utils";

interface ItemSummaryCardProps {
  itemId: string;
  item: any;
}

export function ItemSummaryCard({ itemId, item }: ItemSummaryCardProps) {
  const effectivePrice = item?.effective_price ?? item?.price ?? 0;
  const allergens: string[] = item?.allergens ?? [];
  const modifierCount: number = item?.menu_item_modifier_groups?.length ?? 0;
  const categoryCount: number = item?.category_items?.length ?? 0;

  return (
    <div className="sticky top-6 space-y-3">
      <div className="overflow-hidden rounded-2xl border bg-card">
        <div className="aspect-[4/3] w-full bg-muted/40">
          {isValidImageUrl(item?.image) ? (
            <img
              src={item.image}
              alt={item?.name ?? ""}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              <Package className="h-6 w-6" />
            </div>
          )}
        </div>
        <div className="space-y-2 p-3">
          <h4 className="truncate text-sm font-semibold">
            {item?.name ?? "Untitled"}
          </h4>
          {item?.description && (
            <p className="line-clamp-2 text-xs text-muted-foreground">
              {item.description}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2 rounded-2xl border-0 bg-muted/60 p-3 shadow-none">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Effective price
        </p>
        <p className="text-2xl font-bold tabular-nums text-primary">
          ${Number(effectivePrice).toFixed(2)}
        </p>
        {item?.effective_price_source_name && (
          <p className="text-[10px] text-muted-foreground">
            from{" "}
            <span className="font-medium text-foreground">
              {item.effective_price_source_name}
            </span>
          </p>
        )}
        <Button
          asChild
          variant="outline"
          size="sm"
          className="mt-2 w-full gap-1.5 text-xs"
        >
          <Link href={`/dashboard/menu/items/${itemId}/pricing`}>
            <Grid3x3 className="h-3 w-3" /> Open matrix
          </Link>
        </Button>
      </div>

      <div className="space-y-2 rounded-2xl border-0 bg-muted/60 p-3 shadow-none">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Categories</span>
          <Badge variant="secondary" className="text-[10px]">
            {categoryCount}
          </Badge>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Modifier groups</span>
          <Badge variant="secondary" className="text-[10px]">
            {modifierCount}
          </Badge>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Allergens</span>
          <Badge variant="secondary" className="text-[10px]">
            {allergens.length}
          </Badge>
        </div>
      </div>
    </div>
  );
}

export default ItemSummaryCard;
