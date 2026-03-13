"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Phone } from "lucide-react";

interface ContactSectionProps {
  isAuthenticated: boolean;
  customerPhone?: string | null;
  firstName: string;
  lastName: string;
  email: string;
  onFirstNameChange: (v: string) => void;
  onLastNameChange: (v: string) => void;
  onEmailChange: (v: string) => void;
  onSignInClick: () => void;
}

export function ContactSection({
  isAuthenticated,
  customerPhone,
  firstName,
  lastName,
  email,
  onFirstNameChange,
  onLastNameChange,
  onEmailChange,
  onSignInClick,
}: ContactSectionProps) {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--text)" }}>
        Contact
      </h2>

      {!isAuthenticated && (
        <div
          className="p-4 rounded-lg flex items-center justify-between"
          style={{
            backgroundColor: "var(--card)",
            border: "1px solid var(--border)",
          }}
        >
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Have an account? Sign in for a faster checkout
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={onSignInClick}
            style={{
              borderColor: "var(--primary)",
              color: "var(--primary)",
              borderRadius: "var(--radius)",
            }}
          >
            Sign In
          </Button>
        </div>
      )}

      {isAuthenticated && customerPhone && (
        <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
          <Phone className="h-4 w-4" />
          <span>{customerPhone}</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="checkout-firstname" className="text-sm">
            First Name
          </Label>
          <Input
            id="checkout-firstname"
            value={firstName}
            onChange={(e) => onFirstNameChange(e.target.value)}
            placeholder="First name"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--bg)" }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="checkout-lastname" className="text-sm">
            Last Name
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
          Email
        </Label>
        <Input
          id="checkout-email"
          type="email"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          placeholder="your@email.com"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--bg)" }}
        />
      </div>
    </section>
  );
}
