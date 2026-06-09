'use client'

import * as React from 'react'
import { PhoneInput as BasePhoneInput } from 'react-international-phone'
import 'react-international-phone/style.css'
import { cn } from '@/lib/utils'
import { normalizePhone } from '@/lib/phone'

interface PhoneInputProps {
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  defaultCountry?: string
  placeholder?: string
  disabled?: boolean
  className?: string
  id?: string
  'aria-invalid'?: boolean
}

function PhoneInput({
  value,
  onChange,
  onBlur,
  defaultCountry = 'us',
  placeholder,
  disabled,
  className,
  id,
  'aria-invalid': ariaInvalid,
}: PhoneInputProps) {
  const handleChange = (phone: string) => {
    onChange(phone)
  }

  const handleBlur = () => {
    const normalized = normalizePhone(value)
    if (normalized && normalized !== value) {
      onChange(normalized)
    }
    onBlur?.()
  }

  return (
    <BasePhoneInput
      defaultCountry={defaultCountry}
      value={value}
      onChange={handleChange}
      onBlur={handleBlur}
      disabled={disabled}
      placeholder={placeholder}
      inputProps={{ id, 'aria-invalid': ariaInvalid }}
      style={
        {
          '--react-international-phone-border-radius': 'calc(var(--radius) - 2px)',
          '--react-international-phone-border-color': 'var(--border)',
          '--react-international-phone-background-color': 'var(--background)',
          '--react-international-phone-text-color': 'var(--foreground)',
          '--react-international-phone-selected-dropdown-item-background-color': 'var(--accent)',
          '--react-international-phone-dropdown-item-background-color': 'var(--popover)',
          '--react-international-phone-height': '36px',
          '--react-international-phone-font-size': '0.875rem',
        } as React.CSSProperties
      }
      className={cn(
        'w-full [&_.react-international-phone-input-container]:flex [&_.react-international-phone-input-container]:w-full [&_.react-international-phone-input]:min-w-0 [&_.react-international-phone-input]:flex-1 [&_.react-international-phone-input]:w-full',
        className,
      )}
    />
  )
}

export { PhoneInput }
export type { PhoneInputProps }
