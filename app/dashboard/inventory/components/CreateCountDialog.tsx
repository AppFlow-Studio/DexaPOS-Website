"use client";

import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ClipboardList, Loader2 } from "lucide-react";
import { CreateCountInput } from "../../actions/inventory-counts";

export interface CountPickItem {
  id: string;
  name: string;
  category?: string | null;
}

interface CreateCountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: CountPickItem[];
  onConfirm: (input: CreateCountInput) => Promise<void>;
  isPending?: boolean;
}

export function CreateCountDialog({
  open,
  onOpenChange,
  items,
  onConfirm,
  isPending,
}: CreateCountDialogProps) {
  const [name, setName] = useState("");
  const [assignee, setAssignee] = useState("");
  const [scope, setScope] = useState<"all" | "categories">("all");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  const categories = useMemo(
    () =>
      [
        ...new Set(
          items.map((i) => i.category).filter(Boolean) as string[],
        ),
      ].sort(),
    [items],
  );

  const scopedItemIds = useMemo(() => {
    if (scope === "all") return undefined;
    return items
      .filter(
        (i) => i.category != null && selectedCategories.includes(i.category),
      )
      .map((i) => i.id);
  }, [scope, items, selectedCategories]);

  const itemCount =
    scope === "all" ? items.length : (scopedItemIds?.length ?? 0);
  const isValid =
    name.trim().length > 0 &&
    (scope === "all" || (scopedItemIds?.length ?? 0) > 0);

  const reset = () => {
    setName("");
    setAssignee("");
    setScope("all");
    setSelectedCategories([]);
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) reset();
    onOpenChange(isOpen);
  };

  const toggleCategory = (cat: string) =>
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    await onConfirm({
      count_name: name.trim(),
      assigned_to_name: assignee.trim() || undefined,
      item_ids: scopedItemIds,
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-teal-500/20 to-teal-500/5 border border-teal-500/10">
              <ClipboardList className="h-5 w-5 text-teal-500" />
            </div>
            <div>
              <DialogTitle>New Inventory Count</DialogTitle>
              <DialogDescription>
                Snapshots current stock as the expected quantity for each item.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="count-name">
              Count Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="count-name"
              placeholder="e.g. Weekly Dry Goods, Sunday Full Count"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="count-assignee">Assigned To</Label>
            <Input
              id="count-assignee"
              placeholder="Optional — staff member name"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Scope</Label>
            <RadioGroup
              value={scope}
              onValueChange={(v) => setScope(v as "all" | "categories")}
            >
              <label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="all" id="scope-all" />
                <span className="text-sm">
                  All active items ({items.length})
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="categories" id="scope-cat" />
                <span className="text-sm">Selected categories</span>
              </label>
            </RadioGroup>
          </div>

          {scope === "categories" && (
            <div className="space-y-1.5 max-h-44 overflow-y-auto rounded-lg border p-3">
              {categories.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No categories found on your inventory items.
                </p>
              )}
              {categories.map((cat) => (
                <label
                  key={cat}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Checkbox
                    checked={selectedCategories.includes(cat)}
                    onCheckedChange={() => toggleCategory(cat)}
                  />
                  <span className="text-sm">{cat}</span>
                </label>
              ))}
            </div>
          )}

          <div className="p-3 rounded-lg bg-muted/50 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Items in this count
            </span>
            <span className="font-semibold">{itemCount}</span>
          </div>
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending || !isValid}
            className="gap-2"
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Create Count
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
