/**
 * Luqra Reports API — typed payloads.
 *
 * MONEY QUIRKS (verified against sample payloads — do not normalize away):
 *  - /reports/transactions: `transactionAmount` is INTEGER CENTS.
 *      e.g. 23238 -> $232.38. Use `normalizeLuqraTxnAmount`.
 *  - /reports/chargebacks: `merchAmount`, `caseAmount` are
 *      DECIMAL-STRING DOLLARS. e.g. "30.14" -> 30.14. Use Number(x).
 */

export interface LuqraTransaction {
    transactionDate: string
    originalTransactionDate: string
    authorizationNumber: string
    terminalId: string
    posEntryMode: string
    /** Integer cents — divide by 100 to get dollars. */
    transactionAmount: number
    cardType: string
    accountNumberFirst6: string
    accountNumberLast4: string
    rejectReason: string
    debitCreditIndicator: 'D' | 'C' | string
    batchId: string
    mid: string
    doingBusinessAs: string
    legalBusinessName: string
    'TransactionCode.code': string
    'TransactionCode.description': string
}

export interface LuqraTransactionsResponse {
    status: 'ok' | string
    data: {
        data: LuqraTransaction[]
        totalCount?: string | number
        offset?: number
        limit?: number
    }
}

export interface LuqraChargebackHistoryEntry {
    id: number
    status: string
    caseType: number
    itemType: number
    statusId: number
    caseNumber: number
    dateLoaded: string
    recordType: string | null
    debitCredit: 'D' | 'C' | string
    /** Numeric — already dollars. */
    merchAmount: number
    resolutionTo: string | null
}

export interface LuqraChargeback {
    latestMerchantResponse: string | null
    applicationId: string
    doingBusinessAs: string
    id: number
    bin: string
    mid: string
    acquirerReferenceNumber: string
    caseNumber: string
    lastDateLoaded: string
    dateLoaded: string
    debitCredit: 'D' | 'C' | string
    /** Decimal-string dollars — Number(x). */
    merchAmount: string
    caseType: number
    itemType: number
    resolutionTo: string | null
    recordType: string | null
    visaRdrIndicator: string | null
    reasonCode: string
    cardBrand: number
    /** Decimal-string dollars. */
    caseAmount: string
    reasonDesc: string
    transId: string
    dateTransaction: string
    cardholderAccountNumber: string
    authCode: string
    currentStatus: string
    disputeType: string
    isReversal: 'Yes' | 'No' | string
    reasonCodeName: string
    status: number
    count: string
    history: LuqraChargebackHistoryEntry[]
}

export interface LuqraChargebacksResponse {
    status: 'ok' | string
    data: {
        data: LuqraChargeback[]
        totalCount?: string | number
        offset?: number
        limit?: number
        cbAmount: number
        cbCount: number
        rdrCbAmount: number
        rdrCbCount: number
        mcTransactionAmount: number
        mcTransactionCount: number
        totalCbAmount: number
        totalCbCount: number
        totalCbAmountRatio: number
        totalCbCountRatio: number
        allTransactionAmount: number
        allTransactionCount: number
        allExceptMcTransactionAmount: number
        allExceptMcTransactionCount: number
        totalMcCbAmount: number
        totalMcCbCount: number
        totalVisaCbAmountWithoutRdr: number
        totalVisaCbCountWithoutRdr: number
        totalAllExceptMcCbAmount: number
        totalAllExceptMcCbCount: number
    }
}

export function normalizeLuqraTxnAmount(cents: number): number {
    return Math.round(cents) / 100
}

// ---------------------------------------------------------------------------
// Deposits
// ---------------------------------------------------------------------------

/** Row from /api/v1/reports/deposits/details (one per deposit). */
export interface LuqraDepositDetail {
    /** Composite: <YYYY-MM-DD><referenceNumber>. Stable PK. */
    id: string
    mid: string
    depositDate: string
    referenceNumber: string
    chargebackCaseNumber: string | null
    routingNumber: number | string
    /** Masked (e.g. "******2954"). */
    ddaNumber: string
    /** Decimal-string dollars on this endpoint. Number(x) directly. */
    batchTotal: string
    dailyFees: string
    chargeBackAmount: string
    reservedFunds: string
    adjustmentAmount: string
    netBatches: string
    netDeposit: string
    splitFundingAmount: number
    doingBusinessAs: string
}

export interface LuqraDepositDetailsResponse {
    status: 'ok' | string
    data: LuqraDepositDetail[]
}

/** Row from /api/v1/reports/deposits (rolled-up day summary). */
export interface LuqraDepositListEntry {
    mid: string
    depositDate: string
    statementDate: string
    /** Decimal-string dollars on this endpoint. */
    depositAmount: string
    ddaNumber: string
    depositCpyDayDetails: Array<{
        id: string
        mid: string
        depositDate: string
        statementDate: string
        routingNumber: number | string
        ddaNumber: string
        depositAmount: number
    }>
    doingBusinessAs: string
    count: string
}

export interface LuqraDepositListResponse {
    status: 'ok' | string
    data: {
        data: LuqraDepositListEntry[]
        totalCount?: string | number
        offset?: number
        limit?: number
    }
}

// ---------------------------------------------------------------------------
// Batches
// ---------------------------------------------------------------------------

/**
 * Row from /api/v1/reports/batches.
 *
 * MONEY: integer cents (matches /reports/transactions). Divide by 100.
 */
export interface LuqraBatchFlattenDetails {
    visaSalesAmount: number
    visaTransactionsCount: number
    mastercardSalesAmount: number
    mastercardTransactionsCount: number
    amexSalesAmount: number
    amexTransactionsCount: number
    discoverSalesAmount: number
    discoverTransactionsCount: number
    ebtSalesAmount: number
    ebtTransactionsCount: number
    pinSalesAmount: number
    pinTransactionsCount: number
}

export interface LuqraBatch {
    /** Same id as luqra_transactions.batchId. */
    id: string
    netDeposit: number
    batchDate: string
    statementDate: string
    /** Trailing digits of deposits.referenceNumber (no leading zeros). */
    merchantReferenceNumber: string
    rejectReason: string
    transactionsCount: number
    mid: string
    batchedAmount: number
    approvedBatches: number
    hasDuplicateRejectsWithin30Days: number | boolean
    creditsAmount: number
    rejectsAmount: number
    details: unknown
    doingBusinessAs: string
    count: string
    flattenDetails: LuqraBatchFlattenDetails
}

export interface LuqraBatchesResponse {
    status: 'ok' | string
    data: {
        data: LuqraBatch[]
        totalCount?: string | number
        offset?: number
        limit?: number
        grossSumAmount?: string
        netSumAmount?: string
        creditsAmount?: string
    }
}
