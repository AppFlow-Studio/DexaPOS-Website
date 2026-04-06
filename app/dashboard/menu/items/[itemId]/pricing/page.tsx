import { PriceMatrixGrid } from "@/components/dashboard/menu/PriceMatrixGrid";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface PageProps {
  params: Promise<{ itemId: string }>;
}

export const dynamic = "force-dynamic";

export default async function ItemPricingMatrixPage({ params }: PageProps) {
  const { itemId } = await params;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <Link
          href={`/dashboard/menu/items`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Items
        </Link>
      </div>
      <PriceMatrixGrid itemId={itemId} />
    </div>
  );
}
