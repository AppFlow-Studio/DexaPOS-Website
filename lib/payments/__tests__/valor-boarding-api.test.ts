import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildCreateMerchantBody,
  buildCreateStoreBody,
  buildEpiData,
  buildGenerateKeysBody,
  onboardValorMerchant,
  provisionValorLocations,
  readStoreAndEpi,
  type ValorAcquirerConfig,
  type ValorBoardingOptions,
} from "../valor/boardingApi";
import { clearTokenCache, type ValorIsoCredentials } from "../valor/auth";
import { resolveValorEndpoints } from "../valor/config";
import {
  BoardingError,
  type BoardedAccount,
  type BoardingMerchantDetails,
  type BoardingStoreDetails,
  type ValorFeeSchedule,
} from "../valor/boarding";

const merchant: BoardingMerchantDetails = {
  legalName: "Dexa Pos AI LLC",
  dbaName: "Main Street Diner",
  firstName: "Sam",
  lastName: "Owner",
  emailId: "sam@example.com",
  mobile: "4805551212",
  legalAddress: "1 Main St",
  legalCity: "Tempe",
  legalState: "AZ",
  legalZipCode: "85284",
  mccCode: "5812",
};

const store = (name: string): BoardingStoreDetails => ({
  storeName: name,
  storeAddress: "1 Main St",
  storeCity: "Tempe",
  storeState: "AZ",
  storeZipCode: "85284",
  superVisorName: "Sam Owner",
  superVisorEmail: "sam@example.com",
  superVisorContact: "4805551212",
});

const fees: ValorFeeSchedule = {
  feeScheduleId: "FS-DEFAULT",
  discRatePercent: 2.9,
  residualBps: 30,
  surchargePercent: 0,
};

const acquirer: ValorAcquirerConfig = {
  createVariant: "FDcardnet",
  storeVariant: "storeadd",
  processor: "3",
  programType: "2",
  device: "139",
  deviceType: "Soft POS",
  associateUserName: "demovaloriso",
  isvUserName: "DexaISV",
  processorData: { midFDCard: "887000003193", termNoFDCard: "1515" },
};

const iso: ValorIsoCredentials = {
  mailId: "demovaloriso",
  subMailId: "demovaloriso",
  passCode: "secret",
  isvSecretKey: "isv-secret",
};

/** A fetch double routing on URL substring, returning JSON envelopes. */
function makeFetch(
  handlers: Record<string, () => { status?: number; body: unknown }>
) {
  return vi.fn(async (url: string) => {
    for (const [needle, handler] of Object.entries(handlers)) {
      if (url.includes(needle)) {
        const { status = 200, body } = handler();
        return new Response(JSON.stringify(body), { status });
      }
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as unknown as typeof fetch;
}

function options(fetchImpl: typeof fetch): ValorBoardingOptions {
  return {
    credentials: iso,
    acquirer,
    endpoints: resolveValorEndpoints({ VALOR_ENV: "sandbox" }),
    fetchImpl,
    now: () => 1_000_000,
  };
}

beforeEach(() => clearTokenCache());

describe("request builders", () => {
  it("nests store + EPI inside the create body", () => {
    const body = buildCreateMerchantBody(merchant, store("Main"), acquirer, fees, "VT");
    expect(body.legalZipCode).toBe("85284");
    expect(body.programType).toBe("2");
    expect(body.storeData).toHaveLength(1);
    const s = body.storeData[0];
    expect(s.mccCode).toBe("5812");
    expect(s.epiData).toHaveLength(1);
    expect(s.epiData[0].device).toBe("139");
  });

  it("assigns the merchant to the ISV via isv_user_name", () => {
    const body = buildCreateMerchantBody(merchant, store("Main"), acquirer, fees, "VT");
    expect(body.isv_user_name).toEqual(["DexaISV"]);
    // Omitted when no ISV configured.
    const noIsv = buildCreateMerchantBody(
      merchant,
      store("Main"),
      { ...acquirer, isvUserName: undefined },
      fees,
      "VT"
    );
    expect("isv_user_name" in noIsv).toBe(false);
  });

  it("overlays surcharge fields onto the acquirer processorData", () => {
    const epi = buildEpiData(acquirer, store("Main"), fees, "VT");
    const pd = epi.processorData[0] as Record<string, unknown>;
    // acquirer MID preserved, surcharge overlaid, programType stringified
    expect(pd.midFDCard).toBe("887000003193");
    expect(pd.surchargeIndicator).toBe("0");
    expect(pd.surchargePercentage).toBe("0.000");
    expect(pd.programType).toBe("surcharge");
  });

  it("references the parent merchant on createStore", () => {
    const body = buildCreateStoreBody(
      { mpId: "43919", newUserId: "72239" },
      store("Second"),
      acquirer,
      fees,
      "VT",
      "5812"
    );
    expect(body.mp_id).toBe("43919");
    expect(body.newUserId).toBe("72239");
    expect(body.storeData[0].storeName).toBe("Second");
  });

  it("builds the key-generation body from the EPI", () => {
    expect(buildGenerateKeysBody("2319991082", "iso")).toEqual({
      epi: "2319991082",
      associate_user_name: "iso",
    });
  });
});

describe("readStoreAndEpi", () => {
  it("reads store id + EPI from the confirmed storeInfo object shape", () => {
    // Live /create shape (2026-08-23): storeInfo: { "<storeId>": ["<epi>"] }
    expect(
      readStoreAndEpi({
        mpId: 165163,
        storeInfo: { "184231": ["2319991698"] },
      })
    ).toEqual({ storeId: "184231", epi: "2319991698" });
  });

  it("reads the StoreID key returned by /createStore", () => {
    // Live /createStore shape (2026-08-23): StoreID: { "<storeId>": ["<epi>"] }
    expect(
      readStoreAndEpi({
        Mp_id: "165172",
        StoreID: { "184252": ["2319991705"] },
      })
    ).toEqual({ storeId: "184252", epi: "2319991705" });
  });

  it("falls back to a nested storeData array", () => {
    expect(
      readStoreAndEpi({
        mp_id: "43919",
        storeData: [{ id: "48779", epiData: [{ epi: "2319991082" }] }],
      })
    ).toEqual({ storeId: "48779", epi: "2319991082" });
  });

  it("falls back into a data wrapper", () => {
    expect(
      readStoreAndEpi({
        data: { stores: [{ store_id: "5", epiData: [{ epi: "2000000001" }] }] },
      })
    ).toEqual({ storeId: "5", epi: "2000000001" });
  });
});

describe("onboardValorMerchant", () => {
  // Confirmed live sandbox shapes (2026-08-23).
  const createOk = () => ({
    body: {
      status: true,
      message: "User Added Successfully",
      code: 200,
      mpId: 165163,
      newUserId: 233518,
      storeInfo: { "184231": ["2319991698"] },
    },
  });
  const keysOk = () => ({
    body: {
      status: "OK",
      message: "SUCCESS",
      code: 200,
      data: { epi: "2319991698", appid: "APPID-32-CHARS", appkey: "APPKEY-32-CHARS" },
    },
  });

  it("boards a single-location merchant and persists it", async () => {
    const persist = vi.fn(async (_account: BoardedAccount) => {});
    const fetchImpl = makeFetch({
      "login?isotoken": () => ({ body: { token: "jwt" } }),
      "/api/valor/create?": createOk,
      "/api/valor/activateEpi": () => ({ body: {} }),
      "/api/valor/getEpiAppKeyDetails": keysOk,
    });

    const result = await onboardValorMerchant(
      options(fetchImpl),
      merchant,
      fees,
      "dexa-merchant-1",
      [{ store: store("Main"), dexaLocationId: "loc-1", epiLabel: "VT" }],
      persist
    );

    expect(result.merchant.valorMerchantId).toBe("165163");
    expect(result.accounts).toHaveLength(1);
    expect(result.failures).toHaveLength(0);
    expect(persist).toHaveBeenCalledOnce();
    expect(persist.mock.calls[0][0]).toMatchObject({
      dexaLocationId: "loc-1",
      valorMerchantId: "165163",
      valorStoreId: "184231",
      valorEpi: "2319991698",
      valorAppId: "APPID-32-CHARS",
      valorAppKey: "APPKEY-32-CHARS",
    });
  });

  it("surfaces Valor's real error when /create fails (not 'no identifier')", async () => {
    const persist = vi.fn(async () => {});
    const fetchImpl = makeFetch({
      "login?isotoken": () => ({ body: { token: "jwt" } }),
      // Valor failure envelope: status:false + message, only [status,message,code].
      "/api/valor/create?": () => ({
        status: 400,
        body: { status: false, message: "User Name already exist", code: 400 },
      }),
    });

    await expect(
      onboardValorMerchant(options(fetchImpl), merchant, fees, "m1", [
        { store: store("Main"), dexaLocationId: "loc-1" },
      ], persist)
    ).rejects.toMatchObject({
      name: "BoardingError",
      step: "merchant_add",
    });
    await expect(
      onboardValorMerchant(options(fetchImpl), merchant, fees, "m1", [
        { store: store("Main"), dexaLocationId: "loc-1" },
      ], persist)
    ).rejects.toThrow(/User Name already exist/);
    expect(persist).not.toHaveBeenCalled();
  });

  it("collects Valor's per-field validation errors from numeric keys", async () => {
    const persist = vi.fn(async () => {});
    const fetchImpl = makeFetch({
      "login?isotoken": () => ({ body: { token: "jwt" } }),
      "/api/valor/create?": () => ({
        status: 200, // note: HTTP 200 but status:false
        body: {
          "0": "&mid1& Should not be blank for ProcessorData1 of Device1",
          status: false,
          message: "Validation Failed",
          code: 200,
        },
      }),
    });

    await expect(
      onboardValorMerchant(options(fetchImpl), merchant, fees, "m1", [
        { store: store("Main"), dexaLocationId: "loc-1" },
      ], persist)
    ).rejects.toThrow(/Validation Failed[\s\S]*mid1/);
  });

  it("deletes the merchant when key generation fails on the first location", async () => {
    const persist = vi.fn(async () => {});
    const deleteSpy = vi.fn(() => ({ body: {} }));
    const fetchImpl = makeFetch({
      "login?isotoken": () => ({ body: { token: "jwt" } }),
      "/api/valor/create?": createOk,
      "/api/valor/activateEpi": () => ({ body: {} }),
      "/api/valor/getEpiAppKeyDetails": () => ({ status: 200, body: { error_no: "E01" } }),
      "/api/valor/delete": deleteSpy,
    });

    await expect(
      onboardValorMerchant(options(fetchImpl), merchant, fees, "m1", [
        { store: store("Main"), dexaLocationId: "loc-1" },
      ], persist)
    ).rejects.toMatchObject({
      name: "BoardingError",
      step: "generate_api_keys",
      orphaned: { valorMerchantId: "165163" },
      cleanedUp: true,
    });
    expect(deleteSpy).toHaveBeenCalledOnce();
    expect(persist).not.toHaveBeenCalled();
  });

  it("re-provisions an existing merchant without calling /create", async () => {
    const persist = vi.fn(async (_a: BoardedAccount) => {});
    let createCalls = 0;
    const fetchImpl = makeFetch({
      "login?isotoken": () => ({ body: { token: "jwt" } }),
      "/api/valor/create?": () => {
        createCalls += 1;
        return createOk();
      },
      "/api/valor/createStore": () => ({
        body: { status: true, StoreID: { "9001": ["2319990001"] } },
      }),
      "/api/valor/activateEpi": () => ({ body: {} }),
      "/api/valor/getEpiAppKeyDetails": keysOk,
    });

    const result = await provisionValorLocations(
      options(fetchImpl),
      merchant,
      fees,
      "dexa-merchant-1",
      { valorMerchantId: "165163", newUserId: "233518" },
      [{ store: store("Second"), dexaLocationId: "loc-2", epiLabel: "VT" }],
      persist
    );

    expect(createCalls).toBe(0); // never re-creates the merchant
    expect(result.merchant.valorMerchantId).toBe("165163");
    expect(result.accounts).toHaveLength(1);
    expect(result.failures).toHaveLength(0);
    expect(persist.mock.calls[0][0]).toMatchObject({
      dexaLocationId: "loc-2",
      valorMerchantId: "165163",
      valorNewUserId: "233518",
      valorStoreId: "9001",
      valorEpi: "2319990001",
    });
  });

  it("isolates a failing second location without tearing down the merchant", async () => {
    const persist = vi.fn(async () => {});
    const deleteStore = vi.fn(() => ({ body: {} }));
    let createStoreCalls = 0;
    const fetchImpl = makeFetch({
      "login?isotoken": () => ({ body: { token: "jwt" } }),
      "/api/valor/create?": createOk,
      "/api/valor/activateEpi": () => ({ body: {} }),
      "/api/valor/getEpiAppKeyDetails": keysOk,
      "/api/valor/createStore": () => {
        createStoreCalls += 1;
        // The second location's store add returns an unusable EPI (real
        // /createStore uses the StoreID key).
        return { body: { status: true, StoreID: { "99": ["bad"] } } };
      },
      "/api/valor/deletestore": deleteStore,
    });

    const result = await onboardValorMerchant(
      options(fetchImpl),
      merchant,
      fees,
      "m1",
      [
        { store: store("Main"), dexaLocationId: "loc-1" },
        { store: store("Second"), dexaLocationId: "loc-2" },
      ],
      persist
    );

    expect(createStoreCalls).toBe(1);
    expect(result.accounts).toHaveLength(1); // first location survived
    expect(result.accounts[0].dexaLocationId).toBe("loc-1");
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].dexaLocationId).toBe("loc-2");
    expect(result.failures[0].error).toBeInstanceOf(BoardingError);
    expect(deleteStore).toHaveBeenCalledOnce(); // store-level rollback only
  });
});

describe("detailed boarding errors", () => {
  const keysOk = () => ({
    body: {
      status: "OK",
      code: 200,
      data: { epi: "2319991698", appid: "APPID-32-CHARS", appkey: "APPKEY-32-CHARS" },
    },
  });

  it("puts HTTP status, endpoint, username, raw body and a hint on merchant_add", async () => {
    const persist = vi.fn(async () => {});
    const fetchImpl = makeFetch({
      "login?isotoken": () => ({ body: { token: "jwt" } }),
      "/api/valor/create?": () => ({
        status: 400,
        body: { status: false, message: "User Name already exist", code: 400 },
      }),
    });

    const err: unknown = await onboardValorMerchant(
      options(fetchImpl),
      merchant,
      fees,
      "m1",
      [{ store: store("Main"), dexaLocationId: "loc-1" }],
      persist
    ).catch((e) => e);

    expect(err).toBeInstanceOf(BoardingError);
    const message = (err as BoardingError).message;
    expect(message).toContain("HTTP 400");
    expect(message).toContain("User Name already exist");
    expect(message).toContain("endpoint=/api/valor/create?FDcardnet");
    expect(message).toContain("userName=sam@example.com");
    expect(message).toContain("dexaMerchantId=m1");
    expect(message).toContain('Raw: {"status":false'); // truncated dump present
    expect(message).toMatch(/already exists/i); // actionable hint
  });

  it("names the endpoint and the real cause when the request throws", async () => {
    const persist = vi.fn(async () => {});
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes("login?isotoken")) {
        return new Response(JSON.stringify({ token: "jwt" }), { status: 200 });
      }
      if (url.includes("/api/valor/create?")) throw new TypeError("fetch failed");
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    const err: unknown = await onboardValorMerchant(
      options(fetchImpl),
      merchant,
      fees,
      "m1",
      [{ store: store("Main"), dexaLocationId: "loc-1" }],
      persist
    ).catch((e) => e);

    const message = (err as BoardingError).message;
    expect(message).toContain("calling /api/valor/create?FDcardnet");
    expect(message).toContain("TypeError: fetch failed");
  });

  it("surfaces a persist DB error rather than a generic 'persist failed'", async () => {
    const persist = vi.fn(async () => {
      throw new Error("duplicate key value violates unique constraint");
    });
    const deleteSpy = vi.fn(() => ({ body: {} }));
    const fetchImpl = makeFetch({
      "login?isotoken": () => ({ body: { token: "jwt" } }),
      "/api/valor/create?": () => ({
        body: {
          status: true,
          mpId: 165163,
          newUserId: 233518,
          storeInfo: { "184231": ["2319991698"] },
        },
      }),
      "/api/valor/activateEpi": () => ({ body: {} }),
      "/api/valor/getEpiAppKeyDetails": keysOk,
      "/api/valor/delete": deleteSpy,
    });

    const err: unknown = await onboardValorMerchant(
      options(fetchImpl),
      merchant,
      fees,
      "m1",
      [{ store: store("Main"), dexaLocationId: "loc-1" }],
      persist
    ).catch((e) => e);

    expect((err as BoardingError).step).toBe("persist");
    expect((err as BoardingError).message).toContain(
      "duplicate key value violates unique constraint"
    );
  });

  it("puts status, endpoint and store context on a createStore failure", async () => {
    const persist = vi.fn(async () => {});
    const fetchImpl = makeFetch({
      "login?isotoken": () => ({ body: { token: "jwt" } }),
      "/api/valor/createStore?": () => ({
        status: 400,
        body: { status: false, message: "storeCity Required", code: 400 },
      }),
    });

    const result = await provisionValorLocations(
      options(fetchImpl),
      merchant,
      fees,
      "m1",
      { valorMerchantId: "165163", newUserId: "233518" },
      [{ store: store("Second"), dexaLocationId: "loc-2" }],
      persist
    );

    expect(result.failures).toHaveLength(1);
    const message = (result.failures[0].error as BoardingError).message;
    expect(message).toContain("HTTP 400");
    expect(message).toContain("storeCity Required");
    expect(message).toContain("endpoint=/api/valor/createStore?storeadd");
    expect(message).toContain("mp_id=165163");
    expect(message).toContain("store=Second");
  });
});
