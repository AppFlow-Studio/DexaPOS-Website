"use client";

import { Check } from "lucide-react";
import { useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { hexToHsl, hslToHex, normalizeHex, readableOn } from "@/lib/site-builder/color";
import { BRAND_SWATCHES, brandSwatchName } from "@/lib/site-builder/palettes";
import { cn } from "@/lib/utils";

/**
 * A colour control that does not open the operating system.
 *
 * `<input type="color">` is one line of markup and hands the merchant whatever
 * dialog their OS ships. On Windows that is the sixteen-swatch grid and the
 * "Define Custom Colors" panel, which has looked the same since 1995 and looks
 * nothing like the product it was opened from. Worse, it is a *general* colour
 * picker: it offers all sixteen million with no opinion about which of them make
 * a good restaurant brand, which is the one thing this screen knows.
 *
 * So this offers a curated shortlist first and full control second:
 *
 * - **Swatches** are the answer for most merchants — twenty-four accent colours
 *   that all hold up as a button fill, in one click.
 * - **Fine-tune** is the hue slider and the shade ramp beneath it. Between them
 *   they reach every colour worth reaching, in the two moves people actually
 *   describe: "more orange" and "darker".
 * - **Hex** is for the merchant with a brand guide, who knows the value and just
 *   wants to type it.
 *
 * The value is a hex string throughout. HSL is derived per render rather than
 * held in state, so the field, the slider and the swatches can never disagree
 * about which colour is selected.
 */

/**
 * Eight steps from deep to pale at a fixed hue.
 *
 * Lightness only — saturation carries over from the current colour, so a
 * near-grey stays a near-grey. A ramp that re-saturated as well would mean a
 * merchant who deliberately chose Graphite could not darken it without it
 * turning blue on them.
 */
const SHADE_LIGHTNESS = [0.18, 0.27, 0.36, 0.45, 0.54, 0.63, 0.72, 0.82];

/** Below this a colour reads as grey, and the hue slider has nothing to move. */
const GREY_SATURATION = 0.15;

const HUE_GRADIENT = `linear-gradient(to right, ${[0, 60, 120, 180, 240, 300, 360]
  .map((hue) => `hsl(${hue} 90% 50%)`)
  .join(", ")})`;

/** Shared by every swatch in both grids. */
const SWATCH =
  "flex aspect-square items-center justify-center ring-1 ring-inset ring-black/10 transition-transform hover:scale-110 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring";

export default function ColorPicker({
  value,
  onChange,
  /** Names the control on its trigger and to screen readers. */
  label,
  disabled = false,
}: {
  value: string;
  onChange: (hex: string) => void;
  label: string;
  disabled?: boolean;
}) {
  const [typed, setTyped] = useState(value);
  const [lastValue, setLastValue] = useState(value);

  // The hex field has to hold text that is not yet a colour, so it cannot be
  // derived from the value — but it must still follow it, because clicking a
  // swatch or dragging the slider should leave the box showing the truth.
  //
  // Adjusted during render rather than in an effect: React re-runs this
  // component immediately and commits once, where an effect would paint the
  // stale hex first and then correct it.
  if (value !== lastValue) {
    setLastValue(value);
    setTyped(value.toUpperCase());
  }

  const hsl = hexToHsl(value);
  const current = value.toUpperCase();
  const name = brandSwatchName(value);

  const commitTyped = (raw: string) => {
    setTyped(raw.toUpperCase());
    // A hex pasted out of a brand guide often loses its hash on the way.
    const normalized = normalizeHex(raw.startsWith("#") ? raw : `#${raw}`);
    if (normalized) onChange(normalized);
  };

  const setHue = (hue: number) =>
    onChange(
      hslToHex({
        h: hue,
        // Changing the hue of a grey has no visible effect, which reads as a
        // broken slider. Taking a grey somewhere colourful is what the drag
        // meant, so give it enough saturation to show.
        s: hsl.s < GREY_SATURATION ? 0.75 : hsl.s,
        l: hsl.l,
      }),
    );

  return (
    <Popover>
      <PopoverTrigger
        disabled={disabled}
        aria-label={label}
        className="flex h-10 w-full items-center gap-2.5 rounded-lg border bg-transparent px-2 text-left transition-colors hover:bg-accent/50 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
      >
        <span
          className="size-6 shrink-0 rounded-md ring-1 ring-inset ring-black/15"
          style={{ background: value }}
        />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{name ?? "Custom"}</span>
        <span className="shrink-0 font-mono text-[11px] uppercase text-muted-foreground">
          {current}
        </span>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-72 p-3">
        <div className="grid grid-cols-6 gap-1.5">
          {BRAND_SWATCHES.map((swatch) => {
            const selected = swatch.hex === current;
            return (
              <button
                key={swatch.hex}
                type="button"
                title={swatch.name}
                aria-label={swatch.name}
                aria-pressed={selected}
                onClick={() => onChange(swatch.hex)}
                className={cn(SWATCH, "rounded-lg", selected && "scale-110")}
                style={{ background: swatch.hex }}
              >
                {selected && (
                  <Check className="size-3.5" style={{ color: readableOn(swatch.hex) }} />
                )}
              </button>
            );
          })}
        </div>

        <Divider>Fine-tune</Divider>

        <input
          type="range"
          min={0}
          max={359}
          value={Math.round(hsl.h)}
          onChange={(event) => setHue(Number(event.target.value))}
          aria-label="Hue"
          className="h-3 w-full cursor-pointer appearance-none rounded-full ring-1 ring-inset ring-black/10 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-transparent [&::-moz-range-thumb]:shadow-[0_0_0_1px_rgba(0,0,0,0.35)] [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
          style={{ background: HUE_GRADIENT }}
        />

        <div className="mt-2 grid grid-cols-8 gap-1">
          {SHADE_LIGHTNESS.map((lightness) => {
            const shade = hslToHex({ h: hsl.h, s: Math.max(hsl.s, 0.06), l: lightness });
            const selected = shade === current;
            return (
              <button
                key={lightness}
                type="button"
                title={shade}
                aria-label={`Shade ${shade}`}
                aria-pressed={selected}
                onClick={() => onChange(shade)}
                className={cn(SWATCH, "rounded-md", selected && "scale-110")}
                style={{ background: shade }}
              >
                {selected && <Check className="size-3" style={{ color: readableOn(shade) }} />}
              </button>
            );
          })}
        </div>

        <Divider>Hex</Divider>

        <div className="flex items-center gap-2">
          <span
            className="size-8 shrink-0 rounded-md ring-1 ring-inset ring-black/15"
            style={{ background: value }}
          />
          <input
            value={typed}
            onChange={(event) => commitTyped(event.target.value)}
            maxLength={7}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            aria-label={`${label} hex value`}
            aria-invalid={normalizeHex(typed) === null}
            className={cn(
              "h-8 min-w-0 flex-1 rounded-md border bg-transparent px-2.5 font-mono text-sm uppercase outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              normalizeHex(typed) === null && "border-destructive",
            )}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Divider({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-3 flex items-center gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {children}
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
