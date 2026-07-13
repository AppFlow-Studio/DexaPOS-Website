/**
 * Flat navigation search index for the GlobalSearch command palette.
 *
 * This is the single source of truth for fuzzy navigation search. It is a
 * flattened, machine-readable view of the sidebar structure defined in
 * app/dashboard/layout.tsx (`navMain`, `navFooter`, and the Settings submenu).
 * The sidebar JSX itself isn't practical to parse at runtime, so we maintain
 * this flat list alongside it — keep them in sync when adding nav entries.
 *
 * `keywords` are extra aliases/synonyms fed to the fuzzy matcher so users can
 * find a page by a name other than its label (e.g. "till" -> Cash Drawers).
 */

import {
  LayoutDashboard,
  MapPin,
  ShoppingCart,
  Coffee,
  CalendarClock,
  Utensils,
  List,
  Tag,
  Banknote,
  Layers,
  Users,
  Calendar,
  Globe,
  User,
  Package,
  FileText,
  Monitor,
  GitCompare,
  BarChart3,
  Receipt,
  CreditCard,
  DollarSign,
  ShieldAlert,
  Settings,
  MessageCircle,
  Flame,
  MonitorPlay,
  Gift,
  Settings2,
  type LucideIcon,
} from "lucide-react";

export interface NavSearchItem {
  /** Display label shown as the primary text in a result row. */
  label: string;
  /** Route pushed via the Next router on select. */
  path: string;
  /** Parent section, shown as the muted secondary context line. */
  section: string;
  /** Leading icon. */
  icon: LucideIcon;
  /** Extra search aliases/synonyms (not displayed). */
  keywords?: string[];
}

export const NAV_INDEX: NavSearchItem[] = [
  // ── Operations ──────────────────────────────────────────────────────────
  { label: "Dashboard", path: "/dashboard", section: "Operations", icon: LayoutDashboard, keywords: ["home", "overview"] },
  { label: "Locations", path: "/dashboard/locations", section: "Operations", icon: MapPin, keywords: ["stores", "branches", "sites"] },
  { label: "Orders", path: "/dashboard/orders", section: "Operations", icon: ShoppingCart, keywords: ["tickets", "checks"] },
  { label: "Orders Analytics", path: "/dashboard/orders/analytics", section: "Orders", icon: BarChart3, keywords: ["order stats", "order metrics"] },
  { label: "Orders Reports", path: "/dashboard/orders/reports", section: "Orders", icon: FileText },
  { label: "Tables", path: "/dashboard/tables", section: "Operations", icon: Coffee, keywords: ["floor plan", "seating"] },
  { label: "Service Charge", path: "/dashboard/tables/service-charge", section: "Tables", icon: Coffee, keywords: ["gratuity", "auto gratuity"] },
  { label: "Reservations", path: "/dashboard/reservations", section: "Operations", icon: CalendarClock, keywords: ["bookings"] },

  // ── Menus & Products ────────────────────────────────────────────────────
  { label: "Menus", path: "/dashboard/menu", section: "Menus & Products", icon: Utensils },
  { label: "Items", path: "/dashboard/menu/items", section: "Menus & Products", icon: List, keywords: ["menu items", "products", "dishes"] },
  { label: "Categories", path: "/dashboard/menu/categories", section: "Menus & Products", icon: Tag, keywords: ["menu categories"] },
  { label: "Discounts", path: "/dashboard/discounts", section: "Menus & Products", icon: Banknote, keywords: ["promotions", "coupons", "deals"] },
  { label: "Modifiers", path: "/dashboard/menu/modifiers", section: "Menus & Products", icon: Layers, keywords: ["add ons", "options", "extras"] },

  // ── Management ──────────────────────────────────────────────────────────
  { label: "Staff", path: "/dashboard/staff", section: "Management", icon: Users, keywords: ["employees", "team", "users"] },
  { label: "Schedules", path: "/dashboard/schedules", section: "Management", icon: Calendar, keywords: ["shifts", "rota"] },
  { label: "Online Ordering", path: "/dashboard/online-ordering", section: "Management", icon: Globe, keywords: ["web ordering", "storefront", "ecommerce"] },
  { label: "Customers", path: "/dashboard/customers", section: "Management", icon: User, keywords: ["guests", "clients", "patrons"] },
  { label: "Inventory", path: "/dashboard/inventory", section: "Management", icon: Package, keywords: ["stock", "supplies"] },
  { label: "Subscriptions", path: "/dashboard/subscriptions", section: "Management", icon: FileText, keywords: ["billing plans", "plans"] },
  { label: "Devices", path: "/dashboard/devices", section: "Management", icon: Monitor, keywords: ["terminals", "tablets", "hardware"] },
  { label: "Cash Drawers", path: "/dashboard/cash-drawers", section: "Management", icon: Banknote, keywords: ["till", "register", "draw"] },
  { label: "Audit Logs", path: "/dashboard/audit-logs", section: "Management", icon: GitCompare, keywords: ["history", "activity log"] },
  { label: "Reports", path: "/dashboard/reports", section: "Management", icon: BarChart3, keywords: ["analytics", "stats"] },
  { label: "Financial Information", path: "/dashboard/reports/financials", section: "Reports", icon: BarChart3, keywords: ["financials", "revenue report"] },
  { label: "Compare Locations", path: "/dashboard/reports/comparison", section: "Reports", icon: BarChart3 },
  { label: "Sales By Items", path: "/dashboard/reports/sales-by-items", section: "Reports", icon: BarChart3 },
  { label: "Cash Management", path: "/dashboard/reports/cash-management", section: "Reports", icon: BarChart3 },
  { label: "Voids & Refunds", path: "/dashboard/reports/voids", section: "Reports", icon: BarChart3, keywords: ["refunds", "voids"] },
  { label: "Online Ordering Report", path: "/dashboard/reports/online-ordering", section: "Reports", icon: BarChart3 },
  { label: "Cash Drawers Report", path: "/dashboard/reports/cash-drawers", section: "Reports", icon: BarChart3 },
  { label: "Tax Report", path: "/dashboard/reports/tax", section: "Reports", icon: BarChart3 },
  { label: "Kitchen Performance", path: "/dashboard/reports/kitchen-performance", section: "Reports", icon: BarChart3 },
  { label: "Discrepancy", path: "/dashboard/reports/discrepancy", section: "Reports", icon: BarChart3 },

  // ── Financial ───────────────────────────────────────────────────────────
  { label: "Transactions", path: "/dashboard/transactions", section: "Financial", icon: Receipt, keywords: ["payments history"] },
  { label: "Invoices", path: "/dashboard/invoices", section: "Financial", icon: FileText, keywords: ["bills"] },
  { label: "Payments", path: "/dashboard/payments", section: "Financial", icon: CreditCard, keywords: ["card payments", "settlements"] },
  { label: "Tips", path: "/dashboard/tips", section: "Financial", icon: DollarSign, keywords: ["gratuity"] },
  { label: "Tip Distribution", path: "/dashboard/tips", section: "Tips", icon: DollarSign, keywords: ["tip pooling", "tip out"] },
  { label: "My Tips", path: "/dashboard/tips/my-tips", section: "Tips", icon: DollarSign },
  { label: "TSYS Disputes", path: "/dashboard/payments/disputes", section: "Financial", icon: ShieldAlert, keywords: ["chargebacks", "disputes"] },

  // ── Settings (footer submenu) ───────────────────────────────────────────
  { label: "Settings", path: "/dashboard/settings", section: "Settings", icon: Settings, keywords: ["preferences", "configuration", "general"] },
  { label: "Stations", path: "/dashboard/settings/stations", section: "Settings", icon: Monitor },
  { label: "POS Settings", path: "/dashboard/settings/pos", section: "Settings", icon: Settings2, keywords: ["runtime settings", "pos config", "printing settings", "split payments"] },
  { label: "Prep Stations", path: "/dashboard/settings/prep-stations", section: "Settings", icon: Flame, keywords: ["kitchen stations", "expo"] },
  { label: "Customer Display", path: "/dashboard/settings/customer-display", section: "Settings", icon: MonitorPlay, keywords: ["cfd", "customer facing display"] },
  { label: "Receipt Templates", path: "/dashboard/settings/receipt-templates", section: "Settings", icon: Receipt },
  { label: "Tip Configuration", path: "/dashboard/settings/tips", section: "Settings", icon: DollarSign },
  { label: "Loyalty", path: "/dashboard/settings/loyalty", section: "Settings", icon: Gift, keywords: ["rewards", "points"] },

  // ── Help (footer) ───────────────────────────────────────────────────────
  { label: "Get Help", path: "/dashboard/support", section: "Help", icon: MessageCircle, keywords: ["support", "contact", "tickets"] },
];

/** Default recent items shown on first open before any nav history exists. */
export const DEFAULT_RECENT_PATHS = [
  "/dashboard",
  "/dashboard/orders",
  "/dashboard/menu",
  "/dashboard/staff",
];
