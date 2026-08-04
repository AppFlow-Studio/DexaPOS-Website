import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260729140000_hq_support_ticket_email_assignees.sql",
  ),
  "utf8",
);

describe("support ticket email assignee migration", () => {
  it("adds a first-class multi-assignee column", () => {
    expect(migration).toContain(
      "assigned_to_emails text[] NOT NULL",
    );
    expect(migration).toContain("cardinality(assigned_to_emails) <= 50");
  });

  it("promotes RPC metadata into the column in the insert transaction", () => {
    expect(migration).toContain("BEFORE INSERT ON public.support_tickets");
    expect(migration).toContain(
      "assignee_payload := NEW.metadata->'assigned_to_emails'",
    );
    expect(migration).toContain(
      "NEW.assigned_to_emails := normalized_assignees",
    );
    expect(migration).toContain(
      "NEW.metadata := NEW.metadata - 'assigned_to_emails'",
    );
  });

  it("rejects invalid, duplicate, or oversized selections", () => {
    expect(migration).toContain(
      "Support ticket assignees contain invalid or duplicate emails",
    );
    expect(migration).toContain(
      "A maximum of 50 support ticket assignees is allowed",
    );
  });
});
