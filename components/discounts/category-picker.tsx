"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  BottomSheet,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetTitle,
  BottomSheetTrigger,
  BottomSheetBody,
  BottomSheetFooter,
} from "@/components/ui/bottom-sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CategoryOption {
  id: string;
  name: string;
}

interface CategoryPickerProps {
  label?: string;
  options: CategoryOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  emptyLabel?: string;
}

/** A removable selection chip — soft tint, no border, matching the search field. */
const SELECTION_CHIP =
  "inline-flex max-w-full items-center gap-1 rounded-full bg-muted/60 py-0.5 pl-2.5 pr-1 text-xs font-medium text-muted-foreground";

export function CategoryPicker({
  label = "Categories",
  options,
  value,
  onChange,
  placeholder = "Select categories",
  emptyLabel = "No categories available",
}: CategoryPickerProps) {
  const [open, setOpen] = useState(false);

  const selected = useMemo(
    () => options.filter((opt) => value.includes(opt.id)),
    [options, value]
  );

  const toggleValue = (id: string) => {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id));
    } else {
      onChange([...value, id]);
    }
  };

  return (
    <div className="min-w-0 space-y-2">
      <Label className="text-sm text-muted-foreground">{label}</Label>
      <BottomSheet open={open} onOpenChange={setOpen}>
        <BottomSheetTrigger asChild>
          <Button
            variant="outline"
            className="h-9 w-full justify-between gap-2 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
          >
            <span className="min-w-0 truncate">
              {selected.length > 0 ? `${selected.length} selected` : placeholder}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Button>
        </BottomSheetTrigger>

        {/* Fixed-height sheet so the flex layout + footer are always visible */}
        <BottomSheetContent height="95" className="mx-auto sm:max-w-md">
          <BottomSheetHeader>
            <BottomSheetTitle className="text-[1.75rem] font-semibold tracking-[-0.02em]">
              {label}
            </BottomSheetTitle>
          </BottomSheetHeader>

          {/* Scrollable body — CommandList has no inner scroll; the body handles it */}
          <BottomSheetBody className="flex-1 overflow-y-auto">
            <Command className="bg-transparent">
              <CommandInput
                placeholder="Search categories"
                className="text-[0.8125rem]"
              />
              <CommandList className="max-h-none overflow-visible">
                <CommandEmpty className="py-8 text-center text-sm text-muted-foreground">
                  {emptyLabel}
                </CommandEmpty>
                <CommandGroup>
                  {options.map((opt) => {
                    const isSelected = value.includes(opt.id);
                    return (
                      <CommandItem
                        key={opt.id}
                        value={opt.id}
                        onSelect={() => toggleValue(opt.id)}
                        className="flex cursor-pointer items-center gap-3 rounded-full px-3 py-2 text-sm"
                      >
                        <Checkbox checked={isSelected} />
                        <span className="min-w-0 flex-1 truncate">{opt.name}</span>
                        {isSelected && (
                          <Check className="h-4 w-4 shrink-0 text-[#0C4FD1] dark:text-[#6CA0FF]" />
                        )}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>

            {selected.length > 0 && (
              <div className="mt-6">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span className="text-sm text-muted-foreground tabular-nums">
                    Selected ({selected.length})
                  </span>
                  <Button
                    variant="ghost"
                    onClick={() => onChange([])}
                    className="h-8 gap-1.5 rounded-full px-3 text-[0.8125rem] font-medium text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                    Clear all
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selected.map((opt) => (
                    <span key={opt.id} className={SELECTION_CHIP}>
                      <span className="min-w-0 truncate">{opt.name}</span>
                      <button
                        type="button"
                        className="shrink-0 rounded-full p-0.5 transition-colors hover:bg-muted hover:text-foreground"
                        aria-label={`Remove ${opt.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleValue(opt.id);
                        }}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </BottomSheetBody>

          {/* Always-visible footer with Done button */}
          <BottomSheetFooter>
            <Button
              className="h-9 w-full rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
              onClick={() => setOpen(false)}
            >
              Done
            </Button>
          </BottomSheetFooter>
        </BottomSheetContent>
      </BottomSheet>

      {/* Selected chips below the trigger button */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((opt) => (
            <span key={opt.id} className={cn(SELECTION_CHIP)}>
              <span className="min-w-0 truncate">{opt.name}</span>
              <button
                type="button"
                className="shrink-0 rounded-full p-0.5 transition-colors hover:bg-muted hover:text-foreground"
                aria-label={`Remove ${opt.name}`}
                onClick={() => toggleValue(opt.id)}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
