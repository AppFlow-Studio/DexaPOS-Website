import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { KioskProfile } from "@/app/dashboard/actions/kiosk";
import type { PreviewSection } from "./usePreviewMenu";

const NUDGE_PX = 120;
const FADE_WIDTH = 40;
const PILL_PADDING_V = 14;
const PILL_BORDER_WIDTH = 1;
const PILL_FONT_SIZE = 16;
const PILL_LINE_HEIGHT = PILL_FONT_SIZE * 1.2;
// Matches the pill's own full border-box height (2x vertical padding + text
// line height + 2x border) so the nudge button is centered against the same
// height the pill row actually renders at, not an approximation that's a
// couple px short — the row's own height is set by its tallest pill,
// borders included.
const BUTTON_SIZE = PILL_PADDING_V * 2 + PILL_LINE_HEIGHT + PILL_BORDER_WIDTH * 2;
const CHEVRON_SIZE = BUTTON_SIZE * 0.5;

/**
 * Web port of Dexa-POS's components/kiosk/shared/KioskCategoryRail.tsx —
 * exact px values from that component at kiosk scale 1.0 (paddingVertical
 * 18/horizontal 14 on the list, item padding 16, radius 18, section label
 * 11px/800-weight/1.8 tracking, item label 16px).
 */
export function PreviewCategoryRail({
  profile,
  sections,
  resolvedKey,
  onSelect,
}: {
  profile: KioskProfile;
  sections: PreviewSection[];
  resolvedKey: string | null;
  onSelect: (key: string) => void;
}) {
  return (
    <div
      className="h-full overflow-y-auto"
      style={{
        backgroundColor: profile.background_color,
        borderRight: `1px solid ${profile.text_color}0F`,
        padding: "18px 14px",
      }}
    >
      {sections.map((section, sectionIndex) => (
        <div key={section.menuId}>
          <div
            style={{
              padding: `${sectionIndex === 0 ? 4 : 26}px 10px 12px`,
            }}
          >
            <p
              style={{
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: 1.8,
                textTransform: "uppercase",
                color: `${profile.text_color}66`,
                margin: 0,
              }}
            >
              {section.title}
            </p>
          </div>
          {section.categories.map((category) => {
            const key = `${section.menuId}:${category.id}`;
            const selected = key === resolvedKey;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onSelect(key)}
                className="relative flex w-full items-center overflow-hidden text-left"
                style={{
                  gap: 12,
                  padding: "16px",
                  marginBottom: 8,
                  borderRadius: 18,
                  backgroundColor: selected ? `${profile.primary_color}12` : "transparent",
                  border: `1px solid ${selected ? `${profile.primary_color}30` : "transparent"}`,
                }}
              >
                <span
                  className="absolute left-0"
                  style={{
                    top: 10,
                    bottom: 10,
                    width: 4,
                    borderRadius: 2,
                    backgroundColor: selected ? profile.primary_color : "transparent",
                  }}
                />
                <span
                  className="line-clamp-2 flex-1"
                  style={{
                    fontSize: 16,
                    fontWeight: selected ? 700 : 500,
                    color: selected ? profile.primary_color : profile.text_color,
                  }}
                >
                  {category.category.name}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/**
 * Web port of Dexa-POS's components/kiosk/shared/KioskCategoryPillBar.tsx —
 * exact px values (bar padding 16/12, pill margin-right 10, pill padding
 * 24/14, pill label 16px). Scroll affordance (fade edges + chevron nudge
 * buttons) mirrors the same component's port of the POS's MenuControls.tsx
 * category row — 2px scroll-position tolerance, fixed-120px nudge.
 */
export function PreviewCategoryPillBar({
  profile,
  sections,
  resolvedKey,
  onSelect,
}: {
  profile: KioskProfile;
  sections: PreviewSection[];
  resolvedKey: string | null;
  onSelect: (key: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollAffordance = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const maxOffset = Math.max(0, el.scrollWidth - el.clientWidth);
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft < maxOffset - 2);
  }, []);

  // Re-measure whenever the row's content or container size changes (not
  // just on scroll) — otherwise a pill row that overflows on first render
  // shows no fade/chevrons until the user scrolls once.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollAffordance();
    const observer = new ResizeObserver(updateScrollAffordance);
    observer.observe(el);
    return () => observer.disconnect();
  }, [updateScrollAffordance, sections]);

  // Deduped by category name — the pill bar has no per-menu grouping to
  // disambiguate repeats the way PreviewCategoryRail's menu-name headers
  // do, so two menus sharing a category name (e.g. both have "Drinks")
  // would otherwise show as two identical, unexplained pills. First
  // occurrence wins; the pill still only selects that one category.
  const seen = new Set<string>();
  const pills = sections.flatMap((section) =>
    section.categories
      .filter((category) => {
        const name = category.category.name;
        if (seen.has(name)) return false;
        seen.add(name);
        return true;
      })
      .map((category) => ({
        key: `${section.menuId}:${category.id}`,
        name: category.category.name,
      })),
  );

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        className="flex shrink-0 items-center overflow-x-auto"
        style={{ padding: "12px 16px" }}
        onScroll={updateScrollAffordance}
      >
        {pills.map(({ key, name }) => {
          const selected = key === resolvedKey;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              className="shrink-0 whitespace-nowrap"
              style={{
                marginRight: 10,
                padding: "14px 24px",
                borderRadius: 999,
                backgroundColor: selected ? profile.primary_color : `${profile.primary_color}0F`,
                border: `1px solid ${selected ? profile.primary_color : `${profile.text_color}14`}`,
                fontSize: 16,
                fontWeight: selected ? 700 : 500,
                color: selected ? "#FFFFFF" : profile.text_color,
              }}
            >
              {name}
            </button>
          );
        })}
      </div>

      {canScrollLeft ? (
        <div
          className="pointer-events-none absolute inset-y-0 left-0"
          style={{
            width: FADE_WIDTH,
            background: `linear-gradient(to right, ${profile.background_color}, ${profile.background_color}00)`,
          }}
        />
      ) : null}

      {canScrollRight ? (
        <div
          className="pointer-events-none absolute inset-y-0 right-0"
          style={{
            width: FADE_WIDTH,
            background: `linear-gradient(to left, ${profile.background_color}, ${profile.background_color}00)`,
          }}
        />
      ) : null}

      {canScrollLeft ? (
        <button
          type="button"
          onClick={() => {
            scrollRef.current?.scrollBy({ left: -NUDGE_PX, behavior: "smooth" });
          }}
          className="absolute flex items-center justify-center rounded-full"
          style={{
            left: 4,
            top: "50%",
            marginTop: -(BUTTON_SIZE / 2 + 6),
            width: BUTTON_SIZE,
            height: BUTTON_SIZE,
            padding: 0,
            border: "none",
            boxSizing: "border-box",
            backgroundColor: profile.background_color,
            boxShadow: "0 2px 6px rgba(0,0,0,0.28)",
          }}
        >
          <ChevronLeft size={CHEVRON_SIZE} color={profile.text_color} />
        </button>
      ) : null}

      {canScrollRight ? (
        <button
          type="button"
          onClick={() => {
            scrollRef.current?.scrollBy({ left: NUDGE_PX, behavior: "smooth" });
          }}
          className="absolute flex items-center justify-center rounded-full"
          style={{
            right: 4,
            top: "50%",
            marginTop: -(BUTTON_SIZE / 2 + 6),
            width: BUTTON_SIZE,
            height: BUTTON_SIZE,
            backgroundColor: profile.background_color,
            boxShadow: "0 2px 6px rgba(0,0,0,0.28)",
          }}
        >
          <ChevronRight size={CHEVRON_SIZE} color={profile.text_color} />
        </button>
      ) : null}
    </div>
  );
}
