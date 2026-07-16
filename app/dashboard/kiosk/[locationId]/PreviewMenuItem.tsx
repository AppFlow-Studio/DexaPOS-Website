import { ImageIcon } from "lucide-react";

import type { MenuCategoryItem } from "@/types/menu";
import type { KioskProfile } from "@/app/dashboard/actions/kiosk";

/**
 * Web port of Dexa-POS's components/kiosk/shared/KioskMenuItem.tsx — exact
 * px values from that component at kiosk scale 1.0: radius 16, divider
 * height 1 with 12px side margin, content padding 12/8 with 4px gap, name
 * 15px/600, price 15px/700, cash pill 13px/700 with 8px radius, modifier
 * corner 22px triangle.
 */
export function PreviewMenuItem({
  item,
  profile,
}: {
  item: MenuCategoryItem["menu_item"];
  profile: KioskProfile;
}) {
  const disabled = !item.effective_availability;
  const hasModifiers = item.modifier_groups.length > 0;
  const accent = profile.accent_color || profile.primary_color;
  const cashColor = "#16A34A";

  return (
    <div
      className="relative flex aspect-square flex-col overflow-hidden"
      style={{
        borderRadius: 16,
        border: `1px solid ${accent}30`,
        backgroundColor: profile.background_color,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {hasModifiers ? (
        <div
          className="absolute right-0 top-0 z-10 h-0 w-0"
          style={{ borderTop: `22px solid ${accent}`, borderLeft: "22px solid transparent" }}
        />
      ) : null}

      <div
        className="flex min-h-0 flex-1 items-center justify-center overflow-hidden"
        style={{ backgroundColor: `${accent}10` }}
      >
        {item.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.image} alt="" className="h-full w-full object-cover" />
        ) : (
          <ImageIcon style={{ color: `${profile.text_color}55`, width: 40, height: 40 }} />
        )}
      </div>

      <div style={{ height: 1, margin: "0 12px", backgroundColor: `${accent}20`, flexShrink: 0 }} />

      <div className="flex shrink-0 flex-col" style={{ padding: "8px 12px", gap: 4 }}>
        <p
          className="line-clamp-2"
          style={{ fontSize: 15, fontWeight: 600, lineHeight: "19px", color: profile.text_color }}
        >
          {item.name}
        </p>
        <div className="flex items-center justify-between" style={{ marginTop: 2 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: profile.text_color }}>
            ${item.effective_price.toFixed(2)}
          </span>
          {item.effective_cash_price != null ? (
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                borderRadius: 8,
                padding: "2px 6px",
                backgroundColor: `${cashColor}18`,
                border: `1px solid ${cashColor}40`,
                color: cashColor,
              }}
            >
              ${item.effective_cash_price.toFixed(2)}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
