/**
 * Adaptive currency formatter for charts
 * Automatically scales formatting based on value ranges
 */

export function getAdaptiveTickFormatter(values: number[]) {
  if (!values || values.length === 0) {
    return (value: number) => `$${value.toFixed(0)}`
  }

  const maxValue = Math.max(...values.filter(v => v != null), 0)

  // Determine scale based on max value
  if (maxValue >= 1000000) {
    // Millions
    return (value: number) => `$${(value / 1000000).toFixed(1)}M`
  } else if (maxValue >= 100000) {
    // Hundred thousands
    return (value: number) => `$${(value / 1000).toFixed(0)}k`
  } else if (maxValue >= 1000) {
    // Thousands
    return (value: number) => `$${(value / 1000).toFixed(1)}k`
  } else if (maxValue >= 100) {
    // Hundreds (just use dollar sign)
    return (value: number) => `$${value.toFixed(0)}`
  } else {
    // Less than $100 (cents/dollars)
    return (value: number) => `$${value.toFixed(2)}`
  }
}

/**
 * Extract all monetary values from chart data
 */
export function extractMonetaryValues(
  chartData: any[],
  keys: string[]
): number[] {
  const values: number[] = []

  chartData.forEach((item) => {
    keys.forEach((key) => {
      const value = item[key]
      if (typeof value === 'number' && !isNaN(value)) {
        values.push(Math.abs(value))
      }
    })
  })

  return values
}
