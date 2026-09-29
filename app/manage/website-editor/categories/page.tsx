import { redirect } from "next/navigation";

import { PageShell } from "@/components/dashboard/shell";
import { requireHqUser } from "@/lib/cms/cms-auth";
import { WebsiteEditorHeader } from "../components/WebsiteEditorHeader";
import { CategoriesClient, type Category, type FlatCategory } from "./CategoriesClient";

type CategoryNode = Category & { children: CategoryNode[] };

function buildTree(categories: Category[]): FlatCategory[] {
  const map = new Map<string, CategoryNode>();
  const roots: CategoryNode[] = [];

  for (const cat of categories) {
    map.set(cat.id, { ...cat, children: [] });
  }
  for (const cat of categories) {
    const node = map.get(cat.id)!;
    if (cat.parent_id && map.has(cat.parent_id)) {
      map.get(cat.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  function flatten(list: CategoryNode[], depth: number): FlatCategory[] {
    const result: FlatCategory[] = [];
    for (const node of list) {
      result.push({ id: node.id, name: node.name, slug: node.slug, parent_id: node.parent_id, sort_order: node.sort_order, depth });
      result.push(...flatten(node.children, depth + 1));
    }
    return result;
  }

  return flatten(roots, 0);
}

export default async function WebsiteEditorCategories() {
  const { userId, supabase } = await requireHqUser();
  if (!userId) redirect("/dashboard");

  const [{ data: categories }, { data: pages }] = await Promise.all([
    supabase.from("page_categories").select("*").order("sort_order").order("name"),
    supabase.from("page_content").select("category"),
  ]);

  const all = (categories as Category[] | null) || [];
  const pageCounts: Record<string, number> = {};
  for (const page of (pages as { category: string | null }[] | null) || []) {
    if (page.category) pageCounts[page.category] = (pageCounts[page.category] || 0) + 1;
  }

  return (
    <PageShell as="div">
      <WebsiteEditorHeader />
      <CategoriesClient categories={buildTree(all)} allCategories={all} pageCounts={pageCounts} />
    </PageShell>
  );
}
