import { describe, expect, it } from "vitest";
import {
  buildPaginationMeta,
  emptyPaginatedResult,
  normalizePagination,
} from "@/lib/pagination";

describe("pagination helpers", () => {
  it("normalizes invalid input and caps page size", () => {
    expect(normalizePagination({ page: -3, pageSize: 1000 })).toEqual({
      page: 1,
      pageSize: 100,
      offset: 0,
    });
  });

  it("calculates offsets and page metadata", () => {
    expect(normalizePagination({ page: 3, pageSize: 25 })).toEqual({
      page: 3,
      pageSize: 25,
      offset: 50,
    });
    expect(buildPaginationMeta(62, { page: 3, pageSize: 25 })).toEqual({
      page: 3,
      pageSize: 25,
      total: 62,
      totalPages: 3,
      hasNextPage: false,
      hasPreviousPage: true,
    });
  });

  it("returns a stable empty first page", () => {
    expect(emptyPaginatedResult({ page: 4, pageSize: 10 })).toEqual({
      data: [],
      pagination: {
        page: 4,
        pageSize: 10,
        total: 0,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: true,
      },
    });
  });
});
