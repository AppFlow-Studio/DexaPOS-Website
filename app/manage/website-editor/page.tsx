import { redirect } from "next/navigation";

import { PageShell, Panel } from "@/components/dashboard/shell";
import { requireHqUser } from "@/lib/cms/cms-auth";
import { NewPageDialog } from "./components/NewPageDialog";
import { PagesTable, type CategoryOption, type PageRow } from "./components/PagesTable";
import { WebsiteEditorHeader } from "./components/WebsiteEditorHeader";

export default async function WebsiteEditorPages() {
  const { userId, supabase } = await requireHqUser();
  if (!userId) redirect("/dashboard");

  const [{ data: pages }, { data: cats }] = await Promise.all([
    supabase
      .from("page_content")
      .select("route, cms_title, title, description, updated_at, published, category")
      .order("route"),
    supabase.from("page_categories").select("slug, name").order("sort_order").order("name"),
  ]);

  return (
    <PageShell as="div">
      <WebsiteEditorHeader actions={<NewPageDialog />} />
      <Panel padded>
        <PagesTable
          pages={(pages as PageRow[] | null) || []}
          categories={(cats as CategoryOption[] | null) || []}
        />
      </Panel>
    </PageShell>
  );
}
