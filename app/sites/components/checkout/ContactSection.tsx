"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Phone } from "lucide-react";
import { PhoneInput } from "@/components/ui/phone-input";
import { isValidPhone, formatPhoneForDisplay, normalizePhone } from "@/lib/phone";

interface ContactSectionProps {
  isAuthenticated: boolean;
  customerPhone?: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  emailOptIn: boolean;
  smsOptIn: boolean;
  onFirstNameChange: (v: string) => void;
  onLastNameChange: (v: string) => void;
  onEmailChange: (v: string) => void;
  onPhoneChange: (v: string) => void;
  onEmailOptInChange: (v: boolean) => void;
  onSmsOptInChange: (v: boolean) => void;
  onSignInClick: () => void;
  onSignUpClick?: () => void;
}

export function ContactSection({
  isAuthenticated,
  customerPhone,
  firstName,
  lastName,
  email,
  phone,
  emailOptIn,
  smsOptIn,
  onFirstNameChange,
  onLastNameChange,
  onEmailChange,
  onPhoneChange,
  onEmailOptInChange,
  onSmsOptInChange,
  onSignInClick,
  onSignUpClick,
}: ContactSectionProps) {
  const [touched, setTouched] = useState({ firstName: false, email: false, phone: false });

  const firstNameError = touched.firstName && firstName.trim().length === 0 ? "First name is required" : null;
  const emailError = touched.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? "A valid email is required" : null;
  const phoneError = touched.phone && !customerPhone && !isValidPhone(phone) ? "A valid phone number is required" : null;

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--text)" }}>
        Contact
      </h2>

      {!isAuthenticated && (
        <div
          className="p-4 rounded-lg space-y-3"
          style={{
            backgroundColor: "var(--card)",
            border: "1px solid var(--border)",
          }}
        >
          <div className="flex items-center justify-between">
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Have an account? Sign in for a faster checkout
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={onSignInClick}
              className="hover:bg-transparent active:bg-transparent"
              style={{
                borderColor: "#E5E7EB",
                color: "#6B7280",
                borderRadius: "var(--radius)",
              }}
            >
              Sign In
            </Button>
          </div>
          {onSignUpClick && (
            <div className="flex items-center justify-between pt-1 border-t" style={{ borderColor: "var(--border)" }}>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                New customer? Create an account to track orders
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={onSignUpClick}
                className="hover:bg-transparent active:bg-transparent"
                style={{
                  borderColor: "#E5E7EB",
                  color: "#6B7280",
                  borderRadius: "var(--radius)",
                }}
              >
                Sign Up
              </Button>
            </div>
          )}
        </div>
      )}

      {isAuthenticated && customerPhone ? (
        <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
          <Phone className="h-4 w-4" />
          <span>{formatPhoneForDisplay(customerPhone)}</span>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="checkout-firstname" className="text-sm">
            First Name <span className="text-red-500">*</span>
          </Label>
          <Input
            id="checkout-firstname"
            value={firstName}
            onChange={(e) => onFirstNameChange(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, firstName: true }))}
            placeholder="First name"
            style={{
              borderColor: firstNameError ? "#ef4444" : "var(--border)",
              backgroundColor: "var(--bg)",
            }}
          />
          {firstNameError && <p className="text-xs text-red-500">{firstNameError}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="checkout-lastname" className="text-sm">
            Last Name{" "}
            <span className="text-xs font-normal" style={{ color: "var(--text-secondary)" }}>
              (Optional)
            </span>
          </Label>
          <Input
            id="checkout-lastname"
            value={lastName}
            onChange={(e) => onLastNameChange(e.target.value)}
            placeholder="Last name"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--bg)" }}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="checkout-email" className="text-sm">
          Email <span className="text-red-500">*</span>
        </Label>
        <Input
          id="checkout-email"
          type="email"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, email: true }))}
          placeholder="your@email.com"
          style={{
            borderColor: emailError ? "#ef4444" : "var(--border)",
            backgroundColor: "var(--bg)",
          }}
        />
        {emailError && <p className="text-xs text-red-500">{emailError}</p>}
      </div>

      {(!isAuthenticated || !customerPhone) && (
        <div className="space-y-1.5">
          <Label htmlFor="checkout-phone" className="text-sm">
            Phone <span className="text-red-500">*</span>
          </Label>
          <PhoneInput
            id="checkout-phone"
            value={phone}
            onChange={(e164) => onPhoneChange(normalizePhone(e164) ?? e164)}
            onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
            aria-invalid={!!phoneError}
          />
          {phoneError && <p className="text-xs text-red-500">{phoneError}</p>}
        </div>
      )}

      <div className="space-y-2 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
        <label className="flex items-start gap-2 text-sm cursor-pointer" style={{ color: "var(--text)" }}>
          <input
            type="checkbox"
            checked={emailOptIn}
            onChange={(e) => onEmailOptInChange(e.target.checked)}
            className="mt-0.5"
          />
          <span>Email me a receipt and order updates</span>
        </label>
        <label className="flex items-start gap-2 text-sm cursor-pointer" style={{ color: "var(--text)" }}>
          <input
            type="checkbox"
            checked={smsOptIn}
            onChange={(e) => onSmsOptInChange(e.target.checked)}
            className="mt-0.5"
          />
          <span>Text me order status updates</span>
        </label>
      </div>

      <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
        Fields marked <span className="text-red-500">*</span> are required.
      </p>
    </section>
  );
}
