import { requireHqUser } from "@/lib/cms/cms-auth";
import { redirect } from "next/navigation";
import AdminCategoriesClient from "./AdminCategoriesClient";

interface Category {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  sort_order: number;
}

type CategoryNode = Category & { children: CategoryNode[] };

function buildTree(categories: Category[]): (Category & { depth: number })[] {
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

  function flatten(list: CategoryNode[], depth: number): (Category & { depth: number })[] {
    const result: (Category & { depth: number })[] = [];
    for (const node of list) {
      result.push({ id: node.id, name: node.name, slug: node.slug, parent_id: node.parent_id, sort_order: node.sort_order, depth });
      result.push(...flatten(node.children, depth + 1));
    }
    return result;
  }

  return flatten(roots, 0);
}

export default async function AdminCategories() {
  const { userId, supabase } = await requireHqUser();
  if (!userId) redirect("/dashboard");

  const { data: categories } = await supabase
    .from("page_categories")
    .select("*")
    .order("sort_order")
    .order("name");

  const flat = buildTree((categories as Category[]) || []);

  return (
    <div>
      <div className="admin-head">
        <h1>Categories</h1>
      </div>
      <AdminCategoriesClient
        categories={flat}
        allCategories={(categories as Category[]) || []}
      />
    </div>
  );
}
