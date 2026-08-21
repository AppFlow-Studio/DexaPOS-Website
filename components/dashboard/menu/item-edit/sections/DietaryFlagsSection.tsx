"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { UpdateMenuItem } from "@/app/dashboard/actions/menu-items";
import { AffectsTag } from "../../AffectsTag";
import { SectionHeader } from "./OverviewSection";
import type { SectionRenderCtx } from "@/app/dashboard/menu/items/[itemId]/edit/ItemEditLayout";

const DIETARY_OPTIONS = [
  "Vegan",
  "Vegetarian",
  "Gluten-Free",
  "Dairy-Free",
  "Keto",
] as const;

export function DietaryFlagsSection({ itemId, item, globalScope }: SectionRenderCtx) {
  const queryClient = useQueryClient();
  const [flags, setFlags] = React.useState<string[]>(
    item?.dietary_flags ?? [],
  );

  React.useEffect(() => {
    setFlags(item?.dietary_flags ?? []);
  }, [item?.id, item?.dietary_flags]);

  const toggle = (opt: string) => {
    setFlags((prev) =>
      prev.includes(opt) ? prev.filter((f) => f !== opt) : [...prev, opt],
    );
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await UpdateMenuItem(itemId, { dietary_flags: flags }, undefined);
      if (res.error) throw new Error(res.error);
      return res;
    },
    onSuccess: () => {
      toast.success("Dietary flags saved");
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
      <SectionHeader title="Dietary Flags" scope={globalScope} />
      <div className="space-y-3 rounded-2xl border bg-card p-6">
        <p className="text-xs text-muted-foreground">
          These appear as filter chips on the storefront. Only tags present on
          at least one item in the menu are shown to customers.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {DIETARY_OPTIONS.map((opt) => (
            <div key={opt} className="flex items-center gap-2">
              <Checkbox
                id={`dietary-${opt}`}
                checked={flags.includes(opt)}
                onCheckedChange={() => toggle(opt)}
              />
              <Label htmlFor={`dietary-${opt}`} className="cursor-pointer font-normal">
                {opt}
              </Label>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-end pt-1">
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
                Save Dietary Flags
                <AffectsTag ctx={globalScope} variant="save-button" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
