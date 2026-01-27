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
  BottomSheet,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetTitle,
  BottomSheetTrigger,
  BottomSheetBody,
} from "@/components/ui/bottom-sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Check, X } from "lucide-react";

export interface MenuItemOption {
  id: string;
  name: string;
  category_id?: string | null;
}

interface MenuItemPickerProps {
  label?: string;
  options: MenuItemOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  emptyLabel?: string;
}

export function MenuItemPicker({
  label = "Menu items",
  options,
  value,
  onChange,
  placeholder = "Select menu items",
  emptyLabel = "No menu items available",
}: MenuItemPickerProps) {
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
      <BottomSheet open={open} onOpenChange={setOpen}>
        <BottomSheetTrigger asChild>
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
        </BottomSheetTrigger>
        <BottomSheetContent height="auto" className="sm:max-w-md mx-auto">
          <BottomSheetHeader>
            <BottomSheetTitle>{label}</BottomSheetTitle>
          </BottomSheetHeader>
          <BottomSheetBody className="mt-4">
            <Command>
              <CommandInput placeholder="Search menu items" />
              <CommandList className="max-h-[50vh]">
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
          </BottomSheetBody>
        </BottomSheetContent>
      </BottomSheet>
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
