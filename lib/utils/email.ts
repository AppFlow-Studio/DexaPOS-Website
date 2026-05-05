import { z } from 'zod'

const EMAIL_REGEX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/

export type EmailConflictTable =
  | 'users'
  | 'staff_profiles'
  | 'merchants'
  | 'locations'
  | 'location_invites'

export interface EmailConflict {
  table: EmailConflictTable
  id: string
  isPosOnlyProfile?: boolean
}

export function emailConflictMessage(conflict: EmailConflict): string {
  switch (conflict.table) {
    case 'users':
      return 'This email is already used by another user account.'
    case 'merchants':
      return 'This email is already used as a merchant owner email.'
    case 'locations':
      return 'This email is already used as a location contact email.'
    case 'staff_profiles':
      return 'This email is already used by a staff member.'
    case 'location_invites':
      return 'An invitation has already been sent to this email.'
  }
}

export function normalizeEmail(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

export function isValidEmail(value: string | null | undefined): boolean {
  const v = normalizeEmail(value)
  if (v.length === 0 || v.length > 254) return false
  return EMAIL_REGEX.test(v)
}

export const emailZod = z
  .string()
  .trim()
  .toLowerCase()
  .refine(isValidEmail, { message: 'Invalid email' })

export const optionalEmailZod = z
  .string()
  .trim()
  .toLowerCase()
  .refine((v) => v === '' || isValidEmail(v), { message: 'Invalid email' })
  .optional()
  .or(z.literal(''))
