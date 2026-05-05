"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface PhoneDigitsInputProps {
  /** 10-digit string (no formatting). Empty string when cleared. */
  value: string;
  /** Fires on every change with the current 10-digit string (may be < 10 chars). */
  onChange: (digits: string) => void;
  /** Optional: fires when all 10 digits are entered. */
  onComplete?: (digits: string) => void;
  disabled?: boolean;
  className?: string;
  autoFocus?: boolean;
  "aria-label"?: string;
}

const GROUPS: number[] = [3, 3, 4];

/**
 * 10-cell US phone number input. Auto-advances on digit entry, supports
 * backspace navigation and paste. No country-code prefix — caller is
 * responsible for adding +1 when sending.
 */
export function PhoneDigitsInput({
  value,
  onChange,
  onComplete,
  disabled,
  className,
  autoFocus,
  "aria-label": ariaLabel = "Phone number",
}: PhoneDigitsInputProps) {
  const cells = React.useMemo(() => {
    const padded = value.padEnd(10, " ").slice(0, 10);
    return Array.from(padded).map((c) => (/\d/.test(c) ? c : ""));
  }, [value]);

  const refs = React.useRef<Array<HTMLInputElement | null>>([]);

  const setCell = (index: number, digit: string) => {
    const next = cells.slice();
    next[index] = digit;
    const joined = next.join("").replace(/\s/g, "");
    onChange(joined);
    if (joined.length === 10 && next.every((c) => c !== "")) {
      onComplete?.(joined);
    }
  };

  const focusCell = (index: number) => {
    const el = refs.current[index];
    if (el) {
      el.focus();
      el.select();
    }
  };

  const handleChange = (
    index: number,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const raw = e.target.value;
    const digit = raw.replace(/\D/g, "").slice(-1);
    if (!digit) {
      setCell(index, "");
      return;
    }
    setCell(index, digit);
    if (index < 9) focusCell(index + 1);
  };

  const handleKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (e.key === "Backspace") {
      if (cells[index]) {
        setCell(index, "");
      } else if (index > 0) {
        e.preventDefault();
        setCell(index - 1, "");
        focusCell(index - 1);
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      focusCell(index - 1);
    } else if (e.key === "ArrowRight" && index < 9) {
      e.preventDefault();
      focusCell(index + 1);
    }
  };

  const handlePaste = (
    index: number,
    e: React.ClipboardEvent<HTMLInputElement>
  ) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text") ?? "";
    const digits = text.replace(/\D/g, "");
    if (!digits) return;
    // Strip leading country code "1" if 11 digits pasted
    const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
    const startAt = index;
    const next = cells.slice();
    for (let i = 0; i < ten.length && startAt + i < 10; i++) {
      next[startAt + i] = ten[i];
    }
    const joined = next.join("").replace(/\s/g, "");
    onChange(joined);
    const focusIdx = Math.min(startAt + ten.length, 9);
    requestAnimationFrame(() => focusCell(focusIdx));
    if (joined.length === 10) onComplete?.(joined);
  };

  let cellIndex = 0;
  return (
    <div
      className={cn("flex w-full items-center gap-1.5", className)}
      role="group"
      aria-label={ariaLabel}
    >
      {GROUPS.map((groupSize, gi) => (
        <React.Fragment key={gi}>
          <div
            className="grid min-w-0 gap-1"
            style={{
              flex: `${groupSize} ${groupSize} 0%`,
              gridTemplateColumns: `repeat(${groupSize}, minmax(0, 1fr))`,
            }}
          >
            {Array.from({ length: groupSize }).map(() => {
              const i = cellIndex++;
              return (
                <input
                  key={i}
                  ref={(el) => {
                    refs.current[i] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={1}
                  pattern="[0-9]*"
                  disabled={disabled}
                  autoFocus={autoFocus && i === 0}
                  value={cells[i]}
                  onChange={(e) => handleChange(i, e)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  onPaste={(e) => handlePaste(i, e)}
                  onFocus={(e) => e.currentTarget.select()}
                  aria-label={`Digit ${i + 1}`}
                  className={cn(
                    "h-11 w-full min-w-0 rounded-xl border bg-background px-0 text-center font-mono text-base font-medium tabular-nums shadow-sm transition-colors",
                    "border-input focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                    cells[i]
                      ? "border-foreground/40 text-foreground"
                      : "text-muted-foreground"
                  )}
                />
              );
            })}
          </div>
          {gi < GROUPS.length - 1 && (
            <span className="select-none text-muted-foreground/60 shrink-0 px-0.5">
              ·
            </span>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
