import type { ReactNode } from "react";

export default function ReportsLayout({ children }: { children: ReactNode }) {
  return <div className="reports-without-horizontal-lines">{children}</div>;
}
