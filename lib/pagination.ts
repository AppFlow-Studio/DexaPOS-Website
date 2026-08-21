import type {
  PaginatedResult,
  PaginationMeta,
  PaginationParams,
} from "@/types/pagination";

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export function normalizePagination(
  pagination?: PaginationParams,
): { page: number; pageSize: number; offset: number } {
  const requestedPage = Number(pagination?.page);
  const requestedPageSize = Number(pagination?.pageSize);
  const page = Number.isFinite(requestedPage)
    ? Math.max(1, Math.floor(requestedPage))
    : 1;
  const pageSize = Number.isFinite(requestedPageSize)
    ? Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(requestedPageSize)))
    : DEFAULT_PAGE_SIZE;

  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function buildPaginationMeta(
  total: number,
  pagination?: PaginationParams,
): PaginationMeta {
  const { page, pageSize } = normalizePagination(pagination);
  const safeTotal = Math.max(0, Math.floor(Number(total) || 0));
  const totalPages = Math.max(1, Math.ceil(safeTotal / pageSize));

  return {
    page,
    pageSize,
    total: safeTotal,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}

export function emptyPaginatedResult<T>(
  pagination?: PaginationParams,
): PaginatedResult<T> {
  return {
    data: [],
    pagination: buildPaginationMeta(0, pagination),
  };
}
