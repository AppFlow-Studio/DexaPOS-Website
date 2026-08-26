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
  /**
   * Overrides for the library's CSS variables (border color, height, …), merged
   * over the defaults below. Utility classes can't reach those variables, so
   * restyling the control has to go through here.
   */
  style?: React.CSSProperties
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
  style,
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
          '--react-international-phone-border-radius': '9999px',
          '--react-international-phone-border-color': 'transparent',
          '--react-international-phone-background-color': 'transparent',
          '--react-international-phone-text-color': 'var(--foreground)',
          '--react-international-phone-selected-dropdown-item-background-color': 'var(--accent)',
          '--react-international-phone-dropdown-item-background-color': 'var(--popover)',
          '--react-international-phone-height': '36px',
          '--react-international-phone-font-size': '0.875rem',
          '--react-international-phone-dropdown-left': '0',
          ...style,
        } as React.CSSProperties
      }
      className={cn(
        'w-full',
        // Pill-shaped shell matching <Input />: borderless, muted fill, fully rounded.
        '[&_.react-international-phone-input-container]:flex [&_.react-international-phone-input-container]:w-full',
        '[&_.react-international-phone-input-container]:h-9 [&_.react-international-phone-input-container]:overflow-hidden',
        '[&_.react-international-phone-input-container]:rounded-full [&_.react-international-phone-input-container]:bg-muted/60',
        // Country selector: left half of the pill, no divider.
        '[&_.react-international-phone-country-selector-button]:h-9 [&_.react-international-phone-country-selector-button]:rounded-l-full',
        '[&_.react-international-phone-country-selector-button]:border-0 [&_.react-international-phone-country-selector-button]:bg-transparent',
        '[&_.react-international-phone-country-selector-button]:pl-3',
        // Text field: right half of the pill.
        '[&_.react-international-phone-input]:min-w-0 [&_.react-international-phone-input]:flex-1 [&_.react-international-phone-input]:w-full',
        '[&_.react-international-phone-input]:h-9 [&_.react-international-phone-input]:rounded-r-full',
        '[&_.react-international-phone-input]:border-0 [&_.react-international-phone-input]:bg-transparent',
        '[&_.react-international-phone-input]:pr-4 [&_.react-international-phone-input]:outline-none',
        // Country dropdown popover.
        '[&_.react-international-phone-country-selector-dropdown]:rounded-2xl [&_.react-international-phone-country-selector-dropdown]:border',
        '[&_.react-international-phone-country-selector-dropdown]:shadow-lg',
        className,
      )}
    />
  )
}

export { PhoneInput }
export type { PhoneInputProps }
