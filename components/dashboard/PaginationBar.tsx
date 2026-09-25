"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PaginationMeta } from "@/types/pagination";

interface PaginationBarProps {
  pagination: PaginationMeta;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
  itemLabel?: string;
  className?: string;
}

export function PaginationBar({
  pagination,
  onPageChange,
  isLoading = false,
  itemLabel = "records",
  className,
}: PaginationBarProps) {
  const { page, pageSize, total, totalPages } = pagination;
  if (total <= pageSize) return null;

  const firstItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, total);

  return (
    <div
      className={cn(
        "mt-5 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
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
      {/* Below 400px the button words drop to screen-reader text: Previous +
          "Page X of Y" + Next is ~280px, wider than a panel's content box on a
          320px phone, so Next was clipped off the edge. */}
      <div className="flex items-center justify-between gap-2 sm:justify-start">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-full"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={isLoading || page <= 1}
        >
          <ChevronLeft className="h-4 w-4 min-[400px]:mr-1" />
          <span className="max-[399px]:sr-only">Previous</span>
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
          <span className="max-[399px]:sr-only">Next</span>
          <ChevronRight className="h-4 w-4 min-[400px]:ml-1" />
        </Button>
      </div>
    </div>
  );
}
