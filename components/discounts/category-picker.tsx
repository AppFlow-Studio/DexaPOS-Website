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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            className="h-9 w-full justify-between gap-2 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
          >
            <span className="min-w-0 truncate">
              {selected.length > 0 ? `${selected.length} selected` : placeholder}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Button>
        </DialogTrigger>

        <DialogContent
          elevation="high"
          overlayClassName="bg-slate-950/40 backdrop-blur-md"
          className="flex max-h-[min(85dvh,640px)] w-full max-w-[calc(100vw-1rem)] flex-col gap-0 overflow-hidden rounded-[28px] border bg-background p-0 shadow-[0_30px_100px_rgba(15,23,42,0.26)] sm:max-w-md max-sm:top-1/2 max-sm:left-1/2 max-sm:right-auto max-sm:bottom-auto max-sm:h-auto max-sm:w-[calc(100%-1rem)] max-sm:max-w-md max-sm:-translate-x-1/2 max-sm:-translate-y-1/2 max-sm:rounded-[28px] max-sm:overflow-hidden"
        >
          <DialogHeader className="shrink-0 px-6 py-5 pr-14 text-left sm:text-left">
            <DialogTitle className="text-[1.625rem] font-semibold tracking-tight">
              {label}
            </DialogTitle>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
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
          </div>

          <DialogFooter className="shrink-0 bg-background px-6 py-4 sm:justify-end">
            <Button
              className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
              onClick={() => setOpen(false)}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
