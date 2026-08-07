import { describe, expect, it } from "vitest";
import { isSupportMessageMine } from "@/lib/support/message-alignment";

describe("support message group-chat alignment", () => {
  it("places the current viewer's messages on the self side", () => {
    expect(isSupportMessageMine("user_current", "user_current")).toBe(true);
  });

  it("places every other participant on the other side", () => {
    expect(isSupportMessageMine("user_other_admin", "user_current")).toBe(false);
    expect(isSupportMessageMine("user_merchant", "user_current")).toBe(false);
    expect(isSupportMessageMine("user_carrier", "user_current")).toBe(false);
  });

  it("defaults to the other side until viewer identity is available", () => {
    expect(isSupportMessageMine("user_current", undefined)).toBe(false);
  });
});
