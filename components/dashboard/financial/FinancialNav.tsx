"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { financialSections, getFinancialSection } from "@/lib/navigation/financial";

export function FinancialNav({ pathname }: { pathname: string }) {
  const activeHref = getFinancialSection(pathname)?.href;
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    navRef.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [activeHref]);

  return (
    <nav
      ref={navRef}
      aria-label="Financial sections"
      className="-mx-4 mb-6 border-b border-border/70 px-4 sm:-mx-6 sm:px-6"
    >
      <div className="scrollbar-none flex min-w-0 gap-1 overflow-x-auto">
        {financialSections.map(({ label, href }) => {
          const isActive = activeHref === href;

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
  );
}
