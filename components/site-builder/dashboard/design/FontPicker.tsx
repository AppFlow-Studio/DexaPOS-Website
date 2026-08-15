"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fontsForRole, findFontByStack, type FontCategory, type FontRole } from "@/lib/site-builder/fonts";

const CATEGORY_ORDER: FontCategory[] = ["Sans", "Serif", "Display", "Handwritten", "System"];

/**
 * Picks one typeface for one slot.
 *
 * Every option renders in the face it names, because "Cormorant Garamond" tells
 * a restaurant owner nothing and the specimen tells them everything. Display
 * faces are filtered out of the body slot by `fontsForRole` — Anton is a fine
 * headline and an unreadable paragraph, and the picker should not offer a
 * choice that is always wrong.
 */
export default function FontPicker({
  id,
  role,
  label,
  value,
  onChange,
}: {
  id: string;
  role: FontRole;
  label: string;
  value: string;
  onChange: (stack: string) => void;
}) {
  const options = fontsForRole(role);
  const selected = findFontByStack(value);
  const grouped = CATEGORY_ORDER.map((category) => ({
    category,
    fonts: options.filter((font) => font.category === category),
  })).filter((group) => group.fonts.length > 0);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={selected?.stack ?? value} onValueChange={onChange}>
        <SelectTrigger id={id} className="h-11 w-full" aria-describedby={`${id}-help`}>
          <SelectValue placeholder="Choose a typeface">
            <span style={{ fontFamily: selected?.stack ?? value }} className="text-base">
              {selected?.name ?? "Custom font"}
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent align="start" className="max-h-80">
          {grouped.map((group) => (
            <SelectGroup key={group.category}>
              <SelectLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {group.category}
              </SelectLabel>
              {group.fonts.map((font) => (
                <SelectItem key={font.id} value={font.stack} className="py-2.5">
                  <span className="flex min-w-0 flex-col">
                    <span style={{ fontFamily: font.stack }} className="text-base leading-tight">
                      {font.name}
                    </span>
                    <span className="text-xs text-muted-foreground">{font.note}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      <p id={`${id}-help`} className="text-xs text-muted-foreground">
        {selected?.note ?? "Applied across every page of the website."}
      </p>
    </div>
  );
}
