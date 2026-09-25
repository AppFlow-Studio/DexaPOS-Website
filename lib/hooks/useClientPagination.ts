'use client'

import { useState } from 'react'
import type { PaginationMeta } from '@/types/pagination'

/**
 * Slices an in-memory list into fixed-size pages for `PaginationBar`.
 *
 * The page is clamped against the current row count, so a list that shrinks
 * (a filter, a period change, a refetch) never strands the view on an empty
 * page past the end.
 */
export function useClientPagination<T>(rows: readonly T[], pageSize = 10) {
  const [requestedPage, setPage] = useState(1)
  const total = rows.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.min(requestedPage, totalPages)

  const pagination: PaginationMeta = {
    page,
    pageSize,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  }

  return {
    pageRows: rows.slice((page - 1) * pageSize, page * pageSize),
    pagination,
    setPage,
  }
}
