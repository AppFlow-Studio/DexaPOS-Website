import { describe, expect, it } from "vitest";
import { getTeamSection, isTeamWorkspacePath } from "../team";

describe("team workspace routes", () => {
  it.each([
    ["/dashboard/staff", "People"],
    ["/dashboard/schedules", "Scheduling"],
    ["/dashboard/schedules/templates", "Scheduling"],
    ["/dashboard/staff/timesheets", "Timesheets"],
  ])("selects %s", (pathname, label) => {
    expect(getTeamSection(pathname)?.label).toBe(label);
    expect(isTeamWorkspacePath(pathname)).toBe(true);
  });

  it("leaves unrelated routes outside Team", () => {
    expect(isTeamWorkspacePath("/dashboard/settings/staff")).toBe(false);
  });
});
