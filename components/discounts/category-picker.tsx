"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Check, X } from "lucide-react";

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
    <div className="space-y-2">
      <Label>{label}</Label>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" className="w-full justify-between">
            <span>
              {selected.length > 0
                ? `${selected.length} selected`
                : placeholder}
            </span>
            {selected.length > 0 && (
              <span className="ml-2 text-xs text-muted-foreground">
                ({selected.length})
              </span>
            )}
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{label}</SheetTitle>
          </SheetHeader>
          <div className="mt-6">
            <Command>
              <CommandInput placeholder="Search categories" />
              <CommandList className="max-h-screen">
                <CommandEmpty>{emptyLabel}</CommandEmpty>
                <CommandGroup>
                  {options.map((opt) => {
                    const isSelected = value.includes(opt.id);
                    return (
                      <CommandItem
                        key={opt.id}
                        value={opt.id}
                        onSelect={() => toggleValue(opt.id)}
                        className="flex items-center gap-3 cursor-pointer"
                      >
                        <Checkbox checked={isSelected} />
                        <span className="flex-1">{opt.name}</span>
                        {isSelected && (
                          <Check className="h-4 w-4 text-primary" />
                        )}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </div>
          {selected.length > 0 && (
            <div className="mt-4 pt-4 border-t">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">
                  Selected ({selected.length})
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onChange([])}
                  className="h-7 text-xs"
                >
                  Clear all
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {selected.map((opt) => (
                  <Badge
                    key={opt.id}
                    variant="secondary"
                    className="gap-1 pr-1"
                  >
                    {opt.name}
                    <button
                      type="button"
                      className="ml-1 rounded-full hover:bg-muted p-0.5"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleValue(opt.id);
                      }}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((opt) => (
            <Badge key={opt.id} variant="secondary" className="gap-1">
              {opt.name}
              <button
                type="button"
                className="text-xs hover:text-destructive"
                onClick={() => toggleValue(opt.id)}
              >
                ×
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
