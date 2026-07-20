import { redirect } from "next/navigation";
import { requireHqUser } from "@/lib/cms/cms-auth";

/**
 * `/admin` entry. Auth is handled by Clerk HQ (proxy.ts gates `/admin(.*)` to the
 * internal team; `requireHqUser` re-checks here as defense-in-depth). There is no
 * CMS-specific login — HQ users are already signed in via Clerk. Land them on the
 * pages list; bounce anyone else to the dashboard.
 */
export default async function AdminHome() {
  const { userId } = await requireHqUser();
  if (!userId) redirect("/dashboard");
  redirect("/admin/pages");
}
