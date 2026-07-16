import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Monitor, Smartphone } from "lucide-react";

import type { KioskProfile } from "@/app/dashboard/actions/kiosk";
import { cn } from "@/lib/utils";
import { PreviewCategoryPillBar, PreviewCategoryRail } from "./PreviewCategoryNav";
import { PreviewMediaCarousel } from "./PreviewMediaCarousel";
import { PreviewMenuItem } from "./PreviewMenuItem";
import { usePreviewMenu, type PreviewSection } from "./usePreviewMenu";

// Reference canvas the preview renders at 1:1 before being scaled down to
// fit — matches a representative kiosk touchscreen resolution per
// orientation (e.g. a 1080x1920 portrait panel, 1920x1080 landscape).
// Every size inside the canvas below is the exact px value from the real
// Dexa-POS kiosk components at ui-scale 1.0 (see components/kiosk/ —
// kioskPx(N, 1) === N), not an approximation, so proportions match the
// device exactly; only the final CSS `transform: scale()` shrinks it to fit
// the editor panel.
const CANVAS = {
  vertical: { width: 1080, height: 1920 },
  horizontal: { width: 1920, height: 1080 },
};

const HEADER_HEIGHT = 88;
const BANNER_HEIGHT = 420;

function idleImages(profile: KioskProfile) {
  return profile.orientation === "vertical" ? profile.idle_images_vertical : profile.idle_images_horizontal;
}

function idleVideo(profile: KioskProfile) {
  return profile.orientation === "vertical" ? profile.idle_video_vertical : profile.idle_video_horizontal;
}

function orderBannerImages(profile: KioskProfile) {
  return profile.orientation === "vertical"
    ? profile.order_banner_images_vertical
    : profile.order_banner_images_horizontal;
}

/** Resolves which (menuId:categoryId) is active, falling back to the first available. */
function useActiveCategory(sections: PreviewSection[]) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const flat = useMemo(
    () => sections.flatMap((s) => s.categories.map((c) => ({ key: `${s.menuId}:${c.id}`, category: c }))),
    [sections],
  );
  const found = flat.find((e) => e.key === activeKey) ?? flat[0];
  return { resolvedKey: found?.key ?? null, activeCategory: found?.category, setActiveKey };
}

/** Shared logo + welcome message + "tap to start" block, exact px values from both real idle components. */
function IdleWelcomeBlock({ profile }: { profile: KioskProfile }) {
  return (
    <div className="flex flex-col items-center" style={{ padding: "0 32px" }}>
      {profile.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={profile.logo_url} alt="" style={{ width: 160, height: 160, marginBottom: 32, objectFit: "contain" }} />
      ) : null}
      <p
        className="text-center"
        style={{ fontSize: 48, lineHeight: "56px", fontWeight: 700, padding: 12, color: profile.header_text_color || profile.text_color }}
      >
        {profile.welcome_message || "Tap to order"}
      </p>
      <div style={{ marginTop: 40, padding: "16px 40px", borderRadius: 999, backgroundColor: profile.primary_color }}>
        <p style={{ fontSize: 20, lineHeight: "28px", fontWeight: 600, color: "#FFFFFF" }}>Tap anywhere to start</p>
      </div>
    </div>
  );
}

/**
 * Web port of KioskAttractScreen (Template A's idle screen) — logo,
 * welcome message, and "tap to start" button on a plain background only.
 * No idle image or carousel here (that's Template B/C's
 * KioskAttractCarouselB) — idle images configured for this profile are
 * unused by Template A.
 */
function PreviewIdleScreenA({ profile }: { profile: KioskProfile }) {
  return (
    <div className="flex h-full flex-col items-center justify-center" style={{ backgroundColor: profile.background_color }}>
      <IdleWelcomeBlock profile={profile} />
    </div>
  );
}

/**
 * Web port of KioskAttractCarouselB — used by both Template B and Template
 * C. Full carousel over all idle images + idle video for the orientation;
 * when a carousel is showing it's media-only (no logo/text overlay). Falls
 * back to the plain logo/welcome block only when there's no idle media at
 * all for this orientation.
 */
function PreviewIdleScreenCarousel({ profile }: { profile: KioskProfile }) {
  const images = idleImages(profile);
  const video = idleVideo(profile);
  const hasCarousel = images.length > 0 || !!video;

  return (
    <div className="relative flex h-full flex-col items-center justify-center" style={{ backgroundColor: profile.background_color }}>
      {hasCarousel ? (
        <PreviewMediaCarousel imageUrls={images} videoUrl={video} className="absolute inset-0" />
      ) : (
        <IdleWelcomeBlock profile={profile} />
      )}
    </div>
  );
}

function PreviewIdleScreen({ profile }: { profile: KioskProfile }) {
  return profile.template_id === "template_b" || profile.template_id === "template_c" ? (
    <PreviewIdleScreenCarousel profile={profile} />
  ) : (
    <PreviewIdleScreenA profile={profile} />
  );
}

function EmptyMenuNotice({ profile }: { profile: KioskProfile }) {
  return (
    <div className="flex flex-1 items-center justify-center text-center" style={{ padding: 40 }}>
      <p style={{ fontSize: 18, color: `${profile.text_color}99` }}>
        No menu items to preview yet. Items you publish to this location will appear here.
      </p>
    </div>
  );
}

const bannerCardStyle = {
  borderRadius: 24,
  overflow: "hidden" as const,
  boxShadow: "0 6px 16px rgba(0,0,0,0.15)",
};

/** Web port of KioskMenuView (Template A) — category rail + item grid, no banner. Grid gap/padding = 12/16 (kioskPx). */
function PreviewTemplateA({ profile, sections }: { profile: KioskProfile; sections: PreviewSection[] }) {
  const { resolvedKey, activeCategory, setActiveKey } = useActiveCategory(sections);
  const isVertical = profile.orientation === "vertical";
  const items = activeCategory?.items ?? [];
  const numColumns = isVertical ? 3 : 4;

  return (
    <div className="flex h-full">
      <div style={{ width: isVertical ? "33.3333%" : "25%" }}>
        <PreviewCategoryRail profile={profile} sections={sections} resolvedKey={resolvedKey} onSelect={setActiveKey} />
      </div>
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <EmptyMenuNotice profile={profile} />
        ) : (
          <div className="grid" style={{ gridTemplateColumns: `repeat(${numColumns}, minmax(0, 1fr))`, gap: 12, padding: 16 }}>
            {items.map((entry) => (
              <PreviewMenuItem key={entry.id} item={entry.menu_item} profile={profile} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Web port of KioskMenuViewB — banner (vertical only, 420px tall) + category rail + item grid. */
function PreviewTemplateB({ profile, sections }: { profile: KioskProfile; sections: PreviewSection[] }) {
  const { resolvedKey, activeCategory, setActiveKey } = useActiveCategory(sections);
  const isVertical = profile.orientation === "vertical";
  const items = activeCategory?.items ?? [];
  const numColumns = isVertical ? 3 : 4;
  const bannerImages = orderBannerImages(profile);
  const hasMedia = bannerImages.length > 0 && isVertical;

  return (
    <div className="flex h-full flex-col">
      {hasMedia ? (
        <div style={{ ...bannerCardStyle, height: BANNER_HEIGHT, margin: "16px 16px 8px" }}>
          <PreviewMediaCarousel imageUrls={bannerImages} videoUrl={null} className="h-full w-full" />
        </div>
      ) : null}
      <div className="flex flex-1 overflow-hidden">
        <div style={{ width: isVertical ? "33.3333%" : "25%" }}>
          <PreviewCategoryRail profile={profile} sections={sections} resolvedKey={resolvedKey} onSelect={setActiveKey} />
        </div>
        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <EmptyMenuNotice profile={profile} />
          ) : (
            <div className="grid" style={{ gridTemplateColumns: `repeat(${numColumns}, minmax(0, 1fr))`, gap: 12, padding: 16 }}>
              {items.map((entry) => (
                <PreviewMenuItem key={entry.id} item={entry.menu_item} profile={profile} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Web port of KioskMenuViewC — banner on top (vertical, 420px) or left sidebar (horizontal, 28% width) + pill bar + grid. */
function PreviewTemplateC({ profile, sections }: { profile: KioskProfile; sections: PreviewSection[] }) {
  const { resolvedKey, activeCategory, setActiveKey } = useActiveCategory(sections);
  const isVertical = profile.orientation === "vertical";
  const items = activeCategory?.items ?? [];
  const bannerImages = orderBannerImages(profile);
  const hasMedia = bannerImages.length > 0;
  const numColumns = 4;

  const menuContent = (
    <div className="flex h-full flex-col overflow-hidden">
      <PreviewCategoryPillBar profile={profile} sections={sections} resolvedKey={resolvedKey} onSelect={setActiveKey} />
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <EmptyMenuNotice profile={profile} />
        ) : (
          <div className="grid" style={{ gridTemplateColumns: `repeat(${numColumns}, minmax(0, 1fr))`, gap: 12, padding: 16 }}>
            {items.map((entry) => (
              <PreviewMenuItem key={entry.id} item={entry.menu_item} profile={profile} />
            ))}
          </div>
        )}
      </div>
    </div>
  );

  if (!isVertical) {
    return (
      <div className="flex h-full">
        {hasMedia ? (
          <div style={{ ...bannerCardStyle, width: "28%", margin: "16px 8px 16px 16px" }}>
            <PreviewMediaCarousel imageUrls={bannerImages} videoUrl={null} className="h-full w-full" />
          </div>
        ) : null}
        <div className="flex-1 overflow-hidden">{menuContent}</div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {hasMedia ? (
        <div style={{ ...bannerCardStyle, height: BANNER_HEIGHT, margin: "16px 16px 8px" }}>
          <PreviewMediaCarousel imageUrls={bannerImages} videoUrl={null} className="h-full w-full" />
        </div>
      ) : null}
      <div className="flex-1 overflow-hidden">{menuContent}</div>
    </div>
  );
}

/** Web port of KioskHeader — height 88, logo 48x140, order-type pill text 15px, cancel pill text 15px. */
function PreviewHeader({ profile }: { profile: KioskProfile }) {
  return (
    <div
      className="flex shrink-0 items-center justify-between"
      style={{ height: HEADER_HEIGHT, padding: "0 24px", backgroundColor: profile.primary_color }}
    >
      <div className="flex min-w-0 flex-1 items-center justify-start">
        {profile.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.logo_url} alt="" style={{ height: 48, width: 140, objectFit: "contain", objectPosition: "left" }} />
        ) : (
          <p className="truncate" style={{ fontSize: 22, fontWeight: 700, color: "#FFFFFF" }}>
            {profile.profile_name}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center" style={{ backgroundColor: "rgba(255,255,255,0.18)", borderRadius: 999, padding: 4 }}>
        <div style={{ padding: "11px 22px", borderRadius: 999, backgroundColor: "#FFFFFF" }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: profile.primary_color }}>Dine In</span>
        </div>
        <div style={{ padding: "11px 22px" }}>
          <span style={{ fontSize: 15, fontWeight: 500, color: "rgba(255,255,255,0.9)" }}>Takeaway</span>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-end">
        <div
          style={{
            padding: "10px 18px",
            borderRadius: 999,
            backgroundColor: "rgba(255,255,255,0.14)",
            border: "1.5px solid rgba(255,255,255,0.6)",
          }}
        >
          <span style={{ fontSize: 15, fontWeight: 600, color: "#FFFFFF" }}>Cancel</span>
        </div>
      </div>
    </div>
  );
}

const TEMPLATES: Record<string, typeof PreviewTemplateA> = {
  template_a: PreviewTemplateA,
  template_b: PreviewTemplateB,
  template_c: PreviewTemplateC,
};

/**
 * Fits `canvas` inside the observed container by uniform scale (never
 * upscales past 1). `scale` starts at `null` (not 1) so the canvas stays
 * hidden until the first real measurement lands — at scale 1 a 1080x1920
 * canvas is far taller than the ~780px frame, so without this guard the
 * unscaled canvas briefly renders and gets clipped to whatever happens to
 * sit in its top-left corner before ResizeObserver's first callback fires.
 */
function useFitScale(canvas: { width: number; height: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const applyScale = (width: number, height: number) => {
      if (width <= 0 || height <= 0) return;
      setScale(Math.min(width / canvas.width, height / canvas.height, 1));
    };

    const rect = el.getBoundingClientRect();
    applyScale(rect.width, rect.height);

    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      applyScale(width, height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [canvas.width, canvas.height]);

  return { containerRef, scale: scale ?? 0 };
}

/**
 * Accurate kiosk preview, built as a faithful web port of the real Dexa-POS
 * kiosk screens (see components/kiosk/ in the tablet app) — every size
 * inside the canvas is the component's real px value at ui-scale 1.0, laid
 * out on a reference kiosk-resolution canvas (1080x1920 portrait /
 * 1920x1080 landscape) and uniformly scaled down to fit, so proportions —
 * header height vs. banner height vs. card size vs. font size — match the
 * device exactly rather than being fit into an arbitrarily-sized box.
 */
export function KioskPreview({ profile }: { profile: KioskProfile }) {
  const [screen, setScreen] = useState<"idle" | "menu">("idle");
  const { sections, isLoading } = usePreviewMenu(profile.location_id);
  const isVertical = profile.orientation === "vertical";
  const Template = TEMPLATES[profile.template_id] ?? PreviewTemplateA;
  const canvas = isVertical ? CANVAS.vertical : CANVAS.horizontal;
  const { containerRef, scale } = useFitScale(canvas);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex items-center gap-1 rounded-full border bg-muted/40 p-1 text-sm">
        <button
          type="button"
          onClick={() => setScreen("idle")}
          className={cn("rounded-full px-3.5 py-1.5 font-medium transition-colors", screen === "idle" ? "bg-background shadow-sm" : "text-muted-foreground")}
        >
          Idle screen
        </button>
        <button
          type="button"
          onClick={() => setScreen("menu")}
          className={cn("rounded-full px-3.5 py-1.5 font-medium transition-colors", screen === "menu" ? "bg-background shadow-sm" : "text-muted-foreground")}
        >
          Menu
        </button>
      </div>

      <div
        ref={containerRef}
        className="flex w-full items-center justify-center overflow-hidden rounded-[28px] border-8 border-zinc-900 bg-background shadow-xl"
        style={{
          height: isVertical ? 780 : 460,
          maxWidth: isVertical ? 440 : 820,
        }}
      >
        <div
          style={{
            width: canvas.width,
            height: canvas.height,
            transform: `scale(${scale})`,
            transformOrigin: "center",
            flexShrink: 0,
          }}
        >
          <div className="flex h-full flex-col overflow-hidden" style={{ fontFamily: profile.font_family || "Inter, sans-serif" }}>
            {screen === "idle" ? (
              <PreviewIdleScreen profile={profile} />
            ) : (
              <>
                <PreviewHeader profile={profile} />
                <div className="flex-1 overflow-hidden" style={{ backgroundColor: profile.background_color }}>
                  {isLoading ? (
                    <div className="flex h-full items-center justify-center">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : sections.length === 0 ? (
                    <EmptyMenuNotice profile={profile} />
                  ) : (
                    <Template profile={profile} sections={sections} />
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {isVertical ? <Smartphone className="h-3.5 w-3.5" /> : <Monitor className="h-3.5 w-3.5" />}
        {isVertical ? "Vertical" : "Horizontal"} kiosk · {profile.template_id.replace("template_", "Template ").toUpperCase()}
      </div>
    </div>
  );
}
