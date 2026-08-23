"use client";

import {
  CalendarDays,
  CalendarHeart,
  ClipboardList,
  FileText,
  Image as ImageIcon,
  Images,
  LayoutGrid,
  MapPin,
  Megaphone,
  MessageCircleQuestion,
  PanelBottom,
  PanelTop,
  Play,
  Plug,
  Sparkles,
  Star,
  Text,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { createElement } from "react";

/**
 * Turns a registry `icon` string into a rendered glyph.
 *
 * `SECTION_REGISTRY` stores icons as lucide *names* rather than components so it
 * stays React-free and importable by pure logic, tests, and a future AI
 * generator (see the file header there). Resolving them is therefore the UI's
 * job, and it is an allowlist rather than a dynamic import on purpose: a typo in
 * a registry entry falls back to a neutral glyph instead of crashing the panel,
 * and no section kind can pull an arbitrary module into the client bundle.
 *
 * Exported as a *component* rather than as a `sectionIcon(name): LucideIcon`
 * lookup so call sites never bind a component to a local variable during render
 * — the shape `react-hooks/static-components` rejects. `createElement` keeps the
 * dispatch in one place instead of pushing that constraint onto every caller.
 */
const ICONS: Record<string, LucideIcon> = {
  PanelTop,
  PanelBottom,
  Image: ImageIcon,
  Images,
  Text,
  UtensilsCrossed,
  Sparkles,
  MessageCircleQuestion,
  MapPin,
  Plug,
  // Every kind added after the allowlist was written named an icon that was
  // never added here, so six sections had been quietly drawing the fallback
  // square in the Add Section modal — the failure mode the fallback exists to
  // survive, working exactly as designed and hiding the omission perfectly.
  // `featured-event.test.tsx` now asserts the two lists agree.
  CalendarDays,
  CalendarHeart,
  ClipboardList,
  FileText,
  Megaphone,
  Play,
  Star,
  // Named outright by `cards`, not only used as the fallback below. Relying on
  // the fallback to render it would make the entry indistinguishable from a
  // typo.
  LayoutGrid,
};

export function SectionIcon({ name, className }: { name: string; className?: string }) {
  return createElement(ICONS[name] ?? LayoutGrid, { className });
}
