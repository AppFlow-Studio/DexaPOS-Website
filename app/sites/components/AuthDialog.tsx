"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Phone, ArrowLeft, Loader2, User, Mail } from "lucide-react";
import { sendOtp, verifyOtp } from "../auth-actions";
import { updateCustomerProfile } from "../customer-actions";
import { useSession } from "../hooks/useSession";

interface AuthDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  storeConfigId: string;
  onSuccess?: () => void;
}

export function AuthDialog({
  isOpen,
  onOpenChange,
  storeConfigId,
  onSuccess,
}: AuthDialogProps) {
  const [step, setStep] = useState<"phone" | "otp" | "complete-profile">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [pendingAuth, setPendingAuth] = useState<{
    sessionToken: string;
    customer: { id: string; name: string | null; phone: string | null; email: string | null };
  } | null>(null);
  const [profileName, setProfileName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");

  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const { login, setStoreConfigId } = useSession();

  useEffect(() => {
    if (storeConfigId) setStoreConfigId(storeConfigId);
  }, [storeConfigId, setStoreConfigId]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setStep("phone");
      setOtp(["", "", "", "", "", ""]);
      setError("");
      setLoading(false);
      setPendingAuth(null);
      setProfileName("");
      setProfileEmail("");
    }
  }, [isOpen]);

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(formatPhone(e.target.value));
    setError("");
  };

  const rawPhone = phone.replace(/\D/g, "");

  const handleSendOtp = async () => {
    if (rawPhone.length < 10) {
      setError("Please enter a valid phone number");
      return;
    }

    setLoading(true);
    setError("");

    const result = await sendOtp(rawPhone, storeConfigId);
    setLoading(false);

    if (!result.success) {
      setError(result.error ?? "Failed to send code");
      return;
    }

    setStep("otp");
    setCountdown(60);
    setTimeout(() => otpRefs.current[0]?.focus(), 100);
  };

  const handleOtpChange = useCallback(
    (index: number, value: string) => {
      if (value.length > 1) value = value.slice(-1);
      if (value && !/^\d$/.test(value)) return;

      const newOtp = [...otp];
      newOtp[index] = value;
      setOtp(newOtp);
      setError("");

      if (value && index < 5) {
        otpRefs.current[index + 1]?.focus();
      }

      // Auto-submit when all digits filled
      if (value && index === 5 && newOtp.every((d) => d)) {
        handleVerify(newOtp.join(""));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [otp]
  );

  const handleOtpKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    const newOtp = [...otp];
    for (let i = 0; i < pasted.length; i++) {
      newOtp[i] = pasted[i];
    }
    setOtp(newOtp);
    if (pasted.length === 6) {
      handleVerify(pasted);
    } else {
      otpRefs.current[pasted.length]?.focus();
    }
  };

  const handleVerify = async (code?: string) => {
    const fullCode = code ?? otp.join("");
    if (fullCode.length !== 6) {
      setError("Please enter the full 6-digit code");
      return;
    }

    setLoading(true);
    setError("");

    const { sessionToken: existingToken } = useSession.getState();
    const result = await verifyOtp(rawPhone, fullCode, storeConfigId, existingToken ?? undefined);
    setLoading(false);

    if (!result.success || !result.sessionToken || !result.customer) {
      setError(result.error ?? "Verification failed");
      return;
    }

    if (!result.customer.name) {
      // New customer — show profile completion step
      setPendingAuth({
        sessionToken: result.sessionToken,
        customer: {
          id: result.customer.id,
          name: result.customer.name,
          phone: result.customer.phone,
          email: result.customer.email,
        },
      });
      setStep("complete-profile");
    } else {
      // Returning customer — login immediately
      login(result.sessionToken, {
        id: result.customer.id,
        name: result.customer.name,
        phone: result.customer.phone,
        email: result.customer.email,
      });
      onOpenChange(false);
      onSuccess?.();
    }
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    setLoading(true);
    setError("");
    setOtp(["", "", "", "", "", ""]);

    const result = await sendOtp(rawPhone, storeConfigId);
    setLoading(false);

    if (!result.success) {
      setError(result.error ?? "Failed to resend code");
      return;
    }
    setCountdown(60);
  };

  const handleCompleteProfile = async () => {
    if (!pendingAuth || !profileName.trim()) return;

    setLoading(true);
    setError("");

    const result = await updateCustomerProfile(pendingAuth.sessionToken, {
      name: profileName.trim(),
      email: profileEmail.trim() || undefined,
    });

    setLoading(false);

    if (!result.success) {
      setError(result.error ?? "Failed to save profile");
      return;
    }

    login(pendingAuth.sessionToken, {
      ...pendingAuth.customer,
      name: profileName.trim(),
      email: profileEmail.trim() || null,
    });
    onOpenChange(false);
    onSuccess?.();
  };

  const handleSkipProfile = () => {
    if (!pendingAuth) return;
    login(pendingAuth.sessionToken, pendingAuth.customer);
    onOpenChange(false);
    onSuccess?.();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[400px]"
        style={{
          backgroundColor: "var(--card, #fff)",
          color: "var(--text, #111)",
          borderColor: "var(--border, #e5e7eb)",
        }}
      >
        <DialogHeader>
          {step === "otp" && (
            <button
              onClick={() => {
                setStep("phone");
                setOtp(["", "", "", "", "", ""]);
                setError("");
              }}
              className="absolute left-4 top-4 p-1 rounded-full hover:bg-black/5"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <DialogTitle className="text-center">
            {step === "phone"
              ? "Sign In"
              : step === "otp"
                ? "Enter Code"
                : "Welcome! Complete Your Profile"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {step === "phone" ? (
            <>
              <p
                className="text-sm text-center"
                style={{ color: "var(--text-secondary, #6b7280)" }}
              >
                Enter your phone number to continue
              </p>

              <div className="space-y-2">
                <Label htmlFor="auth-phone">Phone Number</Label>
                <div className="relative">
                  <Phone
                    className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
                    style={{ color: "var(--text-secondary, #6b7280)" }}
                  />
                  <Input
                    id="auth-phone"
                    type="tel"
                    value={phone}
                    onChange={handlePhoneChange}
                    placeholder="(555) 123-4567"
                    className="pl-10"
                    onKeyDown={(e) => e.key === "Enter" && handleSendOtp()}
                    autoFocus
                    style={{
                      borderColor: "var(--border, #e5e7eb)",
                      backgroundColor: "var(--bg, #fff)",
                    }}
                  />
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-500 text-center">{error}</p>
              )}

              <Button
                onClick={handleSendOtp}
                disabled={loading || rawPhone.length < 10}
                className="w-full"
                style={{
                  backgroundColor: "var(--primary, #2DD4BF)",
                  color: "#fff",
                  borderRadius: "var(--radius, 12px)",
                }}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                {loading ? "Sending..." : "Send Code"}
              </Button>
            </>
          ) : step === "otp" ? (
            <>
              <p
                className="text-sm text-center"
                style={{ color: "var(--text-secondary, #6b7280)" }}
              >
                We sent a 6-digit code to{" "}
                <span style={{ color: "var(--text, #111)" }}>{phone}</span>
              </p>

              <div className="flex justify-center gap-2" onPaste={handleOtpPaste}>
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => {
                      otpRefs.current[i] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    className="w-11 h-13 text-center text-xl font-semibold rounded-lg border-2 outline-none transition-colors focus:ring-2"
                    style={{
                      borderColor: digit
                        ? "var(--primary, #2DD4BF)"
                        : "var(--border, #e5e7eb)",
                      backgroundColor: "var(--bg, #fff)",
                      color: "var(--text, #111)",
                    }}
                  />
                ))}
              </div>

              {error && (
                <p className="text-sm text-red-500 text-center">{error}</p>
              )}

              <Button
                onClick={() => handleVerify()}
                disabled={loading || otp.some((d) => !d)}
                className="w-full"
                style={{
                  backgroundColor: "var(--primary, #2DD4BF)",
                  color: "#fff",
                  borderRadius: "var(--radius, 12px)",
                }}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                {loading ? "Verifying..." : "Verify"}
              </Button>

              <p
                className="text-sm text-center"
                style={{ color: "var(--text-secondary, #6b7280)" }}
              >
                Didn&apos;t receive a code?{" "}
                {countdown > 0 ? (
                  <span>Resend in {countdown}s</span>
                ) : (
                  <button
                    onClick={handleResend}
                    className="underline font-medium"
                    style={{ color: "var(--primary, #2DD4BF)" }}
                  >
                    Resend
                  </button>
                )}
              </p>
            </>
          ) : (
            <>
              <p
                className="text-sm text-center"
                style={{ color: "var(--text-secondary, #6b7280)" }}
              >
                Just a couple more details to get started
              </p>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="profile-name">Name</Label>
                  <div className="relative">
                    <User
                      className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
                      style={{ color: "var(--text-secondary, #6b7280)" }}
                    />
                    <Input
                      id="profile-name"
                      type="text"
                      value={profileName}
                      onChange={(e) => {
                        setProfileName(e.target.value);
                        setError("");
                      }}
                      placeholder="Your name"
                      className="pl-10"
                      onKeyDown={(e) => e.key === "Enter" && handleCompleteProfile()}
                      autoFocus
                      style={{
                        borderColor: "var(--border, #e5e7eb)",
                        backgroundColor: "var(--bg, #fff)",
                      }}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="profile-email">
                    Email{" "}
                    <span
                      className="text-xs font-normal"
                      style={{ color: "var(--text-secondary, #6b7280)" }}
                    >
                      (optional)
                    </span>
                  </Label>
                  <div className="relative">
                    <Mail
                      className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
                      style={{ color: "var(--text-secondary, #6b7280)" }}
                    />
                    <Input
                      id="profile-email"
                      type="email"
                      value={profileEmail}
                      onChange={(e) => {
                        setProfileEmail(e.target.value);
                        setError("");
                      }}
                      placeholder="email@example.com"
                      className="pl-10"
                      onKeyDown={(e) => e.key === "Enter" && handleCompleteProfile()}
                      style={{
                        borderColor: "var(--border, #e5e7eb)",
                        backgroundColor: "var(--bg, #fff)",
                      }}
                    />
                  </div>
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-500 text-center">{error}</p>
              )}

              <Button
                onClick={handleCompleteProfile}
                disabled={loading || !profileName.trim()}
                className="w-full"
                style={{
                  backgroundColor: "var(--primary, #2DD4BF)",
                  color: "#fff",
                  borderRadius: "var(--radius, 12px)",
                }}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                {loading ? "Saving..." : "Continue"}
              </Button>

              <p className="text-sm text-center">
                <button
                  onClick={handleSkipProfile}
                  className="underline font-medium"
                  style={{ color: "var(--text-secondary, #6b7280)" }}
                >
                  Skip for now
                </button>
              </p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
