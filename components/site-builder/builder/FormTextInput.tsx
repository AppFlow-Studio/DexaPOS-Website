"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export const FORM_INPUT_CLASS =
  "w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function FormTextInput({
  label,
  value,
  onChange,
  multiline,
  optional,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  optional?: boolean;
  maxLength?: number;
}) {
  const draft = useTextDraft(value, onChange, optional === true);

  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium">
        {label}
        {optional && <span className="ml-1 font-normal text-muted-foreground">optional</span>}
      </span>
      {multiline ? (
        <textarea
          rows={3}
          value={draft.value}
          maxLength={maxLength}
          onFocus={draft.onFocus}
          onBlur={draft.onBlur}
          onChange={(event) => draft.onChange(event.target.value)}
          className={cn(FORM_INPUT_CLASS, "resize-y")}
        />
      ) : (
        <input
          type="text"
          value={draft.value}
          maxLength={maxLength}
          onFocus={draft.onFocus}
          onBlur={draft.onBlur}
          onChange={(event) => draft.onChange(event.target.value)}
          className={FORM_INPUT_CLASS}
        />
      )}
    </label>
  );
}

/**
 * Keeps the raw text while a control has focus.
 *
 * Field schemas trim and reject blank required values. Sending every keystroke
 * through those schemas is still useful for the document, but it must not make
 * the input snap back when a merchant types a trailing space or clears the old
 * label before writing a new one. The latest valid parent value is restored on
 * blur if the draft never became valid.
 */
export function useTextDraft(
  value: string,
  commit: (value: string) => void,
  commitBlank = false,
) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);

  return {
    value: draft,
    onFocus: () => {
      focused.current = true;
    },
    onBlur: () => {
      focused.current = false;
      setDraft(value);
    },
    onChange: (next: string) => {
      setDraft(next);
      if (commitBlank || next.trim()) commit(next);
    },
  };
}
