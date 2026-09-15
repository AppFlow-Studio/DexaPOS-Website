import { describe, expect, it } from "vitest";

import { featureIconFor, FEATURE_ICON_NAMES } from "../sections/feature-icon";
import { runMigrations, type RawDocument } from "../migrations";
import { featuresSchema } from "../sections/schemas/features";

describe("featureIconFor", () => {
  /**
   * Owner's own seven, captured from the live Features editor in
   * docs/research/owner-com-website-tab/raw/home-section-editors.txt (BLOCK 13).
   * If a merchant types what Owner's merchants type, they get a sensible icon
   * without touching a single control.
   */
  it("picks an icon for every value on Owner's live Features section", () => {
    expect(featureIconFor("Catering")).toBe("UtensilsCrossed");
    expect(featureIconFor("Delivery")).toBe("Truck");
    expect(featureIconFor("Dine In")).toBe("UtensilsCrossed");
    expect(featureIconFor("Takeout")).toBe("UtensilsCrossed");
    expect(featureIconFor("Vegan Options")).toBe("Leaf");
    expect(featureIconFor("Private Dining Room")).toBe("Users");
    expect(featureIconFor("Live Music")).toBe("Mic");
  });

  /**
   * The five in the screenshots of Owner's editor, with the icons their canvas
   * drew beside them. This is the closest thing we have to a rendered capture,
   * so it is the strongest assertion in the file.
   */
  it("matches the icons Owner's canvas drew for a real merchant's list", () => {
    expect(featureIconFor("Catering")).toBe("UtensilsCrossed");
    expect(featureIconFor("Gluten-Free Options")).toBe("WheatOff");
    expect(featureIconFor("Healthy Options")).toBe("Heart");
    expect(featureIconFor("Easy Parking")).toBe("Car");
    expect(featureIconFor("Vegan Options")).toBe("Leaf");
  });

  it("only ever suggests an icon the picker can show", () => {
    const offered = new Set<string>(FEATURE_ICON_NAMES);
    for (const title of ["Delivery", "Parking", "", "Zzzz", "Halal", "Live Music", "Gift cards"]) {
      expect(offered.has(featureIconFor(title))).toBe(true);
    }
  });

  /** People beat food when a title carries both — "Private Dining Room". */
  it("resolves a title matching two rules by rule order", () => {
    expect(featureIconFor("Family dining")).toBe("Users");
    expect(featureIconFor("Dining")).toBe("UtensilsCrossed");
  });

  /**
   * The reason matching is word-prefixed rather than a substring test: a
   * substring test gives "Sparkling water" a map pin, because it contains
   * "park".
   */
  it("matches whole words, not substrings", () => {
    expect(featureIconFor("Sparkling water")).not.toBe("Car");
    expect(featureIconFor("Parking available")).toBe("Car");
  });

  it("always returns an icon, so no badge in the strip renders bare", () => {
    for (const title of ["", "   ", "!!!", "Zzzz", "外卖", "1998"]) {
      expect(featureIconFor(title)).toBe("Star");
    }
  });
});

describe("featuresSchema", () => {
  /** The layout control the strip no longer needs, on an older document. */
  it("strips the columns field a document written before the strip carried", () => {
    const parsed = featuresSchema.safeParse({
      heading: "Featuring",
      items: [{ icon: "Truck", title: "Delivery" }],
      columns: 3,
    });

    expect(parsed.success).toBe(true);
    expect(parsed.data).not.toHaveProperty("columns");
  });

  /**
   * The icon is now a closed set, and the schema is the boundary that keeps it
   * closed — a document carrying a name the picker cannot show would render a
   * blank where an icon belongs.
   */
  it("refuses an icon outside the picker", () => {
    const withUnknownIcon = featuresSchema.safeParse({
      items: [{ title: "Delivery", icon: "Rocket" }],
    });
    expect(withUnknownIcon.success).toBe(false);
  });

  /** The hex lands in a `style` attribute on a public page. */
  it("refuses an icon colour that is not a six-digit hex", () => {
    for (const iconColor of ["red", "#fff", "#12345", "url(x)", "#1234567"]) {
      expect(featuresSchema.safeParse({ items: [], iconColor }).success).toBe(false);
    }
    expect(featuresSchema.safeParse({ items: [], iconColor: "#A1B2C3" }).success).toBe(true);
  });
});

describe("v2 → v3 highlight icons", () => {
  const v2 = (items: unknown[]) => ({
    schemaVersion: 2,
    sections: [{ id: "s1", kind: "features", props: { heading: "Featuring", items } }],
  });

  const iconsOf = (doc: RawDocument) =>
    ((doc.sections as Array<{ props: { items: Array<{ icon: string }> } }>)[0].props.items).map(
      (item) => item.icon,
    );

  /**
   * The shape written between removing the free-text field and adding the
   * picker. Without the migration these items fail the required enum, and
   * `normalizeSection` replaces the whole list with the kind's empty default —
   * so this test is guarding merchant content, not a field.
   */
  it("gives an item with no icon one derived from its title", () => {
    const { doc } = runMigrations(v2([{ title: "Delivery" }, { title: "Easy Parking" }]), 2, 3);
    expect(iconsOf(doc)).toEqual(["Truck", "Car"]);
  });

  /** `Award` and `Sparkles` were in the old twelve and are not in the new twenty. */
  it("replaces an icon the picker no longer offers", () => {
    const { doc } = runMigrations(
      v2([{ title: "Halal certified", icon: "Award" }, { title: "Live Music", icon: "Sparkles" }]),
      2,
      3,
    );
    expect(iconsOf(doc)).toEqual(["UtensilsCrossed", "Mic"]);
  });

  it("leaves an icon that is still offered alone", () => {
    const { doc } = runMigrations(v2([{ title: "Anything at all", icon: "Gift" }]), 2, 3);
    expect(iconsOf(doc)).toEqual(["Gift"]);
  });

  /** The migrated document has to be one the schema will actually accept. */
  it("produces items the current schema parses", () => {
    const { doc } = runMigrations(
      v2([{ title: "Delivery" }, { title: "Vegan Options", icon: "Award" }]),
      2,
      3,
    );
    const props = (doc.sections as Array<{ props: unknown }>)[0].props;
    expect(featuresSchema.safeParse(props).success).toBe(true);
  });

  it("leaves every other section kind untouched", () => {
    const raw = {
      schemaVersion: 2,
      sections: [{ id: "s1", kind: "gallery", props: { items: [{ title: "x" }] } }],
    };
    const { doc } = runMigrations(raw, 2, 3);
    expect(doc.sections).toEqual(raw.sections);
  });

  it("never throws on a malformed document", () => {
    for (const raw of [
      {},
      { sections: "nope" },
      { sections: [null, 7, "x"] },
      { sections: [{ kind: "features" }] },
      { sections: [{ kind: "features", props: { items: "nope" } }] },
      { sections: [{ kind: "features", props: { items: [null, 3] } }] },
    ] as RawDocument[]) {
      expect(() => runMigrations(raw, 2, 3)).not.toThrow();
    }
  });
});
