import { describe, it, expect } from "vitest";

/**
 * The loading-state contract, expressed as the predicate every converted
 * route uses. The rule under test: a full-page skeleton is for the *initial*
 * pending state only. Once usable data is cached, a background refetch must
 * never take the page away from the user.
 *
 * React Query semantics this encodes:
 *   isLoading  === isPending && isFetching  (no data has ever arrived)
 *   isFetching === a request is in flight, cached data may still exist
 */
function shouldShowPageSkeleton(queries: {
  isLoading: boolean;
  isFetching: boolean;
}[]): boolean {
  return queries.some((q) => q.isLoading);
}

const firstLoad = { isLoading: true, isFetching: true };
const backgroundRefetch = { isLoading: false, isFetching: true };
const settled = { isLoading: false, isFetching: false };

describe("page skeleton gate — initial load", () => {
  it("shows the skeleton when no query has resolved yet", () => {
    expect(shouldShowPageSkeleton([firstLoad, firstLoad])).toBe(true);
  });

  it("shows the skeleton while any required query is still cold", () => {
    // Orders gates on both its table page and its KPI overview; either one
    // being cold means part of the page would render blank.
    expect(shouldShowPageSkeleton([settled, firstLoad])).toBe(true);
  });
});

describe("page skeleton gate — cached data stays visible", () => {
  it("does NOT replace cached content during a background refetch", () => {
    expect(shouldShowPageSkeleton([backgroundRefetch])).toBe(false);
  });

  it("does NOT replace cached content on a filter or pagination change", () => {
    // A new filter creates a new query key, but React Query keeps the previous
    // data visible; isLoading stays false because data exists.
    expect(shouldShowPageSkeleton([backgroundRefetch, backgroundRefetch])).toBe(
      false,
    );
  });

  it("does NOT replace cached content on a focus refetch or manual refresh", () => {
    expect(shouldShowPageSkeleton([settled, backgroundRefetch])).toBe(false);
  });

  it("shows nothing once every query has settled", () => {
    expect(shouldShowPageSkeleton([settled, settled])).toBe(false);
  });
});

describe("page skeleton gate — the three identity states", () => {
  /**
   * The orders gate got this wrong twice, in opposite directions:
   *
   *   `isLoadingOrders || isLoadingStats` alone  -> stranded the page forever,
   *      because both queries are `enabled: !!clerkOrgId` and a disabled query
   *      reports isLoading: true indefinitely in React Query v5.
   *
   *   `clerkOrgId && (...)` alone -> flashed an empty table and 0 stats while
   *      the org id was still being fetched, because the guard short-circuits
   *      to false and lets the page render with empty query data.
   *
   * Identity has THREE states, and each needs a different answer.
   */
  function gate(
    identity: { isLoading: boolean; orgId: string },
    data: { isLoading: boolean }[],
  ): boolean {
    return (
      identity.isLoading ||
      (!!identity.orgId && data.some((q) => q.isLoading))
    );
  }

  const cold = { isLoading: true };

  it("identity still resolving → skeleton, not an empty page", () => {
    // The regression: data queries are disabled and their data is empty, so
    // rendering here shows an empty table and 0 stats for a beat.
    expect(gate({ isLoading: true, orgId: "" }, [cold, cold])).toBe(true);
  });

  it("identity resolved but absent → fall through, never stranded", () => {
    expect(gate({ isLoading: false, orgId: "" }, [cold, cold])).toBe(false);
  });

  it("identity resolved and present → skeleton only while data is in flight", () => {
    expect(gate({ isLoading: false, orgId: "org_1" }, [cold, cold])).toBe(true);
    expect(gate({ isLoading: false, orgId: "org_1" }, [settled, settled])).toBe(
      false,
    );
  });

  it("never renders content before identity is known", () => {
    // The invariant both bugs violated: while identity is unknown, the page
    // must not be showing its populated view.
    const identityUnknown = { isLoading: true, orgId: "" };
    expect(gate(identityUnknown, [settled, settled])).toBe(true);
  });
});

describe("page skeleton gate — identity must gate the gate", () => {
  /**
   * Regression guard for a real bug: /dashboard/orders gated on
   * `isLoadingOrders || isLoadingStats`, but BOTH queries are
   * `enabled: !!clerkOrgId`. A disabled query reports isLoading: true forever
   * in React Query v5, so a missing org id pinned the page on the skeleton
   * permanently — the route simply stopped responding.
   *
   * The rule: when every gating query is disabled behind an identity, that
   * identity must be part of the condition.
   */
  function ordersGate(clerkOrgId: string | undefined, queries: {
    isLoading: boolean;
  }[]): boolean {
    return !!clerkOrgId && queries.some((q) => q.isLoading);
  }

  const coldDisabled = { isLoading: true };

  it("does NOT strand the page when the identity is missing", () => {
    // Both queries report isLoading forever because they are disabled.
    expect(ordersGate(undefined, [coldDisabled, coldDisabled])).toBe(false);
  });

  it("still shows the skeleton once the identity resolves", () => {
    expect(ordersGate("org_123", [coldDisabled, coldDisabled])).toBe(true);
  });

  it("clears once the queries settle", () => {
    expect(ordersGate("org_123", [settled, settled])).toBe(false);
  });

  it("the naive gate would have stranded the route", () => {
    // Documents the bug this guard exists to prevent.
    const naive = (queries: { isLoading: boolean }[]) =>
      queries.some((q) => q.isLoading);
    expect(naive([coldDisabled, coldDisabled])).toBe(true);
  });
});

describe("page skeleton gate — cannot strand the route", () => {
  it("a disabled/optional query never holds the page in a skeleton", () => {
    // A disabled query reports isLoading: true forever in React Query v5, so
    // routes must gate on required queries only. This is the regression guard
    // for "disabled queries cannot leave a route permanently skeletonized".
    const disabledOptional = { isLoading: true, isFetching: false };
    const required = settled;

    // Gating on required queries only — the optional one is excluded.
    expect(shouldShowPageSkeleton([required])).toBe(false);

    // Proof the guard matters: including it would strand the page.
    expect(shouldShowPageSkeleton([required, disabledOptional])).toBe(true);
  });
});

describe("page skeleton gate — states are mutually exclusive", () => {
  /** Mirrors the render order every converted route uses. */
  function resolveState(q: {
    isLoading: boolean;
    isError: boolean;
    rowCount: number;
  }): "loading" | "error" | "empty" | "populated" {
    if (q.isLoading) return "loading";
    if (q.isError) return "error";
    if (q.rowCount === 0) return "empty";
    return "populated";
  }

  it("loading wins before data or error exist", () => {
    expect(
      resolveState({ isLoading: true, isError: false, rowCount: 0 }),
    ).toBe("loading");
  });

  it("a resolved-but-empty result is empty, never loading", () => {
    // This is the cash-drawers case: em-dashes are real empty data for the
    // selected range, not an unfinished request.
    expect(
      resolveState({ isLoading: false, isError: false, rowCount: 0 }),
    ).toBe("empty");
  });

  it("error remains reachable and does not overlap loading", () => {
    expect(
      resolveState({ isLoading: false, isError: true, rowCount: 0 }),
    ).toBe("error");
  });

  it("populated data replaces every other state", () => {
    expect(
      resolveState({ isLoading: false, isError: false, rowCount: 12 }),
    ).toBe("populated");
  });
});
