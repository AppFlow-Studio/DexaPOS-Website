import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ItemEditLayout } from "./ItemEditLayout";

interface PageProps {
  params: Promise<{ itemId: string }>;
}

export const dynamic = "force-dynamic";

export default async function ItemEditPage({ params }: PageProps) {
  const { itemId } = await params;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border/60 bg-background px-4 py-2 sm:px-6">
        <Link
          href="/dashboard/menu/items"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Items
        </Link>
      </div>
      <ItemEditLayout itemId={itemId} />
    </div>
  );
}
