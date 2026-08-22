import { describe, expect, it } from "vitest";
import {
  mapLocationToStore,
  mapMerchantToBoardingDetails,
  missingLocationFields,
  missingMerchantFields,
  readValorAcquirerConfig,
  readValorFeeSchedule,
  type LocationBoardingRow,
  type MerchantBoardingRow,
} from "../valor/boardingConfig";
import { ValorConfigError } from "../valor/config";

const fullMerchant: MerchantBoardingRow = {
  business_legal_name: "Dexa Pos AI LLC",
  dba_name: "Main Street Diner",
  name: "Main Street Diner",
  owner_first_name: "Sam",
  owner_last_name: "Owner",
  owner_email: "sam@example.com",
  owner_phone: "(480) 555-1212",
  business_address_line1: "1 Main St",
  business_city: "Tempe",
  business_state: "az",
  business_postal_code: "85284",
  business_country: "US",
};

const fullLocation: LocationBoardingRow = {
  id: "loc-1",
  name: "Main Street Diner",
  address_line1: "1 Main St",
  city: "Tempe",
  state: "az",
  postal_code: "85284",
  country: "US",
  timezone: "MST",
};

describe("readValorFeeSchedule", () => {
  it("throws naming every missing var", () => {
    let err: unknown;
    try {
      readValorFeeSchedule({});
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ValorConfigError);
    expect((err as Error).message).toContain("VALOR_FEE_SCHEDULE_ID");
    expect((err as Error).message).toContain("VALOR_FEE_DISC_RATE_PERCENT");
    expect((err as Error).message).toContain("VALOR_FEE_RESIDUAL_BPS");
    expect((err as Error).message).toContain("VALOR_FEE_SURCHARGE_PERCENT");
  });

  it("parses a complete schedule", () => {
    expect(
      readValorFeeSchedule({
        VALOR_FEE_SCHEDULE_ID: "FS-1",
        VALOR_FEE_DISC_RATE_PERCENT: "2.9",
        VALOR_FEE_RESIDUAL_BPS: "30",
        VALOR_FEE_SURCHARGE_PERCENT: "0",
      })
    ).toEqual({
      feeScheduleId: "FS-1",
      discRatePercent: 2.9,
      residualBps: 30,
      surchargePercent: 0,
    });
  });
});

describe("readValorAcquirerConfig", () => {
  it("throws when the processor data block is absent", () => {
    expect(() =>
      readValorAcquirerConfig({
        VALOR_BOARDING_CREATE_VARIANT: "FDcardnet",
        VALOR_BOARDING_PROCESSOR: "3",
      })
    ).toThrow(ValorConfigError);
  });

  it("rejects non-JSON processor data", () => {
    expect(() =>
      readValorAcquirerConfig({
        VALOR_BOARDING_CREATE_VARIANT: "FDcardnet",
        VALOR_BOARDING_PROCESSOR: "3",
        VALOR_BOARDING_PROCESSOR_DATA: "not-json",
      })
    ).toThrow(/valid JSON/);
  });

  it("applies defaults for the optional fields", () => {
    const cfg = readValorAcquirerConfig({
      VALOR_BOARDING_CREATE_VARIANT: "FDcardnet",
      VALOR_BOARDING_PROCESSOR: "3",
      VALOR_BOARDING_PROCESSOR_DATA: '{"midFDCard":"123"}',
    });
    expect(cfg.storeVariant).toBe("storeadd");
    expect(cfg.programType).toBe("2");
    expect(cfg.device).toBe("139");
    expect(cfg.processorData).toEqual({ midFDCard: "123" });
  });
});

describe("field mapping + preflight", () => {
  it("normalizes phone + state + zip", () => {
    const details = mapMerchantToBoardingDetails(fullMerchant, "5812");
    expect(details.mobile).toBe("4805551212");
    expect(details.legalState).toBe("AZ");
    expect(details.legalZipCode).toBe("85284");
    expect(details.mccCode).toBe("5812");
  });

  it("uses the merchant owner as the store supervisor", () => {
    const store = mapLocationToStore(fullLocation, fullMerchant);
    expect(store.superVisorName).toBe("Sam Owner");
    expect(store.superVisorContact).toBe("4805551212");
    expect(store.storeState).toBe("AZ");
  });

  it("reports no gaps for a complete merchant + location", () => {
    expect(missingMerchantFields(fullMerchant)).toEqual([]);
    expect(missingLocationFields(fullLocation, fullMerchant)).toEqual([]);
  });

  it("flags each missing merchant field", () => {
    const gaps = missingMerchantFields({
      ...fullMerchant,
      owner_email: null,
      business_postal_code: "1",
      business_state: "Arizona",
    });
    expect(gaps).toContain("owner email");
    expect(gaps).toContain("business ZIP (5 digits)");
    expect(gaps).toContain("business state (2-letter)");
  });
});
