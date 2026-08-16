/**
 * A small in-memory stand-in for the Supabase client, for testing the website
 * builder's server actions.
 *
 * **Why a fake store rather than scripted return values.** The behaviours worth
 * covering here are stateful and multi-step: publishing twice must be a no-op
 * the second time, publishing three times must number the versions 1, 2, 3, and
 * a publish must supersede exactly the row that was live. Scripting each query's
 * response in order would encode the answers into the test — it would pass
 * against an implementation that did the wrong thing in the right sequence. A
 * store that actually holds rows lets the action's own logic decide, including
 * the real SHA-256 content hash, which is the thing the no-op path turns on.
 *
 * It models only what these actions touch, plus the two database behaviours
 * they depend on and cannot see:
 *
 *  - the `revision` trigger, which bumps only when `draft_content` changes
 *    (autosave's optimistic concurrency is built on exactly that asymmetry)
 *  - `UNIQUE (page_id, version_number)` on `site_page_versions`, reported as
 *    Postgres error `23505` the way a real concurrent publish would
 *
 * Both are asserted against the live database by
 * `scripts/verify-site-tenancy.ts`; this file is where they are cheap to
 * regress against. Tenancy is deliberately NOT modelled — RLS is the database's
 * job and a fake that pretended to enforce it would be inventing assurance.
 */

export interface FakeRow {
  [column: string]: unknown;
}

export interface FakeTables {
  [table: string]: FakeRow[];
}

interface QueryError {
  message: string;
  code?: string;
}

interface QueryResult {
  data: unknown;
  error: QueryError | null;
  count?: number;
}

type Operation = "select" | "insert" | "update" | "delete";

export interface RecordedCall {
  table: string;
  op: Operation;
  filters: [string, unknown][];
  /** `.neq()` filters, kept apart so `matches` can apply them as exclusions. */
  exclusions: [string, unknown][];
  payload?: FakeRow;
}

export interface FakeSupabaseOptions {
  /**
   * Runs immediately before an insert is applied, with the store mutable.
   *
   * The seam for simulating a concurrent writer: a test can slip a competing
   * row in after the action has read the current maximum version number and
   * before it inserts its own, which is the only way to reach the 23505 branch
   * without racing real timers.
   */
  beforeInsert?: (call: RecordedCall, tables: FakeTables) => void;
}

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${String(idCounter).padStart(4, "0")}`;
}

/**
 * A monotonic clock, advancing a millisecond per write.
 *
 * `new Date()` is too coarse here: two publishes in the same test complete
 * inside one millisecond and would share a timestamp, which no real sequence of
 * `now()` calls across separate statements would produce. Sharing one made
 * "supersede stamps the moment the replacement went live" and "a republish
 * moves `last_published_at`" indistinguishable from doing nothing.
 */
let clock = Date.UTC(2026, 7, 16, 12, 0, 0);
function nextTimestamp(): string {
  clock += 1;
  return new Date(clock).toISOString();
}

/** Resets ids and the clock so values are stable within a test file. */
export function resetFakeIds(): void {
  idCounter = 0;
  clock = Date.UTC(2026, 7, 16, 12, 0, 0);
}

export function createFakeSupabase(tables: FakeTables, options: FakeSupabaseOptions = {}) {
  const calls: RecordedCall[] = [];

  function rowsOf(table: string): FakeRow[] {
    if (!tables[table]) tables[table] = [];
    return tables[table];
  }

  function matches(row: FakeRow, call: RecordedCall): boolean {
    return (
      call.filters.every(([column, value]) => row[column] === value) &&
      call.exclusions.every(([column, value]) => row[column] !== value)
    );
  }

  function from(table: string) {
    const call: RecordedCall = { table, op: "select", filters: [], exclusions: [] };
    const ordering: { column: string; ascending: boolean }[] = [];
    let limit: number | null = null;
    let counting = false;
    let settled = false;

    function run(): QueryResult {
      // Guards against a builder being awaited twice, which would double-count
      // a call and quietly corrupt an assertion about query volume.
      if (!settled) {
        settled = true;
        calls.push(call);
      }

      if (call.op === "insert") {
        options.beforeInsert?.(call, tables);
        const row: FakeRow = { id: nextId(call.table.slice(0, 4)), ...call.payload };

        // uq_site_pages_site_path — two pages on one site cannot share an
        // address. `CreatePage` turns this into "A page already uses that
        // address", so the constraint is part of its contract, not a detail.
        if (call.table === "site_pages") {
          const clash = rowsOf(call.table).some(
            (existing) =>
              existing.site_id === row.site_id &&
              existing.path === row.path &&
              existing.status !== "archived",
          );
          if (clash) {
            return {
              data: null,
              error: {
                code: "23505",
                message:
                  'duplicate key value violates unique constraint "uq_site_pages_site_path"',
              },
            };
          }
          row.status ??= "draft";
          row.revision ??= 0;
          row.is_home ??= false;
          row.published_version_id ??= null;
          row.published_at ??= null;
        }

        if (call.table === "site_page_versions") {
          const clash = rowsOf(call.table).some(
            (existing) =>
              existing.page_id === row.page_id &&
              existing.version_number === row.version_number,
          );
          if (clash) {
            return {
              data: null,
              error: {
                code: "23505",
                message:
                  'duplicate key value violates unique constraint "uq_site_page_versions_number"',
              },
            };
          }
          // Set by the database, and the publish action reads it back to stamp
          // the page and supersede the previous version.
          row.published_at ??= nextTimestamp();
          row.superseded_at ??= null;
        }

        rowsOf(call.table).push(row);
        return { data: [row], error: null };
      }

      if (call.op === "update") {
        const updated: FakeRow[] = [];
        for (const row of rowsOf(call.table)) {
          if (!matches(row, call)) continue;

          if (call.table === "site_page_versions" && "content" in (call.payload ?? {})) {
            return {
              data: null,
              error: { message: "published versions are immutable", code: "42501" },
            };
          }

          const patch = call.payload ?? {};
          // The `revision` trigger: content changes bump it, everything else —
          // a rename, a publish pointer — deliberately does not, so an open
          // editor is not evicted by an edit it did not make.
          if (
            call.table === "site_pages" &&
            "draft_content" in patch &&
            JSON.stringify(patch.draft_content) !== JSON.stringify(row.draft_content)
          ) {
            row.revision = (row.revision as number) + 1;
          }
          Object.assign(row, patch);
          row.updated_at = nextTimestamp();
          updated.push(row);
        }
        return { data: updated, error: null };
      }

      if (call.op === "delete") {
        const remaining = rowsOf(call.table).filter((row) => !matches(row, call));
        tables[call.table] = remaining;
        return { data: [], error: null };
      }

      let result = rowsOf(call.table).filter((row) => matches(row, call));
      if (ordering.length > 0) {
        result = [...result].sort((a, b) => {
          for (const { column, ascending } of ordering) {
            const left = a[column] as number | string | boolean;
            const right = b[column] as number | string | boolean;
            if (left === right) continue;
            return (left < right ? -1 : 1) * (ascending ? 1 : -1);
          }
          return 0;
        });
      }
      if (limit !== null) result = result.slice(0, limit);
      return { data: result, error: null };
    }

    function settle(mode: "many" | "maybeSingle" | "single"): Promise<QueryResult> {
      const { data, error } = run();
      if (error) return Promise.resolve({ data: null, error });

      const rows = (data ?? []) as FakeRow[];
      // `select(cols, { count: "exact", head: true })` — the quota check reads
      // `count` and never looks at `data`.
      if (mode === "many" && counting) {
        return Promise.resolve({ data: rows, error: null, count: rows.length } as QueryResult);
      }
      if (mode === "many") return Promise.resolve({ data: rows, error: null });
      if (rows.length === 0) {
        return Promise.resolve(
          mode === "maybeSingle"
            ? { data: null, error: null }
            : { data: null, error: { message: "no rows returned", code: "PGRST116" } },
        );
      }
      return Promise.resolve({ data: rows[0], error: null });
    }

    const builder = {
      select: (_columns?: string, opts?: { count?: string; head?: boolean }) => {
        if (opts?.count) counting = true;
        return builder;
      },
      insert: (payload: FakeRow) => {
        call.op = "insert";
        call.payload = payload;
        return builder;
      },
      update: (payload: FakeRow) => {
        call.op = "update";
        call.payload = payload;
        return builder;
      },
      delete: () => {
        call.op = "delete";
        return builder;
      },
      eq: (column: string, value: unknown) => {
        call.filters.push([column, value]);
        return builder;
      },
      neq: (column: string, value: unknown) => {
        call.exclusions.push([column, value]);
        return builder;
      },
      order: (column: string, opts?: { ascending?: boolean }) => {
        // Appended, not replaced: `ListPages` orders by `is_home` then `title`,
        // and keeping only the last one silently dropped "home first".
        ordering.push({ column, ascending: opts?.ascending !== false });
        return builder;
      },
      limit: (count: number) => {
        limit = count;
        return builder;
      },
      maybeSingle: () => settle("maybeSingle"),
      single: () => settle("single"),
      // Awaiting the builder without `single()` is how the actions issue their
      // fire-and-forget updates, so it has to behave like a thenable too.
      then: (
        onfulfilled?: (value: QueryResult) => unknown,
        onrejected?: (reason: unknown) => unknown,
      ) => settle("many").then(onfulfilled, onrejected),
    };

    return builder;
  }

  return { client: { from } as never, calls, tables };
}
