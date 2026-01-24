import { useState, useEffect } from 'react'

/**
 * useDebounce - Debounces a value by a specified delay.
 *
 * Useful for search inputs to avoid making API requests on every keystroke.
 *
 * @param value - The value to debounce
 * @param delay - The delay in milliseconds (default: 300ms)
 * @returns The debounced value
 *
 * @example
 * ```tsx
 * const [search, setSearch] = useState('')
 * const debouncedSearch = useDebounce(search, 300)
 *
 * // Use debouncedSearch in your query
 * const { data } = useQuery({
 *   queryKey: ['search', debouncedSearch],
 *   queryFn: () => searchItems(debouncedSearch),
 * })
 * ```
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    // Set up timer to update debounced value after delay
    const timer = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    // Clean up timer on value change or unmount
    return () => {
      clearTimeout(timer)
    }
  }, [value, delay])

  return debouncedValue
}
