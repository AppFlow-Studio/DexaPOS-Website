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
import { toast } from "sonner";
import { sendOtp, verifyOtp } from "../auth-actions";
import { updateCustomerProfile } from "../customer-actions";
import { useSession } from "../hooks/useSession";
import { PhoneInput } from "@/components/ui/phone-input";
import { normalizePhone, isValidPhone } from "@/lib/phone";

interface AuthDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  storeConfigId: string;
  onSuccess?: () => void;
  defaultMode?: "signin" | "signup";
}

export function AuthDialog({
  isOpen,
  onOpenChange,
  storeConfigId,
  onSuccess,
  defaultMode = "signin",
}: AuthDialogProps) {
  const [mode, setMode] = useState<"signin" | "signup">(defaultMode);
  const [step, setStep] = useState<"phone" | "otp" | "complete-profile">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [rateLimited, setRateLimited] = useState(false);
  const [pendingAuth, setPendingAuth] = useState<{
    sessionToken: string;
    customer: { id: string; name: string | null; phone: string | null; email: string | null };
  } | null>(null);
  const [profileName, setProfileName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");

  // Sign-up pre-collected fields
  const [signupFirstName, setSignupFirstName] = useState("");
  const [signupLastName, setSignupLastName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");

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
      setMode(defaultMode);
      setStep("phone");
      setOtp(["", "", "", "", "", ""]);
      setError("");
      setLoading(false);
      setCountdown(0);
      setRateLimited(false);
      setPendingAuth(null);
      setProfileName("");
      setProfileEmail("");
      setSignupFirstName("");
      setSignupLastName("");
      setSignupEmail("");
    }
  }, [isOpen, defaultMode]);

  const e164Phone = normalizePhone(phone)

  const handleSendOtp = async () => {
    if (!isValidPhone(phone)) {
      setError("Please enter a valid phone number");
      return;
    }

    if (mode === "signup") {
      if (!signupFirstName.trim()) {
        setError("Please enter your first name");
        return;
      }
      if (!signupLastName.trim()) {
        setError("Please enter your last name");
        return;
      }
    }

    setLoading(true);
    setError("");

    const result = await sendOtp(e164Phone ?? phone, storeConfigId);
    setLoading(false);

    if (!result.success) {
      if (result.code === "rate_limited_phone" || result.code === "rate_limited_ip") {
        setRateLimited(true);
        // Stay on phone step so they see the error clearly, not a frozen OTP screen.
        setError(
          result.code === "rate_limited_phone"
            ? "Too many codes sent to this number. Please wait an hour before trying again."
            : "Too many requests from your network. Please wait an hour before trying again."
        );
      } else {
        setError(result.error ?? "Failed to send code");
      }
      return;
    }

    setRateLimited(false);
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
    const result = await verifyOtp(e164Phone ?? phone, fullCode, storeConfigId, existingToken ?? undefined);
    setLoading(false);

    if (!result.success || !result.sessionToken || !result.customer) {
      if (result.code === "max_attempts") {
        // Code is burned — force back to phone step so they request a new one.
        setError("Too many incorrect attempts. Please request a new code.");
        setStep("phone");
        setOtp(["", "", "", "", "", ""]);
        setCountdown(0);
      } else if (result.code === "expired") {
        setError("That code has expired. Please request a new one.");
        setStep("phone");
        setOtp(["", "", "", "", "", ""]);
        setCountdown(0);
      } else if (result.remainingAttempts !== undefined && result.remainingAttempts > 0) {
        setError(
          `Incorrect code — ${result.remainingAttempts} attempt${result.remainingAttempts === 1 ? "" : "s"} remaining.`
        );
      } else {
        setError(result.error ?? "Verification failed");
      }
      return;
    }

    // Sign-up mode: auto-save the pre-collected profile info
    if (mode === "signup" && signupFirstName.trim()) {
      const fullName = [signupFirstName.trim(), signupLastName.trim()].filter(Boolean).join(" ");
      setLoading(true);
      const profileResult = await updateCustomerProfile(result.sessionToken, {
        name: fullName,
        email: signupEmail.trim() || undefined,
      });
      setLoading(false);

      login(result.sessionToken, {
        id: result.customer.id,
        name: profileResult.success ? fullName : result.customer.name,
        phone: result.customer.phone,
        email: profileResult.success && signupEmail.trim() ? signupEmail.trim() : result.customer.email,
      });
      toast.success(`Welcome, ${signupFirstName.trim()}!`);
      onOpenChange(false);
      onSuccess?.();
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
    if (countdown > 0 || rateLimited) return;
    setLoading(true);
    setError("");
    setOtp(["", "", "", "", "", ""]);

    const result = await sendOtp(e164Phone ?? phone, storeConfigId);
    setLoading(false);

    if (!result.success) {
      if (result.code === "rate_limited_phone" || result.code === "rate_limited_ip") {
        setRateLimited(true);
        setError(
          result.code === "rate_limited_phone"
            ? "Too many codes sent to this number. Please wait an hour before trying again."
            : "Too many requests from your network. Please wait an hour before trying again."
        );
      } else {
        setError(result.error ?? "Failed to resend code");
      }
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

  const inputStyle = {
    borderColor: "var(--border, #e5e7eb)",
    backgroundColor: "var(--bg, #fff)",
  };

  const primaryButtonStyle = {
    backgroundColor: "var(--primary, #2DD4BF)",
    color: "#fff",
    borderRadius: "var(--radius, 12px)",
  };

  const getTitle = () => {
    if (step === "otp") return "Enter Code";
    if (step === "complete-profile") return "Welcome! Complete Your Profile";
    return mode === "signup" ? "Create Account" : "Sign In";
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        elevation="above-sheet"
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
          <DialogTitle className="text-center">{getTitle()}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Mode tabs — only show on the phone entry step */}
          {step === "phone" && (
            <div
              className="flex rounded-lg overflow-hidden border"
              style={{ borderColor: "var(--border, #e5e7eb)" }}
            >
              {(["signin", "signup"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setMode(m);
                    setError("");
                  }}
                  className="flex-1 py-2 text-sm font-medium transition-colors"
                  style={{
                    backgroundColor:
                      mode === m ? "var(--primary, #2DD4BF)" : "transparent",
                    color: mode === m ? "#fff" : "var(--text-secondary, #6b7280)",
                  }}
                >
                  {m === "signin" ? "Sign In" : "Create Account"}
                </button>
              ))}
            </div>
          )}

          {step === "phone" ? (
            <>
              <p
                className="text-sm text-center"
                style={{ color: "var(--text-secondary, #6b7280)" }}
              >
                {mode === "signup"
                  ? "Create your account to track orders and save addresses"
                  : "Enter your phone number to continue"}
              </p>

              {/* Sign-up extra fields */}
              {mode === "signup" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="signup-firstname">First Name <span className="text-red-500">*</span></Label>
                      <div className="relative">
                        <User
                          className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
                          style={{ color: "var(--text-secondary, #6b7280)" }}
                        />
                        <Input
                          id="signup-firstname"
                          type="text"
                          value={signupFirstName}
                          onChange={(e) => { setSignupFirstName(e.target.value); setError(""); }}
                          placeholder="First name"
                          className="pl-10"
                          style={inputStyle}
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="signup-lastname">Last Name <span className="text-red-500">*</span></Label>
                      <Input
                        id="signup-lastname"
                        type="text"
                        value={signupLastName}
                        onChange={(e) => { setSignupLastName(e.target.value); setError(""); }}
                        placeholder="Last name"
                        style={inputStyle}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="signup-email">
                      Email{" "}
                      <span className="text-xs font-normal" style={{ color: "var(--text-secondary, #6b7280)" }}>
                        (optional)
                      </span>
                    </Label>
                    <div className="relative">
                      <Mail
                        className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
                        style={{ color: "var(--text-secondary, #6b7280)" }}
                      />
                      <Input
                        id="signup-email"
                        type="email"
                        value={signupEmail}
                        onChange={(e) => { setSignupEmail(e.target.value); setError(""); }}
                        placeholder="email@example.com"
                        className="pl-10"
                        style={inputStyle}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="auth-phone">Phone Number <span className="text-red-500">*</span></Label>
                <PhoneInput
                  id="auth-phone"
                  value={phone}
                  onChange={(e164) => { setPhone(e164); setError(""); }}
                />
              </div>

              {error && (
                <p className="text-sm text-red-500 text-center">{error}</p>
              )}

              <Button
                onClick={handleSendOtp}
                disabled={loading || !isValidPhone(phone)}
                className="w-full"
                style={primaryButtonStyle}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                {loading ? "Sending..." : "Send Verification Code"}
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
                    autoComplete={i === 0 ? "one-time-code" : "off"}
                    aria-label={`Digit ${i + 1} of 6`}
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
                style={primaryButtonStyle}
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
                {rateLimited ? (
                  <span>Try again in 1 hour</span>
                ) : countdown > 0 ? (
                  <span>Resend in {countdown}s</span>
                ) : (
                  <button
                    onClick={handleResend}
                    disabled={loading}
                    className="underline font-medium disabled:opacity-50"
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
                      style={inputStyle}
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
                      style={inputStyle}
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
                style={primaryButtonStyle}
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
