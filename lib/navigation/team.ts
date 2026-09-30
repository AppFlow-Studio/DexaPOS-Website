export const teamSections = [
  { label: "People", href: "/dashboard/staff" },
  { label: "Scheduling", href: "/dashboard/schedules" },
  { label: "Timesheets", href: "/dashboard/staff/timesheets" },
] as const;

export function getTeamSection(pathname: string) {
  if (pathname === "/dashboard/staff/timesheets" || pathname.startsWith("/dashboard/staff/timesheets/")) {
    return teamSections[2];
  }
  if (pathname === "/dashboard/staff" || pathname.startsWith("/dashboard/staff/")) {
    return teamSections[0];
  }
  if (pathname === "/dashboard/schedules" || pathname.startsWith("/dashboard/schedules/")) {
    return teamSections[1];
  }
  return null;
}

export function isTeamWorkspacePath(pathname: string) {
  return getTeamSection(pathname) !== null;
}
