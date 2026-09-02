import { describe, expect, it } from "vitest";

import { normalizePageWithReport } from "../normalize";
import { CURRENT_SCHEMA_VERSION } from "../page-document";
import { describeSchema, stringMaxOf } from "../schema-introspect";
import {
  HERO_TITLE_MAX,
  SUBTITLE_MAX,
  TITLE_MAX,
  subtitleSchema,
  titleSchema,
} from "../sections/primitives";
import { SECTION_REGISTRY } from "../sections/registry";

/**
 * The character caps, and the machinery that makes them real.
 *
 * Cheapest quality mechanism in the product: a hard limit with a live counter
 * is the reason a merchant never ships a headline that wraps to four lines. But
 * a cap is only worth having if three separate things agree about it — the
 * schema that validates, the counter that warns, and the repair that runs when
 * a limit is tightened under copy that already exists.
 */
describe("cap values", () => {
  it("uses Owner's numbers", () => {
    expect(TITLE_MAX).toBe(50);
    expect(SUBTITLE_MAX).toBe(500);
    expect(HERO_TITLE_MAX).toBe(150);
  });

  it("rejects copy past the cap", () => {
    expect(titleSchema.safeParse("a".repeat(TITLE_MAX)).success).toBe(true);
    expect(titleSchema.safeParse("a".repeat(TITLE_MAX + 1)).success).toBe(false);
    expect(subtitleSchema.safeParse("a".repeat(SUBTITLE_MAX + 1)).success).toBe(false);
  });
});

/**
 * The counter reads its limit off the schema.
 *
 * It did not, and that is why this file exists: `describeField` set `max` from a
 * hardcoded list of multiline field names, so the counter — written, styled and
 * shipped — asked for a real limit and was handed `undefined` on every field of
 * every section. It rendered nothing, for everything, silently.
 */
describe("the counter can see the cap", () => {
  it("reads the max off a plain schema field", () => {
    expect(stringMaxOf(titleSchema)).toBe(TITLE_MAX);
    expect(stringMaxOf(titleSchema.optional())).toBe(TITLE_MAX);
  });

  it("surfaces a real cap for the fields a merchant types into", () => {
    const content = describeSchema(SECTION_REGISTRY.content.schema);
    expect(content.find((c) => c.name === "title")?.max).toBe(TITLE_MAX);
    expect(content.find((c) => c.name === "subtitle")?.max).toBe(SUBTITLE_MAX);

    const hero = describeSchema(SECTION_REGISTRY.hero.schema);
    expect(hero.find((c) => c.name === "heading")?.max).toBe(HERO_TITLE_MAX);
    expect(hero.find((c) => c.name === "subheading")?.max).toBe(SUBTITLE_MAX);
  });

  it("keeps the textarea decision separate from the cap", () => {
    const hero = describeSchema(SECTION_REGISTRY.hero.schema);
    expect(hero.find((c) => c.name === "subheading")?.multiline).toBe(true);
    // `heading` used to be the counter-example here. It is a textarea now — at
    // 150 characters it routinely runs to a full sentence, and in an `<input>`
    // a merchant edited it through a 30-character window. The point the test
    // makes is unchanged: a capped field is not automatically a textarea.
    expect(hero.find((c) => c.name === "heading")?.multiline).toBe(true);

    // A capped field that is still a single line, which is the point: the cap
    // and the control are decided separately.
    const content = describeSchema(SECTION_REGISTRY.content.schema);
    const title = content.find((c) => c.name === "title");
    expect(title?.max).toBe(TITLE_MAX);
    expect(title?.multiline).toBe(false);
  });

  it("gives every capped text field on every kind a usable number", () => {
    for (const def of Object.values(SECTION_REGISTRY)) {
      for (const control of describeSchema(def.schema)) {
        if (control.kind !== "text" || control.max === undefined) continue;
        expect(control.max, `${def.kind}.${control.name}`).toBeGreaterThan(0);
        expect(Number.isSafeInteger(control.max)).toBe(true);
      }
    }
  });
});

/**
 * Tightening a cap must degrade copy, never destroy it.
 *
 * Without the truncating repair, lowering the title limit from 160 to 50 would
 * fail that field's parse, `pickValidFields` would drop it, and the section
 * would fall back to its defaults — so a merchant would open a page they wrote
 * and find their headline replaced by the words "About us". That is the worst
 * possible outcome of a quality improvement.
 */
describe("read-time repair of over-long stored copy", () => {
  const overlong = "A".repeat(200);

  const docWith = (props: Record<string, unknown>) => ({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    sections: [
      {
        id: "s1",
        kind: "content",
        props: { background: "none", media: "none", alignment: "left", ...props },
      },
    ],
    seo: {},
    settings: {},
  });

  it("keeps the merchant's own words, truncated to the cap", () => {
    const { doc, repairs } = normalizePageWithReport(docWith({ title: overlong }));
    const props = doc.sections[0].props as { title?: string };

    expect(props.title).toBe("A".repeat(TITLE_MAX));
    expect(repairs.some((r) => r.kind === "truncated")).toBe(true);
  });

  it("does not fall back to the default title", () => {
    const { doc } = normalizePageWithReport(docWith({ title: overlong }));
    const props = doc.sections[0].props as { title?: string };
    expect(props.title).not.toBe(SECTION_REGISTRY.content.defaults().title);
  });

  it("leaves copy that already fits completely alone", () => {
    const { doc, repairs } = normalizePageWithReport(docWith({ title: "Our story" }));
    const props = doc.sections[0].props as { title?: string };

    expect(props.title).toBe("Our story");
    expect(repairs.some((r) => r.kind === "truncated")).toBe(false);
  });

  it("truncates the hero at its own, longer cap", () => {
    const { doc } = normalizePageWithReport({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      sections: [
        {
          id: "s1",
          kind: "hero",
          props: { variant: "classic", heading: "B".repeat(400) },
        },
      ],
      seo: {},
      settings: {},
    });

    expect((doc.sections[0].props as { heading: string }).heading).toBe("B".repeat(HERO_TITLE_MAX));
  });
});
