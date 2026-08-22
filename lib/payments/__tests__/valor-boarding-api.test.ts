import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildCreateMerchantBody,
  buildCreateStoreBody,
  buildEpiData,
  buildGenerateKeysBody,
  onboardValorMerchant,
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
  it("reads store id + EPI from a nested storeData array", () => {
    expect(
      readStoreAndEpi({
        mp_id: "43919",
        storeData: [{ id: "48779", epiData: [{ epi: "2319991082" }] }],
      })
    ).toEqual({ storeId: "48779", epi: "2319991082" });
  });

  it("descends into a data wrapper", () => {
    expect(
      readStoreAndEpi({
        data: { stores: [{ store_id: "5", epiData: [{ epi: "2000000001" }] }] },
      })
    ).toEqual({ storeId: "5", epi: "2000000001" });
  });
});

describe("onboardValorMerchant", () => {
  const createOk = () => ({
    body: {
      mp_id: "43919",
      newUserId: "72239",
      storeData: [{ id: "48779", epiData: [{ epi: "2319991082" }] }],
    },
  });
  const keysOk = () => ({ body: { appid: "APPID-32-CHARS", appkey: "APPKEY-32-CHARS" } });

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

    expect(result.merchant.valorMerchantId).toBe("43919");
    expect(result.accounts).toHaveLength(1);
    expect(result.failures).toHaveLength(0);
    expect(persist).toHaveBeenCalledOnce();
    expect(persist.mock.calls[0][0]).toMatchObject({
      dexaLocationId: "loc-1",
      valorMerchantId: "43919",
      valorStoreId: "48779",
      valorEpi: "2319991082",
      valorAppId: "APPID-32-CHARS",
      valorAppKey: "APPKEY-32-CHARS",
    });
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
      orphaned: { valorMerchantId: "43919" },
      cleanedUp: true,
    });
    expect(deleteSpy).toHaveBeenCalledOnce();
    expect(persist).not.toHaveBeenCalled();
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
        // The second location's store add returns an unusable EPI.
        return { body: { storeData: [{ id: "99", epiData: [{ epi: "bad" }] }] } };
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
