import type { KioskProfile } from "@/app/dashboard/actions/kiosk";
import type { PreviewSection } from "./usePreviewMenu";

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
 * 24/14, pill label 16px).
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
  const pills = sections.flatMap((section) =>
    section.categories.map((category) => ({
      key: `${section.menuId}:${category.id}`,
      name: category.category.name,
    })),
  );

  return (
    <div
      className="flex shrink-0 items-center overflow-x-auto"
      style={{ padding: "12px 16px" }}
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
  );
}
