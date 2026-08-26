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
  boardMerchant,
  BoardingError,
  onboardMerchant,
  provisionLocation,
  runBoarding,
  type BoardingApi,
  type BoardingParams,
  type LocationInput,
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
    storeCity: "Tempe",
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

describe("boardMerchant", () => {
  it("returns the merchant context, falling newUserId back to the merchant id", async () => {
    const ctx = await boardMerchant(
      happyApi({ createMerchant: async () => ({ mp_id: "MP1" }) }),
      params
    );
    expect(ctx).toEqual({ valorMerchantId: "MP1", newUserId: "MP1" });
  });

  it("wraps a Merchant Add transport failure as BoardingError(merchant_add)", async () => {
    const error = await expectBoardingError(
      boardMerchant(
        happyApi({
          createMerchant: async () => {
            throw new Error("boom");
          },
        }),
        params
      )
    );
    expect(error.step).toBe("merchant_add");
  });

  it("names readMerchantId when the merchant id is missing", async () => {
    await expect(
      boardMerchant(happyApi({ createMerchant: async () => ({ nothing: true }) }), params)
    ).rejects.toThrow(/readMerchantId/);
  });
});

const merchantCtx = { valorMerchantId: "MP1", newUserId: "U1" };

describe("provisionLocation", () => {
  it("provisions a store + EPI under the shared merchant and persists once", async () => {
    const persist = vi.fn(async () => undefined);
    const account = await provisionLocation(happyApi(), merchantCtx, params, persist);
    expect(account.valorMerchantId).toBe("MP1");
    expect(account.valorStoreId).toBe("ST1");
    expect(account.valorEpi).toBe("2000000001");
    expect(account.dexaLocationId).toBe("loc-1");
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("rolls back the STORE, not the merchant, when EPI Add fails", async () => {
    // The merchant is shared across every location, so per-location failure must
    // never delete it — only the store this location just created.
    const deleteStore = vi.fn(async () => undefined);
    const deleteMerchant = vi.fn(async () => undefined);
    const error = await expectBoardingError(
      provisionLocation(
        happyApi({
          createEpi: async () => {
            throw new Error("boom");
          },
          deleteStore,
          deleteMerchant,
        }),
        merchantCtx,
        params,
        async () => undefined
      )
    );
    expect(error.step).toBe("epi_add");
    expect(deleteStore).toHaveBeenCalledWith({ merchantId: "MP1", storeId: "ST1" });
    expect(deleteMerchant).not.toHaveBeenCalled();
    expect(error.orphaned.valorStoreId).toBe("ST1");
    expect(error.orphaned.valorMerchantId).toBeUndefined();
  });

  it("cleans up the store when the database write fails", async () => {
    const deleteStore = vi.fn(async () => undefined);
    const error = await expectBoardingError(
      provisionLocation(happyApi({ deleteStore }), merchantCtx, params, async () => {
        throw new Error("db down");
      })
    );
    expect(error.step).toBe("persist");
    expect(deleteStore).toHaveBeenCalled();
    expect(error.cleanedUp).toBe(true);
  });
});

describe("onboardMerchant — one merchant, many locations", () => {
  const locations: LocationInput[] = [
    { store: { ...params.store, storeName: "Loc A" }, dexaLocationId: "loc-a" },
    { store: { ...params.store, storeName: "Loc B" }, dexaLocationId: "loc-b" },
    { store: { ...params.store, storeName: "Loc C" }, dexaLocationId: "loc-c" },
  ];

  it("boards the merchant ONCE and provisions every location under it", async () => {
    const createMerchant = vi.fn(async () => ({ mp_id: "MP1", newUserId: "U1" }));
    let s = 0;
    let e = 0;
    const persist = vi.fn(async () => undefined);

    const result = await onboardMerchant(
      {
        createMerchant,
        createStore: async () => ({ store_id: `ST${++s}` }),
        createEpi: async () => ({ epi: "200000001" + String(++e) }),
        generateApiKeys: async () => ({ appid: "APPID", appkey: "APPKEY" }),
        deleteStore: async () => undefined,
      },
      params,
      locations,
      persist
    );

    expect(createMerchant).toHaveBeenCalledTimes(1); // one Valor merchant, not three
    expect(result.failures).toHaveLength(0);
    expect(result.accounts).toHaveLength(3);
    expect(result.accounts.every((a) => a.valorMerchantId === "MP1")).toBe(true);
    expect(result.accounts.map((a) => a.dexaLocationId)).toEqual([
      "loc-a",
      "loc-b",
      "loc-c",
    ]);
    expect(persist).toHaveBeenCalledTimes(3);
  });

  it("isolates a failing location — merchant and other locations survive", async () => {
    let s = 0;
    let e = 0;
    const deleteMerchant = vi.fn(async () => undefined);

    const result = await onboardMerchant(
      {
        createMerchant: async () => ({ mp_id: "MP1", newUserId: "U1" }),
        createStore: async () => ({ store_id: `ST${++s}` }),
        createEpi: async () => {
          e += 1;
          if (e === 2) throw new Error("epi boom for location B");
          return { epi: "200000001" + String(e) };
        },
        generateApiKeys: async () => ({ appid: "APPID", appkey: "APPKEY" }),
        deleteMerchant,
        deleteStore: async () => undefined,
      },
      params,
      locations,
      async () => undefined
    );

    expect(result.accounts.map((a) => a.dexaLocationId)).toEqual(["loc-a", "loc-c"]);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].dexaLocationId).toBe("loc-b");
    expect(deleteMerchant).not.toHaveBeenCalled(); // shared merchant preserved
  });

  it("requires at least one location", async () => {
    await expect(
      onboardMerchant(happyApi(), params, [], async () => undefined)
    ).rejects.toThrow(/at least one location/);
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
