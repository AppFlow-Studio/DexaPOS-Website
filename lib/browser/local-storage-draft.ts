'use client'

export function readLocalStorageDraft<T>(key: string): T | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch (error) {
    console.error('Failed to read localStorage draft', { key, error })
    return null
  }
}

export function writeLocalStorageDraft(key: string, value: unknown) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch (error) {
    console.error('Failed to write localStorage draft', { key, error })
  }
}

export function clearLocalStorageDraft(key: string) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.removeItem(key)
  } catch (error) {
    console.error('Failed to clear localStorage draft', { key, error })
  }
}
