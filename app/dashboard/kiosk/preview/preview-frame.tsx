"use client";

import { useEffect, useState } from "react";

type PreviewProfile = {
  profile_name: string;
  template_id: "template_a" | "template_b" | "template_c";
  primary_color: string;
  secondary_color: string | null;
  accent_color: string | null;
  background_color: string;
  text_color: string;
  header_text_color: string | null;
  font_family: string | null;
  logo_url: string | null;
  hero_image_url: string | null;
  welcome_message: string | null;
  orientation: "vertical" | "horizontal";
  is_active: boolean;
  show_calorie_info: boolean;
  show_allergens: boolean;
  tip_screen_enabled: boolean;
};

const fallbackProfile: PreviewProfile = {
  profile_name: "Default Kiosk",
  template_id: "template_a",
  primary_color: "#0C4FD1",
  secondary_color: "#E5E7EB",
  accent_color: "#16A34A",
  background_color: "#FFFFFF",
  text_color: "#0A0A0A",
  header_text_color: "#FFFFFF",
  font_family: "Inter",
  logo_url: null,
  hero_image_url: null,
  welcome_message: "Tap to order",
  orientation: "vertical",
  is_active: false,
  show_calorie_info: false,
  show_allergens: true,
  tip_screen_enabled: true,
};

const menu = [
  { name: "Matcha Latte", price: "$5.50", tag: "Popular", calories: "180 cal" },
  { name: "Brown Sugar Milk", price: "$6.25", tag: "New", calories: "240 cal" },
  { name: "Jasmine Green Tea", price: "$4.75", tag: "Light", calories: "80 cal" },
];

function isProfile(value: unknown): value is PreviewProfile {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.profile_name === "string" && typeof record.primary_color === "string";
}

export function KioskPreviewFrame() {
  const [profile, setProfile] = useState<PreviewProfile>(fallbackProfile);

  useEffect(() => {
    function handleMessage(event: MessageEvent<unknown>) {
      if (event.origin !== window.location.origin) return;
      const payload = event.data as { type?: unknown; profile?: unknown };
      if (payload.type === "kiosk-preview:update" && isProfile(payload.profile)) {
        setProfile({ ...fallbackProfile, ...payload.profile });
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  if (!profile.is_active) {
    return (
      <main
        className="flex h-screen items-center justify-center p-8 text-center"
        style={{ background: profile.background_color, color: profile.text_color }}
      >
        <div className="w-full max-w-sm rounded-2xl border bg-white p-8 shadow-sm">
          <div
            className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl text-2xl font-bold text-white"
            style={{ background: profile.primary_color }}
          >
            {profile.logo_url ? <img src={profile.logo_url} alt="" className="h-12 w-12 object-contain" /> : "D"}
          </div>
          <p className="mt-6 text-sm font-semibold uppercase tracking-widest opacity-60">Kiosk preview</p>
          <h1 className="mt-2 text-3xl font-bold">Out of service</h1>
          <p className="mt-3 text-base opacity-70">Activate and publish when this kiosk is ready.</p>
        </div>
      </main>
    );
  }

  const isCompact = profile.orientation === "vertical";

  return (
    <main
      className="h-screen overflow-hidden"
      style={{
        background: profile.background_color,
        color: profile.text_color,
        fontFamily: profile.font_family || "Inter, sans-serif",
      }}
    >
      <section
        className={isCompact ? "relative overflow-hidden p-5" : "relative overflow-hidden px-8 py-6"}
        style={{ background: profile.primary_color, color: profile.header_text_color || "#FFFFFF" }}
      >
        {profile.hero_image_url ? (
          <img src={profile.hero_image_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" />
        ) : null}
        <div className="relative z-10 flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
          {profile.logo_url ? (
            <img src={profile.logo_url} alt="" className="h-12 w-12 rounded-xl bg-white object-contain p-1.5 shadow-sm" />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 font-bold">D</div>
          )}
          <div className="min-w-0">
            <p className="text-sm opacity-80">{profile.profile_name}</p>
            <h1 className={isCompact ? "text-2xl font-bold" : "text-4xl font-bold"}>{profile.welcome_message || "Tap to order"}</h1>
          </div>
          </div>
          <div className="hidden rounded-full bg-white/15 px-4 py-2 text-sm font-medium sm:block">Order here</div>
        </div>
      </section>

      <section className={isCompact ? "space-y-4 p-4 pb-28" : "grid grid-cols-[170px_1fr] gap-5 p-6 pb-28"}>
        <aside className={isCompact ? "flex gap-2 overflow-x-auto pb-1" : "space-y-2"}>
          {["Milk Tea", "Coffee", "Bakery", "Fruit"].map((category, index) => (
            <button
              key={category}
              className="shrink-0 rounded-full border px-4 py-2 text-sm font-semibold shadow-sm"
              style={{
                background: index === 0 ? profile.accent_color || profile.primary_color : "transparent",
                color: index === 0 ? "#FFFFFF" : profile.text_color,
              }}
            >
              {category}
            </button>
          ))}
        </aside>
        <div className={isCompact ? "grid gap-3" : "grid grid-cols-3 gap-4"}>
          {menu.map((item) => (
            <article key={item.name} className="overflow-hidden rounded-2xl border bg-white shadow-sm">
              <div className={isCompact ? "h-28" : "h-32"} style={{ background: profile.secondary_color || "#F3F4F6" }} />
              <div className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{item.name}</h2>
                  <p className="mt-1 text-sm opacity-70">
                    {profile.show_calorie_info ? item.calories : item.tag}
                    {profile.show_allergens ? " · Allergens" : ""}
                  </p>
                </div>
                <p className="font-semibold">{item.price}</p>
              </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <footer className="fixed inset-x-0 bottom-0 border-t bg-white/95 p-4 shadow-[0_-12px_30px_rgba(15,23,42,0.08)]">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <div>
            <span className="text-sm font-semibold">2 items</span>
            <p className="text-xs opacity-60">Ready to checkout</p>
          </div>
          <button className="rounded-xl px-6 py-3 text-sm font-semibold text-white shadow-sm" style={{ background: profile.primary_color }}>
            Checkout {profile.tip_screen_enabled ? "with tips" : ""}
          </button>
        </div>
      </footer>
    </main>
  );
}
