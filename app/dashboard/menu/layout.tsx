"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const sections = [
  { label: "Menus", href: "/dashboard/menu" },
  { label: "Items", href: "/dashboard/menu/items" },
  { label: "Categories", href: "/dashboard/menu/categories" },
  { label: "Out of stock", href: "/dashboard/menu/out-of-stock" },
  { label: "Availability", href: "/dashboard/menu/availability" },
] as const;

export default function MenuLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Modifiers remains a separate sidebar destination for this navigation pass.
  const isMenuDetail = /^\/dashboard\/menu\/[0-9a-f-]{36}$/i.test(pathname);
  if (pathname.startsWith("/dashboard/menu/modifiers") || isMenuDetail) {
    return children;
  }

  const activeSection = sections
    .slice(1)
    .find(({ href }) => pathname === href || pathname.startsWith(`${href}/`))?.href
    ?? sections[0].href;

  return (
    <div className="min-w-0">
      <nav
        aria-label="Menu sections"
        className="-mx-4 mb-6 border-b border-border/70 px-4 sm:-mx-6 sm:px-6"
      >
        <div className="scrollbar-none flex min-w-0 gap-1 overflow-x-auto">
          {sections.map(({ label, href }) => {
            const isActive = activeSection === href;

            return (
              <Link
                key={href}
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "inline-flex h-12 shrink-0 items-center border-b-2 px-4 text-sm font-medium transition-colors",
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
                )}
              >
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
      {children}
    </div>
  );
}
