import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import React from "react";
import { AffectsTag } from "../AffectsTag";

describe("AffectsTag (pure / roleAware=false)", () => {
  it("renders L1 as 'all locations'", () => {
    const html = renderToString(
      <AffectsTag ctx={{ level: 1 }} roleAware={false} />,
    );
    expect(html).toContain("all locations");
  });

  it("renders L2 with location name", () => {
    const html = renderToString(
      <AffectsTag
        ctx={{ level: 2, locationName: "Downtown" }}
        roleAware={false}
      />,
    );
    expect(html).toContain("Downtown only");
  });

  it("renders L3 with category name", () => {
    const html = renderToString(
      <AffectsTag
        ctx={{ level: 3, categoryName: "Burgers" }}
        roleAware={false}
      />,
    );
    expect(html).toContain("Burgers");
  });

  it("renders L4 combining category + location", () => {
    const html = renderToString(
      <AffectsTag
        ctx={{ level: 4, categoryName: "Burgers", locationName: "Downtown" }}
        roleAware={false}
      />,
    );
    expect(html).toContain("Burgers at Downtown only");
  });

  it("renders L5 combining menu + location", () => {
    const html = renderToString(
      <AffectsTag
        ctx={{ level: 5, menuName: "Lunch", locationName: "Downtown" }}
        roleAware={false}
      />,
    );
    expect(html).toContain("Lunch menu at Downtown only");
  });

  it("banner variant renders 'Affects:' label", () => {
    const html = renderToString(
      <AffectsTag ctx={{ level: 1 }} variant="banner" roleAware={false} />,
    );
    expect(html).toContain("Affects:");
  });

  it("inline variant renders as a pill badge", () => {
    const html = renderToString(
      <AffectsTag
        ctx={{ level: 2, locationName: "Downtown" }}
        variant="inline"
        roleAware={false}
      />,
    );
    expect(html).toContain("rounded-full");
  });
});

describe("AffectsTag (roleAware)", () => {
  it("renders like the pure version when a QueryClient surfaces an owner role", async () => {
    // We dynamically import react-query so this test only runs when the
    // dep is present. The component reads `useManagerPermissions()`, which
    // calls `useQuery` — with an empty cache it resolves to a null role,
    // which passes through `effectiveScopeForRole` unchanged and renders
    // as the owner-style label.
    const { QueryClient, QueryClientProvider } = await import(
      "@tanstack/react-query"
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    // Seed the role query with an owner role so the hook resolves
    // synchronously during renderToString().
    client.setQueryData(["current-user-role"], {
      roleCode: "owner",
      isOwnerOrAdmin: true,
      isManager: false,
      isMember: false,
      assignedLocationIds: [],
    });

    const html = renderToString(
      <QueryClientProvider client={client}>
        <AffectsTag ctx={{ level: 1 }} />
      </QueryClientProvider>,
    );
    expect(html).toContain("all locations");
    expect(html).not.toContain("Read-only");
  });
});
