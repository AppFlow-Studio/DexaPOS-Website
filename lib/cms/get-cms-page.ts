import { createCmsReadClient } from "./supabase";
import { mergeCanonicalSections, Section, normalizeSections } from "./cms-sections";
import { DEFAULT_PAGE_SECTIONS } from "./default-page-content";
import { cache } from "react";

interface CmsPageData {
  title: string;
  description: string;
  sections: Section[];
}

export const getCmsPage = cache(async (route: string): Promise<CmsPageData | null> => {
  const fallbackSections = normalizeSections(DEFAULT_PAGE_SECTIONS[route] || []);
  try {
    const supabase = createCmsReadClient();
    const { data } = await supabase
      .from("page_content")
      .select("title, description, sections")
      .eq("route", route)
      .eq("published", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data) {
      return fallbackSections.length
        ? { title: "", description: "", sections: fallbackSections }
        : null;
    }

    const savedSections = mergeCanonicalSections(
      (data.sections || []) as Section[],
      fallbackSections
    );

    return {
      title: data.title || "",
      description: data.description || "",
      sections: savedSections,
    };
  } catch {
    return fallbackSections.length
      ? { title: "", description: "", sections: fallbackSections }
      : null;
  }
});
