"use client";

import * as React from "react";
import { Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface StaffPinFieldProps {
  pin?: string | null;
  hasPin: boolean;
  onGenerate: () => void;
  isGenerating?: boolean;
  disabled?: boolean;
  label?: string;
  buttonLabel?: string;
  visibleDescription?: string;
}

const PIN_REGEX = /^\d{4,6}$/;

function isReadablePin(pin?: string | null) {
  return !!pin && PIN_REGEX.test(pin);
}

function getMaskedPin(pin?: string | null) {
  if (!pin) return "";
  return "*".repeat(pin.length);
}

export function StaffPinField({
  pin,
  hasPin,
  onGenerate,
  isGenerating = false,
  disabled = false,
  label = "PIN",
  buttonLabel,
  visibleDescription,
}: StaffPinFieldProps) {
  const [isVisible, setIsVisible] = React.useState(false);

  React.useEffect(() => {
    setIsVisible(false);
  }, [pin]);

  const readablePin = isReadablePin(pin);
  const legacyHashedPin = Boolean(pin) && !readablePin;
  const effectiveButtonLabel =
    buttonLabel || (hasPin ? "Generate New PIN" : "Generate PIN");

  const displayValue = readablePin
    ? isVisible
      ? pin
      : getMaskedPin(pin)
    : legacyHashedPin
      ? "******"
      : "";

  const helperText = legacyHashedPin
    ? "This PIN is stored in the legacy hashed format and cannot be shown. Generate a new PIN to replace it."
    : readablePin
      ? visibleDescription || "Use the eye icon to reveal the current PIN."
      : "No PIN is set yet. Generate one to enable POS login.";

  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Input
            readOnly
            value={displayValue}
            placeholder={hasPin ? "PIN unavailable" : "No PIN set"}
            className="pr-10 font-mono tracking-[0.35em]"
          />
          {readablePin && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"
              onClick={() => setIsVisible((value) => !value)}
            >
              {isVisible ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          className="gap-2 sm:shrink-0"
          onClick={onGenerate}
          disabled={disabled || isGenerating}
        >
          {isGenerating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <KeyRound className="h-4 w-4" />
          )}
          {effectiveButtonLabel}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{helperText}</p>
    </div>
  );
}
