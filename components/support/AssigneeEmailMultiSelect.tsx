"use client";

import { Check, ChevronsUpDown, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type AssigneeEmailMultiSelectProps = {
  emails: string[];
  value: string[];
  onChange: (emails: string[]) => void;
  disabled?: boolean;
};

export function AssigneeEmailMultiSelect({
  emails,
  value,
  onChange,
  disabled,
}: AssigneeEmailMultiSelectProps) {
  const selected = new Set(value.map((email) => email.toLowerCase()));

  const toggleEmail = (email: string) => {
    const isSelected = selected.has(email.toLowerCase());
    onChange(
      isSelected
        ? value.filter(
            (selectedEmail) =>
              selectedEmail.toLowerCase() !== email.toLowerCase(),
          )
        : [...value, email],
    );
  };

  return (
    <div className="space-y-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-label="Select ticket assignees"
            className="w-full justify-between font-normal"
            disabled={disabled || emails.length === 0}
          >
            <span
              className={cn(
                "truncate",
                value.length === 0 && "text-muted-foreground",
              )}
            >
              {emails.length === 0
                ? "No support assignees configured"
                : value.length === 0
                  ? "Select assignees..."
                  : `${value.length} assignee${value.length === 1 ? "" : "s"} selected`}
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[--radix-popover-trigger-width] p-0"
          align="start"
        >
          <Command>
            <CommandList>
              <CommandEmpty>No support assignees configured.</CommandEmpty>
              {emails.map((email) => {
                const isSelected = selected.has(email.toLowerCase());
                return (
                  <CommandItem
                    key={email}
                    value={email}
                    onSelect={() => toggleEmail(email)}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        isSelected ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="truncate">{email}</span>
                  </CommandItem>
                );
              })}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Selected assignees">
          {value.map((email) => (
            <Badge key={email} variant="secondary" className="gap-1 pr-1">
              {email}
              <button
                type="button"
                className="rounded-sm p-0.5 hover:bg-muted-foreground/15"
                aria-label={`Remove ${email}`}
                onClick={() => toggleEmail(email)}
                disabled={disabled}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
