"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { getTeamSection, teamSections } from "@/lib/navigation/team";

export function TeamNav({ pathname }: { pathname: string }) {
  const activeHref = getTeamSection(pathname)?.href;

  return (
    <nav aria-label="Team sections" className="-mx-4 mb-6 border-b border-border/70 px-4 sm:-mx-6 sm:px-6">
      <div className="scrollbar-none flex min-w-0 gap-1 overflow-x-auto">
        {teamSections.map(({ label, href }) => (
          <Link
            key={href}
            href={href}
            aria-current={activeHref === href ? "page" : undefined}
            className={cn(
              "inline-flex h-12 shrink-0 items-center border-b-2 px-4 text-sm font-medium transition-colors",
              activeHref === href
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
            )}
          >
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
