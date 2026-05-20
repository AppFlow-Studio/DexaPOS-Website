import { TABLE_SHAPES } from './table-shapes'

export const TABLE_SIZE_PRESETS = {
  S: 0.8,
  M: 1,
  L: 1.2,
  XL: 1.4
} as const

export type TableSizePreset = keyof typeof TABLE_SIZE_PRESETS

const TABLE_NUMBER_PATTERN = /^(?:T-)?([1-9]\d*)$/i

export function getNextAvailableTableNumber (names: Array<string | null | undefined>): number {
  const usedNumbers = new Set<number>()

  for (const name of names) {
    const normalized = name?.trim()
    if (!normalized) continue

    const match = normalized.match(TABLE_NUMBER_PATTERN)
    if (!match) continue

    usedNumbers.add(Number(match[1]))
  }

  let candidate = 1
  while (usedNumbers.has(candidate)) {
    candidate += 1
  }

  return candidate
}

export function reserveNextAvailableTableNames (
  existingNames: Array<string | null | undefined>,
  count: number
): string[] {
  const reservedNames = [...existingNames]
  const names: string[] = []

  for (let index = 0; index < count; index += 1) {
    const nextNumber = getNextAvailableTableNumber(reservedNames)
    const nextName = String(nextNumber)
    reservedNames.push(nextName)
    names.push(nextName)
  }

  return names
}

export function getBaseSizeForShape (shapeId: keyof typeof TABLE_SHAPES | string): {
  width: number
  height: number
} {
  const shape = TABLE_SHAPES[shapeId as keyof typeof TABLE_SHAPES]

  return {
    width: shape?.width || 100,
    height: shape?.height || 100
  }
}

export function getSizeForPreset (
  shapeId: keyof typeof TABLE_SHAPES | string,
  preset: TableSizePreset
): { width: number; height: number } {
  const baseSize = getBaseSizeForShape(shapeId)
  const scale = TABLE_SIZE_PRESETS[preset]

  return {
    width: Math.round(baseSize.width * scale),
    height: Math.round(baseSize.height * scale)
  }
}

export function inferSizePreset (
  shapeId: keyof typeof TABLE_SHAPES | string,
  width?: number | null,
  height?: number | null
): TableSizePreset {
  const baseSize = getBaseSizeForShape(shapeId)
  const widthRatio = width && baseSize.width ? width / baseSize.width : 1
  const heightRatio = height && baseSize.height ? height / baseSize.height : 1
  const currentScale = (widthRatio + heightRatio) / 2

  return (Object.keys(TABLE_SIZE_PRESETS) as TableSizePreset[]).reduce(
    (closestPreset, preset) => {
      const closestDistance = Math.abs(TABLE_SIZE_PRESETS[closestPreset] - currentScale)
      const presetDistance = Math.abs(TABLE_SIZE_PRESETS[preset] - currentScale)
      return presetDistance < closestDistance ? preset : closestPreset
    },
    'M'
  )
}
