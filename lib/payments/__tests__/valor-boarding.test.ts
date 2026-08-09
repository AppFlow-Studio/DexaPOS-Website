import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_TOKEN_TTL_MS,
  isTokenValid,
  readBearerToken,
  readTokenExpiry,
  cacheKeyFor,
} from "../valor/auth";
import {
  readAppId,
  readAppKey,
  readEpi,
  readMerchantId,
  readStoreId,
} from "../valor/identifiers";
import {
  assertCompleteFeeSchedule,
  BoardingError,
  runBoarding,
  type BoardingApi,
  type BoardingParams,
} from "../valor/boarding";

const fees = {
  feeScheduleId: "fs-default",
  discRatePercent: 2.75,
  residualBps: 30,
  surchargePercent: 3.5,
};

const params: BoardingParams = {
  merchant: {
    legalName: "Joes Coffee LLC",
    dbaName: "Joes Coffee",
    firstName: "Joe",
    lastName: "Smith",
    emailId: "joe@example.com",
    mobile: "4805550100",
    legalAddress: "1 Main St",
    legalCity: "Tempe",
    legalState: "AZ",
    legalZipCode: "85284",
    mccCode: "5812",
  },
  store: {
    storeName: "Joes Coffee Downtown",
    storeAddress: "1 Main St",
    storeState: "AZ",
    storeZipCode: "85284",
    superVisorName: "Joe Smith",
    superVisorEmail: "joe@example.com",
    superVisorContact: "4805550100",
  },
  fees,
  dexaMerchantId: "merchant-1",
  dexaLocationId: "loc-1",
};

/** Run boarding expecting failure, and return the typed BoardingError. */
async function expectBoardingError(
  run: Promise<unknown>
): Promise<BoardingError> {
  try {
    await run;
  } catch (error) {
    if (error instanceof BoardingError) return error;
    throw error;
  }
  throw new Error("expected boarding to fail, but it succeeded");
}

function happyApi(overrides: Partial<BoardingApi> = {}): BoardingApi {
  return {
    createMerchant: async () => ({ mp_id: "MP1", newUserId: "U1" }),
    createStore: async () => ({ store_id: "ST1" }),
    createEpi: async () => ({ epi: "2000000001" }),
    generateApiKeys: async () => ({ appid: "APPID", appkey: "APPKEY" }),
    deleteMerchant: async () => undefined,
    ...overrides,
  };
}

describe("runBoarding — happy path", () => {
  it("threads each step's identifier into the next call", async () => {
    // Merchant Add's id is Store Add's input, and so on. This chaining is the
    // whole reason the undocumented response shapes matter.
    const seen: unknown[] = [];

    const account = await runBoarding(
      happyApi({
        createStore: async (_p, ctx) => {
          seen.push(ctx);
          return { store_id: "ST1" };
        },
        createEpi: async (_p, ctx) => {
          seen.push(ctx);
          return { epi: "2000000001" };
        },
        generateApiKeys: async (ctx) => {
          seen.push(ctx);
          return { appid: "APPID", appkey: "APPKEY" };
        },
      }),
      params,
      async () => undefined
    );

    expect(seen[0]).toEqual({ merchantId: "MP1", newUserId: "U1" });
    expect(seen[1]).toEqual({
      merchantId: "MP1",
      newUserId: "U1",
      storeId: "ST1",
    });
    expect(seen[2]).toEqual({ epi: "2000000001" });
    expect(account.valorAppKey).toBe("APPKEY");
    expect(account.fees).toEqual(fees);
  });

  it("persists only after every Valor call succeeds", async () => {
    const persist = vi.fn(async () => undefined);
    await runBoarding(happyApi(), params, persist);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("falls back to the merchant id when no separate user id is returned", async () => {
    let seenNewUserId: string | undefined;
    await runBoarding(
      happyApi({
        createMerchant: async () => ({ mp_id: "MP1" }),
        createStore: async (_p, ctx) => {
          seenNewUserId = ctx.newUserId;
          return { store_id: "ST1" };
        },
      }),
      params,
      async () => undefined
    );
    expect(seenNewUserId).toBe("MP1");
  });
});

describe("runBoarding — failure and cleanup", () => {
  it("deletes the Valor merchant when a later step fails", async () => {
    // Steps 2–5 create state no database transaction can roll back, so cleanup
    // has to be explicit or the merchant is orphaned on Valor's side.
    const deleteMerchant = vi.fn(async () => undefined);

    await expect(
      runBoarding(
        happyApi({
          createEpi: async () => {
            throw new Error("boom");
          },
          deleteMerchant,
        }),
        params,
        async () => undefined
      )
    ).rejects.toThrow(BoardingError);

    expect(deleteMerchant).toHaveBeenCalledWith({ merchantId: "MP1" });
  });

  it("reports orphaned identifiers when cleanup is unavailable", async () => {
    // Losing the id of a live Valor merchant makes manual recovery much harder,
    // so it travels with the error.
    const error = await expectBoardingError(
      runBoarding(
        happyApi({
          deleteMerchant: undefined,
          createEpi: async () => {
            throw new Error("boom");
          },
        }),
        params,
        async () => undefined
      )
    );

    expect(error.step).toBe("epi_add");
    expect(error.cleanedUp).toBe(false);
    expect(error.orphaned.valorMerchantId).toBe("MP1");
    expect(error.orphaned.valorStoreId).toBe("ST1");
  });

  it("records cleanup failure rather than swallowing it", async () => {
    const error = await expectBoardingError(
      runBoarding(
        happyApi({
          deleteMerchant: async () => {
            throw new Error("delete failed");
          },
          createStore: async () => {
            throw new Error("boom");
          },
        }),
        params,
        async () => undefined
      )
    );

    expect(error.cleanedUp).toBe(false);
    expect(error.orphaned.valorMerchantId).toBe("MP1");
  });

  it("cleans up when the database write fails after Valor succeeded", async () => {
    // Worst case: Valor state exists and DEXA has no record of it.
    const deleteMerchant = vi.fn(async () => undefined);
    const error = await expectBoardingError(
      runBoarding(happyApi({ deleteMerchant }), params, async () => {
        throw new Error("db down");
      })
    );

    expect(error.step).toBe("persist");
    expect(deleteMerchant).toHaveBeenCalled();
    expect(error.cleanedUp).toBe(true);
  });

  it("rejects an EPI that is not 10 digits starting with 2", async () => {
    // Shape check catches identifiers.ts reading the wrong field, which is the
    // most likely failure on the first live run.
    const error = await expectBoardingError(
      runBoarding(
        happyApi({ createEpi: async () => ({ epi: "999" }) }),
        params,
        async () => undefined
      )
    );

    expect(error.step).toBe("epi_add");
    expect(error.message).toMatch(/readEpi/);
  });

  it("names the probe function to fix when an identifier is missing", async () => {
    const error = await expectBoardingError(
      runBoarding(
        happyApi({ generateApiKeys: async () => ({ appid: "APPID" }) }),
        params,
        async () => undefined
      )
    );

    expect(error.message).toMatch(/readAppKey/);
    expect(error.message).toMatch(/identifiers\.ts/);
  });
});

describe("identifier probes", () => {
  it("reads identifiers nested under a data envelope", () => {
    expect(readMerchantId({ data: { mp_id: "MP9" } })).toBe("MP9");
    expect(readStoreId({ data: { store_id: 42 } })).toBe("42");
  });

  it("returns null instead of guessing", () => {
    expect(readEpi({ unrelated: true })).toBeNull();
    expect(readAppId({})).toBeNull();
    expect(readAppKey({})).toBeNull();
  });
});

describe("assertCompleteFeeSchedule", () => {
  it("requires all four values", () => {
    // Boarding on a partial schedule produces an account row C1's constraint
    // will reject, after the Valor merchant already exists.
    expect(() => assertCompleteFeeSchedule(fees)).not.toThrow();
    expect(() =>
      assertCompleteFeeSchedule({ ...fees, surchargePercent: undefined })
    ).toThrow(/surchargePercent/);
  });

  it("rejects a negative residual", () => {
    expect(() =>
      assertCompleteFeeSchedule({ ...fees, residualBps: -1 })
    ).toThrow(RangeError);
  });
});

describe("bearer token caching", () => {
  it("probes the plausible token field names", () => {
    expect(readBearerToken({ access_token: "T1" })).toBe("T1");
    expect(readBearerToken({ jwt: "T2" })).toBe("T2");
    expect(readBearerToken({ nothing: 1 })).toBeNull();
  });

  it("prefers an explicit expires_in, shaved for safety", () => {
    // A token that expires mid-boarding fails a four-call sequence halfway.
    expect(readTokenExpiry({ expires_in: 3600 }, 0)).toBe(3_240_000);
  });

  it("falls back to the conservative default TTL", () => {
    expect(readTokenExpiry({}, 1000)).toBe(1000 + DEFAULT_TOKEN_TTL_MS);
  });

  it("treats an expired token as invalid", () => {
    expect(isTokenValid({ token: "T", expiresAt: 500 }, 1000)).toBe(false);
    expect(isTokenValid({ token: "T", expiresAt: 2000 }, 1000)).toBe(true);
    expect(isTokenValid(null, 1000)).toBe(false);
  });

  it("keys the cache by office and sub-office", () => {
    // Boarding under the wrong office is the failure Valor's own docs warn
    // about, so tokens must never be shared across offices.
    const a = cacheKeyFor({ mailId: "iso@a.com", subMailId: "u1", passCode: "x" });
    const b = cacheKeyFor({ mailId: "iso@b.com", subMailId: "u1", passCode: "x" });
    expect(a).not.toBe(b);
  });
});
