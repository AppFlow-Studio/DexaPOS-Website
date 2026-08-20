import { describe, expect, it } from "vitest";

import {
  MAX_NAV_ITEMS,
  appendNavItem,
  deadNavLinks,
  deriveNavFromPages,
  isSameNavTarget,
  navLinkStatus,
  removeNavItemByPath,
  serializeNav,
  type NavItem,
  type NavPage,
} from "../nav";
import { readNav } from "../public-context";

/**
 * Keeping the navigation and the published pages in agreement.
 *
 * The bug these exist for: `merchant_sites.nav` had a reader in the public
 * renderer and no writer anywhere, so a merchant could publish a page, see it
 * live at its own address, and have no visitor ever reach it. The fix is not
 * one function — it is publish, unpublish, rename and delete each keeping the
 * column true, plus a backfill for the sites that were built before any of that
 * existed. These are the rules all four share.
 */
describe("appendNavItem", () => {
  const items: NavItem[] = [
    { label: "Menu", path: "menu" },
    { label: "Catering", path: "catering" },
  ];

  it("appends a page that is not already linked", () => {
    expect(appendNavItem(items, { label: "Parties", path: "parties" })).toEqual([
      ...items,
      { label: "Parties", path: "parties" },
    ]);
  });

  it("never adds the same destination twice, whatever it is labelled", () => {
    expect(appendNavItem(items, { label: "Our Menu", path: "menu" })).toBe(items);
  });

  /**
   * The property that matters most. A merchant who has spent time arranging
   * their navigation must not find it rearranged because they republished a
   * page — so this only ever appends.
   */
  it("leaves the existing order untouched", () => {
    const result = appendNavItem(items, { label: "Parties", path: "parties" });
    expect(result.slice(0, 2)).toEqual(items);
  });

  it("stops at the header's capacity rather than dropping an existing link", () => {
    const full: NavItem[] = Array.from({ length: MAX_NAV_ITEMS }, (_, i) => ({
      label: `Page ${i}`,
      path: `p${i}`,
    }));
    expect(appendNavItem(full, { label: "One more", path: "extra" })).toBe(full);
  });

  it("treats an external link's address as its identity", () => {
    const external: NavItem[] = [{ label: "Book", href: "https://example.com/book" }];
    expect(appendNavItem(external, { label: "Reserve", href: "https://example.com/book" })).toBe(
      external,
    );
  });
});

describe("removeNavItemByPath", () => {
  const items: NavItem[] = [
    { label: "Menu", path: "menu" },
    { label: "Book", href: "https://example.com" },
    { label: "Catering", path: "catering" },
  ];

  it("drops the link to a page that stopped being public", () => {
    expect(removeNavItemByPath(items, "menu")).toEqual([items[1], items[2]]);
  });

  it("tolerates a leading slash, because storage and typing disagree", () => {
    expect(removeNavItemByPath(items, "/catering")).toEqual([items[0], items[1]]);
  });

  it("never touches external links", () => {
    expect(removeNavItemByPath(items, "https://example.com")).toEqual(items);
  });
});

describe("isSameNavTarget", () => {
  it("compares destinations, not labels", () => {
    expect(isSameNavTarget({ label: "A", path: "menu" }, { label: "B", path: "/menu" })).toBe(true);
    expect(isSameNavTarget({ label: "A", path: "menu" }, { label: "A", path: "catering" })).toBe(
      false,
    );
  });

  it("never matches an internal page against an external link", () => {
    expect(
      isSameNavTarget({ label: "Menu", path: "menu" }, { label: "Menu", href: "https://x.test" }),
    ).toBe(false);
  });
});

describe("deriveNavFromPages", () => {
  const pages: NavPage[] = [
    { title: "Home", path: "", isHome: true, isPublished: true },
    { title: "About us", path: "about", isHome: false, isPublished: true },
    { title: "Draft page", path: "draft", isHome: false, isPublished: false },
  ];

  it("links only what is actually published", () => {
    expect(deriveNavFromPages(pages).map((i) => i.path)).toEqual(["about"]);
  });

  /**
   * The backfill and the publish path have to agree about the home page, or a
   * site's navigation would depend on whether it was filled in all at once or
   * built up one publish at a time. Neither adds it: the logo links home
   * already, and a "Home" item beside it spends one of eight slots saying so
   * twice.
   */
  it("leaves the home page out, exactly as publishing does", () => {
    expect(deriveNavFromPages(pages).some((i) => i.path === "")).toBe(false);
  });

  it("keeps publication order", () => {
    const ordered: NavPage[] = [
      { title: "Second", path: "b", isHome: false, isPublished: true },
      { title: "First", path: "a", isHome: false, isPublished: true },
    ];
    expect(deriveNavFromPages(ordered).map((i) => i.path)).toEqual(["b", "a"]);
  });

  it("never exceeds what the header can lay out", () => {
    const many: NavPage[] = Array.from({ length: 20 }, (_, i) => ({
      title: `Page ${i}`,
      path: `p${i}`,
      isHome: false,
      isPublished: true,
    }));
    expect(deriveNavFromPages(many)).toHaveLength(MAX_NAV_ITEMS);
  });

  it("gives an untitled page a label rather than an empty link", () => {
    const untitled: NavPage[] = [{ title: "   ", path: "x", isHome: false, isPublished: true }];
    expect(deriveNavFromPages(untitled)[0].label).toBe("Untitled");
  });
});

/**
 * The end-to-end property: a page that gets published becomes reachable, and a
 * page that gets unpublished stops being linked. Written against the pure
 * helpers the actions compose, because the actions themselves are a database
 * round trip away.
 */
describe("publish → reachable, unpublish → no dead link", () => {
  it("a newly published page appears in the rendered header", () => {
    const before = serializeNav([{ label: "Menu", path: "menu" }]);
    expect(readNav(before, "/sites/joes").map((l) => l.label)).toEqual(["Menu"]);

    const after = serializeNav(
      appendNavItem([{ label: "Menu", path: "menu" }], { label: "About us", path: "about" }),
    );

    expect(readNav(after, "/sites/joes")).toEqual([
      { label: "Menu", href: "/sites/joes/menu" },
      { label: "About us", href: "/sites/joes/about" },
    ]);
  });

  it("an unpublished page leaves no link behind", () => {
    const items = [
      { label: "Menu", path: "menu" },
      { label: "About us", path: "about" },
    ];
    const after = serializeNav(removeNavItemByPath(items, "about"));
    expect(readNav(after, "/sites/joes").map((l) => l.label)).toEqual(["Menu"]);
  });
});

/**
 * The editor's dead-link warning.
 *
 * `syncNavForPage` keeps the column true whenever a page is published or
 * unpublished through the Pages screen, so these cases are the ones it cannot
 * reach: a merchant linking a page they have not published yet, a sync whose
 * write failed silently (it is best-effort inside a `try`/`catch`), a page
 * deleted out from under a link, and every site built before the sync existed.
 *
 * Modelled on the real failure found on Joes Coffee Shop, 2026-08-20: their
 * published header linked `/career` while that page sat unpublished, so the
 * site's own navigation handed visitors a 404.
 */
describe("navLinkStatus", () => {
  const pages: NavPage[] = [
    { title: "Home", path: "", isHome: true, isPublished: true },
    { title: "About us", path: "about-us", isHome: false, isPublished: true },
    { title: "Career", path: "career", isHome: false, isPublished: false },
  ];

  it("passes a link to a published page", () => {
    expect(navLinkStatus({ label: "About us", path: "about-us" }, pages)).toBe("ok");
  });

  it("flags Joes' real /career link as unpublished", () => {
    expect(navLinkStatus({ label: "Career", path: "career" }, pages)).toBe("unpublished");
  });

  it("flags a link whose page no longer exists", () => {
    expect(navLinkStatus({ label: "Specials", path: "specials" }, pages)).toBe("missing");
  });

  it("passes external links untouched — we cannot check someone else's server", () => {
    expect(navLinkStatus({ label: "Book", href: "https://resy.com/joes" }, pages)).toBe("ok");
  });

  it("ignores a leading slash, because storage and typing disagree about it", () => {
    expect(navLinkStatus({ label: "Career", path: "/career" }, pages)).toBe("unpublished");
  });

  it("treats the home page like any other — an unpublished home is still dead", () => {
    const unpublishedHome: NavPage[] = [{ title: "Home", path: "", isHome: true, isPublished: false }];
    expect(navLinkStatus({ label: "Home", path: "" }, unpublishedHome)).toBe("unpublished");
  });
});

describe("deadNavLinks", () => {
  const pages: NavPage[] = [
    { title: "Home", path: "", isHome: true, isPublished: true },
    { title: "About us", path: "about-us", isHome: false, isPublished: true },
    { title: "Career", path: "career", isHome: false, isPublished: false },
  ];

  it("returns nothing when every link resolves", () => {
    expect(deadNavLinks([{ label: "About us", path: "about-us" }], pages)).toEqual([]);
  });

  it("reports the index, so the banner can remove exactly those rows", () => {
    const items: NavItem[] = [
      { label: "Home", path: "" },
      { label: "About us", path: "about-us" },
      { label: "Career", path: "career" },
      { label: "Gone", path: "gone" },
    ];

    expect(deadNavLinks(items, pages).map((d) => [d.index, d.status])).toEqual([
      [2, "unpublished"],
      [3, "missing"],
    ]);
  });

  it("removing by the reported indices leaves only live links", () => {
    const items: NavItem[] = [
      { label: "About us", path: "about-us" },
      { label: "Career", path: "career" },
      { label: "Gone", path: "gone" },
    ];

    const doomed = new Set(deadNavLinks(items, pages).map((d) => d.index));
    const kept = items.filter((_, i) => !doomed.has(i));

    expect(kept).toEqual([{ label: "About us", path: "about-us" }]);
    expect(deadNavLinks(kept, pages)).toEqual([]);
  });
});
