import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260806160000_support_ticket_email_assignment_consistency.sql",
  ),
  "utf8",
);

describe("support ticket email assignment consistency", () => {
  it("counts a ticket as unassigned only when both assignment models are empty", () => {
    expect(migration).toContain("assigned_to IS NULL");
    expect(migration).toContain(
      "cardinality(coalesce(assigned_to_emails, '{}'::text[])) = 0",
    );
  });

  it("pins the function search path and restricts direct execution", () => {
    expect(migration).toContain("SET search_path = public, pg_temp");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("TO service_role");
  });
});
