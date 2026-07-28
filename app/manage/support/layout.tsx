import type { ReactNode } from "react";
import { requireAdminAuth } from "@/lib/admin/auth";

export default async function HQSupportLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireAdminAuth("hq.support.view");

  return children;
}
