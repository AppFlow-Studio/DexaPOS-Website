import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260729130000_support_ticket_thread_notifications.sql",
  ),
  "utf8",
);

describe("support ticket thread notification migration", () => {
  it("queues notifications for every inserted support ticket message", () => {
    expect(migration).toContain(
      "AFTER INSERT ON public.support_ticket_messages",
    );
    expect(migration).toContain("'message_id', NEW.id");
    expect(migration).toContain("'ticket_id', NEW.ticket_id");
  });

  it("suppresses only the initial ticket description notification", () => {
    expect(migration).toContain(
      "btrim(st.description) = btrim(NEW.message)",
    );
    expect(migration).toContain("existing.id <> NEW.id");
    expect(migration).toContain("IF is_initial_description THEN");
  });

  it("reuses the protected notification endpoint configuration", () => {
    expect(migration).toContain(
      "WHERE ds.name = 'support_ticket_notify_url'",
    );
    expect(migration).toContain(
      "WHERE ds.name = 'internal_notification_secret'",
    );
    expect(migration).toContain("'x-internal-secret', notify_secret");
  });

  it("keeps the delivery ledger private and idempotent per message", () => {
    expect(migration).toMatch(/message_id uuid NOT NULL UNIQUE/);
    expect(migration).toContain(
      "REVOKE ALL ON TABLE public.support_ticket_message_notification_deliveries",
    );
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("TO service_role");
  });
});
