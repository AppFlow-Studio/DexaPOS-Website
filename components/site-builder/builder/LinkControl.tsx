"use client";

import { useRef } from "react";

import type { FieldControl } from "@/lib/site-builder/schema-introspect";
import { FieldLabel, inputClass } from "./field-chrome";
import type { NavPageOption } from "./NavEditor";


type LinkValue = { label?: string; target?: { kind?: string; value?: string } };

/**
 * A button: its text, where it goes, and the detail that destination needs.
 *
 * **Switching destination does not throw away what was typed.** Only `url`,
 * `phone` and `page` carry a value, and each means something different, so the
 * value cannot simply be carried across a switch — a phone number is not a URL.
 * The previous behaviour concluded from that it should be discarded, so looking
 * at "Call us" and changing your mind cost you the address you had already
 * typed. Instead each kind's last value is remembered locally and restored if
 * the merchant comes back to it, which is what "changed my mind" should mean.
 *
 * Memory is per mount, deliberately: it is a convenience for one editing
 * session, not something to persist into the document.
 */
export function LinkControl({
  control,
  value,
  pages,
  onChange,
}: {
  control: FieldControl;
  value: unknown;
  pages: NavPageOption[];
  onChange: (value: unknown) => void;
}) {
  const link = (value ?? {}) as LinkValue;
  const pageOptions = pages.filter((page) => page.isPublished);
  const kind = link.target?.kind ?? "order";

  const remembered = useRef<Record<string, string>>({});

  /** Kinds that need a value, and what to fall back to when nothing is remembered. */
  const seedFor = (next: string): string | undefined => {
    if (next === "page") return remembered.current.page ?? pageOptions[0]?.path;
    if (next === "url" || next === "phone") return remembered.current[next] ?? "";
    return undefined;
  };

  const commit = (target: { kind: string; value?: string }, label?: string) => {
    if (target.value) remembered.current[target.kind] = target.value;
    onChange({
      label: label ?? link.label ?? "Learn more",
      target: { kind: target.kind, ...(target.value ? { value: target.value } : {}) },
    });
  };

  return (
    <div>
      <FieldLabel control={control} />
      <div className="space-y-2 rounded-md border p-3">
        <input
          type="text"
          placeholder="Button text"
          aria-label={`${control.label} text`}
          value={link.label ?? ""}
          onChange={(e) =>
            onChange(
              e.target.value
                ? { label: e.target.value, target: link.target ?? { kind: "order" } }
                : undefined,
            )
          }
          className={inputClass}
        />

        <select
          aria-label={`${control.label} destination`}
          value={kind}
          onChange={(e) => {
            // Stash what is on screen before leaving it, so the switch itself
            // is what makes the value recoverable.
            if (link.target?.kind && link.target.value) {
              remembered.current[link.target.kind] = link.target.value;
            }
            const next = e.target.value;
            commit({ kind: next, value: seedFor(next) }, link.label ?? "Order Now");
          }}
          className={inputClass}
        >
          <option value="order">Go to ordering</option>
          <option value="menu">Go to the menu</option>
          <option value="contact">Jump to contact</option>
          <option value="page">Another page</option>
          <option value="url">External link</option>
          <option value="phone">Call us</option>
        </select>

        {kind === "page" && (
          <select
            aria-label="Page destination"
            value={link.target?.value ?? ""}
            onChange={(e) => commit({ kind: "page", value: e.target.value })}
            className={inputClass}
          >
            {pageOptions.length === 0 && <option value="">No published pages</option>}
            {pageOptions.map((page) => (
              <option key={page.path} value={page.path}>
                {page.title}
              </option>
            ))}
          </select>
        )}

        {(kind === "url" || kind === "phone") && (
          <input
            type="text"
            placeholder={kind === "url" ? "https://…" : "+1 555 000 0000"}
            aria-label={kind === "url" ? "Link URL" : "Phone number"}
            value={link.target?.value ?? ""}
            onChange={(e) => commit({ kind, value: e.target.value })}
            className={inputClass}
          />
        )}
      </div>
    </div>
  );
}
