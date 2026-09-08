/**
 * [C2] Valor environment and endpoint resolution.
 *
 * Doc drift note (all specs re-fetched 2026-08-09). The arch parent records a
 * single sandbox base URL of `https://securelink-staging.valorpaytech.com:4430`.
 * The live docs describe THREE hosts across TWO authentication styles:
 *
 *   1. securelink-staging…:4430  GetClientToken   `/?saleapi=`     body creds
 *   2. securelink-staging…:443   Direct Sale      `/?saleToken`    body creds
 *                                Add Subscription `/?addSub`       body creds
 *                                Hosted Page      `/?hostedpage`   body creds
 *   3. demo.valorpaytech.com     Vault APIs       `/api/valor-vault/…`
 *                                                 HEADER creds
 *   4. vpdemo.valorpaytech.com   Boarding + login `/api/valor/…`
 *                                                 Bearer JWT + isv-secret-key
 *
 * The vault APIs are the odd ones: different domain, REST-style paths, and
 * credentials in `Valor-App-ID` / `Valor-App-Key` headers rather than in the
 * body. Modelled explicitly so no call site has to remember which is which.
 */

/** Only the keys these helpers read; keeps test doubles from needing NODE_ENV. */
export type EnvLike = Record<string, string | undefined>;

export type ValorEnvironment = "sandbox" | "production";
export type ValorSurchargeIndicator = "0" | "1";

const VALOR_PUBLIC_SANDBOX_SURCHARGE_EPI = "2412333540";

export interface ValorEndpoints {
  environment: ValorEnvironment;
  /** GetClientToken host. Sandbox is :4430. */
  clientTokenBaseUrl: string;
  /** Sale / subscription / hosted-page host. Sandbox is :443. */
  transactionBaseUrl: string;
  /** Customer + payment profile vault host. Separate domain, header auth. */
  vaultBaseUrl: string;
  /** ISO login + merchant/store/EPI boarding host. Bearer JWT auth. */
  boardingBaseUrl: string;
  /**
   * Passed to Passage.js as `isDemo`. The browser SDK routes on its own flag,
   * so environment is decided in two places and they must not disagree.
   */
  isDemo: boolean;
}

const SANDBOX_CLIENT_TOKEN_BASE = "https://securelink-staging.valorpaytech.com:4430";
const SANDBOX_TRANSACTION_BASE = "https://securelink-staging.valorpaytech.com:443";
const SANDBOX_VAULT_BASE = "https://demo.valorpaytech.com";
const SANDBOX_BOARDING_BASE = "https://vpdemo.valorpaytech.com";

/** Passage.js v2 SDK. Loaded from Valor's CDN by `passageClient.tsx`. */
export const PASSAGE_JS_V2_URL = "https://js.valorpaytech.com/V2/js/Passage.min.js";

export function readValorEnvironment(
  env: EnvLike = process.env
): ValorEnvironment {
  return env.VALOR_ENV === "production" ? "production" : "sandbox";
}

/**
 * Allow Valor's public sandbox transaction profile, or one explicitly named
 * sandbox EPI, to use its processor-configured surcharge MID. Production and
 * every other account remain card-only.
 */
export function resolveValorSurchargeIndicator(
  epi: string,
  env: EnvLike = process.env
): ValorSurchargeIndicator {
  const qaEpi = env.VALOR_QA_SURCHARGE_EPI?.trim();
  const usesSandboxSurchargeProfile =
    epi === VALOR_PUBLIC_SANDBOX_SURCHARGE_EPI || qaEpi === epi;
  return readValorEnvironment(env) === "sandbox" && usesSandboxSurchargeProfile
    ? "1"
    : "0";
}

/**
 * Resolve the hosts to call.
 *
 * Production hosts are deliberately not hardcoded. Valor's public docs only
 * publish the staging hosts, and inventing a production hostname in a module
 * that moves money is how a live charge ends up pointed somewhere unintended.
 * Production therefore requires `VALOR_BASE_URL` to be set explicitly.
 */
export function resolveValorEndpoints(
  env: EnvLike = process.env
): ValorEndpoints {
  const environment = readValorEnvironment(env);

  if (environment === "production") {
    const base = env.VALOR_BASE_URL?.trim();
    const vaultBase = env.VALOR_VAULT_BASE_URL?.trim();
    const boardingBase = env.VALOR_BOARDING_BASE_URL?.trim();
    if (!base || !vaultBase || !boardingBase) {
      throw new Error(
        "VALOR_ENV=production requires VALOR_BASE_URL, VALOR_VAULT_BASE_URL " +
          "and VALOR_BOARDING_BASE_URL to be set explicitly. Valor's published " +
          "docs only cover demo/staging hosts and the APIs are spread across " +
          "four of them; production hosts must come from Valor, not be guessed."
      );
    }
    const normalized = base.replace(/\/+$/, "");
    return {
      environment,
      clientTokenBaseUrl: normalized,
      transactionBaseUrl: normalized,
      vaultBaseUrl: vaultBase.replace(/\/+$/, ""),
      boardingBaseUrl: boardingBase.replace(/\/+$/, ""),
      isDemo: false,
    };
  }

  return {
    environment,
    clientTokenBaseUrl: SANDBOX_CLIENT_TOKEN_BASE,
    transactionBaseUrl: SANDBOX_TRANSACTION_BASE,
    vaultBaseUrl: SANDBOX_VAULT_BASE,
    boardingBaseUrl: SANDBOX_BOARDING_BASE,
    isDemo: true,
  };
}

/**
 * The per-merchant Passage.js credential triple.
 *
 * Boarding step 5 (Generate API Keys) produces these, and they ultimately live
 * on `merchant_processor_accounts`. The env-var form exists only for local
 * development against a single fixed test merchant.
 */
export interface ValorMerchantCredentials {
  appId: string;
  appKey: string;
  /** 10-digit identifier beginning with 2. */
  epi: string;
}

export class ValorConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValorConfigError";
  }
}

/** Read the development test-merchant credentials from the environment. */
export function readTestMerchantCredentials(
  env: EnvLike = process.env
): ValorMerchantCredentials {
  const appId = env.VALOR_TEST_APP_ID?.trim();
  const appKey = env.VALOR_TEST_APP_KEY?.trim();
  const epi = env.VALOR_TEST_EPI?.trim();

  if (!appId || !appKey || !epi) {
    throw new ValorConfigError(
      "Missing VALOR_TEST_APP_ID / VALOR_TEST_APP_KEY / VALOR_TEST_EPI"
    );
  }

  return { appId, appKey, epi };
}

/**
 * Validate an EPI's shape.
 *
 * Per [V-DST]: "it's a 10 digit number starts with 2". Cheap to check, and a
 * malformed EPI otherwise surfaces as an opaque gateway rejection.
 */
export function isValidEpi(epi: string): boolean {
  return /^2\d{9}$/.test(epi);
}

/**
 * Valor caps a single transaction at $99,999.99 ([V-DST]).
 * Expressed in minor units to match the `Money` type.
 */
export const VALOR_MAX_AMOUNT_MINOR = 9_999_999;
