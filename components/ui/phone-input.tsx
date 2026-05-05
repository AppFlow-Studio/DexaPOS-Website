"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  formatPhoneAsTyping,
  normalizeToE164,
  tenDigits,
} from "@/lib/phone";

export interface PhoneInputProps
  extends Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> {
  /**
   * Controlled value. Accepts any phone format ("+15551234567",
   * "(555) 123-4567", "5551234567"). The input always renders a formatted
   * "(555) 123-4567" view; storage is the caller's choice.
   */
  value: string | null | undefined;
  /**
   * Fires on every keystroke. Receives `{ display, e164, digits }`:
   *   - display: "(555) 123-4567" — what the input is showing
   *   - e164: "+15551234567" or null when incomplete
   *   - digits: "5551234567" — 10 NSN digits (may be partial)
   *
   * For react-hook-form, you typically wire `field.onChange(e164 ?? digits)`.
   */
  onChange: (next: { display: string; e164: string | null; digits: string }) => void;
  /** Optional: a leading country code chip prefix shown to the user. Defaults to "+1". */
  countryPrefix?: string;
}

/**
 * Phone number input with progressive "(555) 000-0000" formatting.
 * Country code (+1) is implicit — the user types only the 10 NSN digits.
 *
 * Pair with `normalizeToE164` from `@/lib/phone` on form submit to canonicalize
 * the value for storage.
 */
export const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  function PhoneInput(
    { value, onChange, className, countryPrefix = "+1", placeholder, ...rest },
    ref
  ) {
    const display = React.useMemo(() => formatPhoneAsTyping(value ?? ""), [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = formatPhoneAsTyping(e.target.value);
      const digits = tenDigits(next);
      const e164 = normalizeToE164(digits);
      onChange({ display: next, digits, e164 });
    };

    return (
      <div
        className={cn(
          "flex items-stretch overflow-hidden rounded-md border border-input bg-transparent shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px] aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30",
          className
        )}
        data-slot="phone-input"
      >
        <span className="select-none flex items-center px-3 text-sm font-medium text-muted-foreground border-r border-input bg-muted/30">
          {countryPrefix}
        </span>
        <Input
          ref={ref}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          value={display}
          onChange={handleChange}
          placeholder={placeholder ?? "(555) 000-0000"}
          className="border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:border-0 rounded-none"
          {...rest}
        />
      </div>
    );
  }
);
