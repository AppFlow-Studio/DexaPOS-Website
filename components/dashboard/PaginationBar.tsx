"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PaginationMeta } from "@/types/pagination";

interface PaginationBarProps {
  pagination: PaginationMeta;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
  itemLabel?: string;
}

export function PaginationBar({
  pagination,
  onPageChange,
  isLoading = false,
  itemLabel = "records",
}: PaginationBarProps) {
  const { page, pageSize, total, totalPages } = pagination;
  if (total <= pageSize) return null;

  const firstItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, total);

  return (
    <div className="mt-5 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        Showing{" "}
        <span className="font-medium text-foreground tabular-nums">
          {firstItem}-{lastItem}
        </span>{" "}
        of{" "}
        <span className="font-medium text-foreground tabular-nums">
          {total.toLocaleString()}
        </span>{" "}
        {itemLabel}
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-full"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={isLoading || page <= 1}
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          Previous
        </Button>
        <span className="min-w-20 text-center text-sm text-muted-foreground tabular-nums">
          Page {page} of {totalPages}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-full"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={isLoading || page >= totalPages}
        >
          Next
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
