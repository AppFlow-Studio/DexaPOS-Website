"use client";

import { WorkspaceNav } from "@/components/dashboard/shell/WorkspaceNav";
import { getTeamSection, teamSections } from "@/lib/navigation/team";

export function TeamNav({ pathname }: { pathname: string }) {
  return (
    <WorkspaceNav
      label="Team sections"
      sections={teamSections}
      activeHref={getTeamSection(pathname)?.href}
    />
  );
}
