import type { ReactNode } from "react";
import { requireAdminAuth } from "@/lib/admin/auth";

export default async function NewHQSupportTicketLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireAdminAuth("hq.support.manage");
  return children;
}
