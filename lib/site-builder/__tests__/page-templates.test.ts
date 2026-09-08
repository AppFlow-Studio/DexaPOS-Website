import { describe, expect, it } from "vitest";

import { createPageFromTemplate } from "../page-templates";
import { SECTION_REGISTRY } from "../sections/registry";
import { validatePage } from "../validate";

describe("page templates", () => {
  it("keeps the Blank template structurally complete while leaving its body empty", () => {
    const doc = createPageFromTemplate("blank", {
      locationId: "loc_1",
      title: "Catering",
    });

    expect(doc.sections.map((section) => section.kind)).toEqual(["header", "hero", "footer"]);
    expect(
      doc.sections.filter((section) => SECTION_REGISTRY[section.kind].zone === "body"),
    ).toEqual([]);

    const errors = validatePage(doc).errors;
    expect(errors.some((error) => error.code === "missing_required_section")).toBe(false);
    expect(errors.some((error) => error.code === "empty_page")).toBe(true);
  });
});
