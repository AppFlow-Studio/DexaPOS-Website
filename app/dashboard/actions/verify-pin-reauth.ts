"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { signReauthPayload } from "@/lib/pin-reauth";

const REAUTH_TTL_MS = 5 * 60 * 1000;

export async function VerifyPinReauth(
  password: string,
): Promise<{ success: boolean; error?: string }> {
  if (!password) return { success: false, error: "Password is required" };

  const { userId } = await auth();
  if (!userId) return { success: false, error: "Not authenticated" };

  try {
    const clerk = await clerkClient();
    const result = await clerk.users.verifyPassword({ userId, password });
    if (!result.verified) {
      return { success: false, error: "Incorrect password" };
    }
  } catch {
    return { success: false, error: "Incorrect password" };
  }

  const ts = Date.now();
  const sig = signReauthPayload(userId, ts);
  const cookieStore = await cookies();
  cookieStore.set("pin_reauth", `${userId}:${ts}:${sig}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: REAUTH_TTL_MS / 1000,
    path: "/",
  });

  return { success: true };
}
