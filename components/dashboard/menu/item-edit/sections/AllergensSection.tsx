"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { UpdateMenuItem } from "@/app/dashboard/actions/menu-items";
import { AffectsTag } from "../../AffectsTag";
import { SectionHeader } from "./OverviewSection";
import { X, Plus } from "lucide-react";
import type { SectionRenderCtx } from "@/app/dashboard/menu/items/[itemId]/edit/ItemEditLayout";

export function AllergensSection({ itemId, item, globalScope }: SectionRenderCtx) {
  const queryClient = useQueryClient();
  const [allergens, setAllergens] = React.useState<string[]>(
    item?.allergens ?? [],
  );
  const [input, setInput] = React.useState("");

  React.useEffect(() => {
    setAllergens(item?.allergens ?? []);
  }, [item?.id, item?.allergens]);

  const addAllergen = () => {
    const v = input.trim();
    if (!v) return;
    if (allergens.includes(v)) return;
    setAllergens([...allergens, v]);
    setInput("");
  };

  const removeAllergen = (a: string) => {
    setAllergens(allergens.filter((x) => x !== a));
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await UpdateMenuItem(itemId, { allergens }, undefined);
      if (res.error) throw new Error(res.error);
      return res;
    },
    onSuccess: () => {
      toast.success("Allergens saved");
      queryClient.invalidateQueries({ queryKey: ["menu-item", itemId] });
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
      queryClient.invalidateQueries({ queryKey: ["menu-items-flat"] });
      queryClient.invalidateQueries({ queryKey: ["categories-with-items"] });
    },
    onError: (err) =>
      toast.error("Save failed", {
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  return (
    <div className="space-y-4">
      <SectionHeader title="Allergens" scope={globalScope} />
      <div className="space-y-3 rounded-lg border bg-card p-4">
        <div className="flex flex-wrap gap-1.5">
          {allergens.length === 0 && (
            <span className="text-xs text-muted-foreground">
              No allergens set.
            </span>
          )}
          {allergens.map((a) => (
            <Badge key={a} variant="secondary" className="gap-1">
              {a}
              <button
                type="button"
                onClick={() => removeAllergen(a)}
                className="hover:text-destructive"
                aria-label={`Remove ${a}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Add an allergen (e.g. Gluten)"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addAllergen();
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addAllergen}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="flex items-center justify-end">
          <Button
            type="button"
            size="sm"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <>
                Save Allergens
                <AffectsTag ctx={globalScope} variant="save-button" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
