"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/*
 * Field primitives for the website editor.
 *
 * `Input` is already muted (UI-DESIGN-SYSTEM §4.2). `Textarea` and
 * `SelectTrigger` still ship a border (§11 backlog), so the muted material is
 * spelled out here once rather than at every call site. Classes are literal
 * in this .tsx so Tailwind generates them (C7).
 */

export function MutedTextarea({ className, ...props }: React.ComponentProps<typeof Textarea>) {
  return (
    <Textarea
      className={cn(
        "border-0 bg-muted/60 shadow-none focus-visible:bg-background dark:bg-muted/60 dark:focus-visible:bg-background",
        "aria-invalid:border aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  );
}

export type MutedSelectOption = { value: string; label: string };

export function MutedSelect({
  id,
  value,
  onValueChange,
  options,
  placeholder,
  ariaLabel,
  side,
  className,
}: {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: MutedSelectOption[];
  placeholder?: string;
  ariaLabel?: string;
  /** Which way the list opens. It still flips when there is no room that way. */
  side?: "top" | "bottom";
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger
        id={id}
        aria-label={ariaLabel}
        className={cn(
          "w-full min-w-0 border-0 bg-muted/60 shadow-none dark:bg-muted/60 dark:hover:bg-muted",
          className
        )}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent side={side}>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** A labelled ghost icon button, visible at rest (UI-DESIGN-SYSTEM §7). */
export function IconAction({
  label,
  onClick,
  disabled,
  destructive = false,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "shrink-0",
        destructive
          ? "text-destructive hover:bg-destructive/10 hover:text-destructive"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </Button>
  );
}

/** "+ Add …" for a repeatable list: a neutral ghost pill. */
export function AddButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      className="h-9 px-3 text-[0.8125rem] font-medium text-muted-foreground hover:text-foreground"
    >
      <Plus className="h-4 w-4" aria-hidden />
      {children}
    </Button>
  );
}

/**
 * A label above its control, with an optional muted hint below. The hint is
 * dropped below `sm` like any other caption (UI-DESIGN-SYSTEM §13.4); pass
 * `showHintOnMobile` when it is a warning rather than an explanation.
 * Validation errors are rendered by the caller and always show.
 */
export function Field({
  label,
  htmlFor,
  hint,
  showHintOnMobile = false,
  className,
  children,
}: {
  label: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
  showHintOnMobile?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("min-w-0 space-y-2", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && (
        <p className={cn("text-xs text-muted-foreground", !showHintOnMobile && "max-sm:hidden")}>{hint}</p>
      )}
    </div>
  );
}
