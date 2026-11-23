import { PaginatedResponse } from '../../../shared/types';

export function paginate<T>(
  items: readonly T[],
  page: number,
  limit: number,
): PaginatedResponse<T> {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const offset = (safePage - 1) * limit;

  return {
    items: items.slice(offset, offset + limit),
    pagination: {
      page: safePage,
      limit,
      total,
      totalPages,
    },
  };
}
