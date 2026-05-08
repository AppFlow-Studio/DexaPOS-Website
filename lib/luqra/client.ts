import 'server-only'

import {
    LuqraBatchesResponse,
    LuqraChargebacksResponse,
    LuqraDepositDetailsResponse,
    LuqraDepositListResponse,
    LuqraTransactionsResponse,
} from './types'

export type LuqraResult<T> =
    | { data: T; error?: undefined }
    | { data?: undefined; error: string; status?: number }

interface FetchOpts {
    mid: string
    page?: number
    /**
     * Upper bound on rows per page. There is no hard server cap at 20 — high
     * counts just time out. Either set a date range (so the dataset is small)
     * or pick a sensible count. The client clamps to LUQRA_MAX_COUNT to avoid
     * accidental full-history pulls.
     */
    count?: number
    orderBy?: string
    /** ISO date (YYYY-MM-DD). Pairs with dateTo into __between, else __gte. */
    dateFrom?: string
    /** ISO date (YYYY-MM-DD). Pairs with dateFrom into __between, else __lte. */
    dateTo?: string
}

const LUQRA_MAX_COUNT = 200
const LUQRA_DEFAULT_COUNT = 50

function getConfig(): { url: string; apiKey: string } | { error: string } {
    const url = process.env.LUQRA_API_URL
    const apiKey = process.env.LUQRA_API_KEY
    if (!url || !apiKey) {
        return { error: 'luqra_not_configured' }
    }
    return { url: url.replace(/\/$/, ''), apiKey }
}

async function luqraGet<T>(path: string, search: URLSearchParams): Promise<LuqraResult<T>> {
    const cfg = getConfig()
    if ('error' in cfg) return { error: cfg.error }

    const fullUrl = `${cfg.url}${path}?${search.toString()}`

    let response: Response
    try {
        response = await fetch(fullUrl, {
            method: 'GET',
            headers: {
                'x-api-key': cfg.apiKey,
                'accept': 'application/json',
            },
            // Reports are not cacheable per-call from Next's POV; rely on React Query cache.
            cache: 'no-store',
        })
    } catch (err) {
        console.error('[luqra] network error', err)
        return { error: 'luqra_network_error' }
    }

    if (!response.ok) {
        const body = await response.text().catch(() => '')
        console.error('[luqra] non-ok', response.status, body.slice(0, 500))
        return { error: `luqra_http_${response.status}`, status: response.status }
    }

    let json: unknown
    try {
        json = await response.json()
    } catch (err) {
        console.error('[luqra] invalid json', err)
        return { error: 'luqra_invalid_json' }
    }

    return { data: json as T }
}

export function getLuqraTransactions(
    opts: FetchOpts
): Promise<LuqraResult<LuqraTransactionsResponse>> {
    const params = new URLSearchParams({
        page: String(opts.page ?? 1),
        count: String(Math.min(opts.count ?? LUQRA_DEFAULT_COUNT, LUQRA_MAX_COUNT)),
        order_by: opts.orderBy ?? '-originalTransactionDate',
        mid__eq: opts.mid,
    })
    if (opts.dateFrom && opts.dateTo) {
        params.set('originalTransactionDate__between', `${opts.dateFrom},${opts.dateTo}`)
    } else if (opts.dateFrom) {
        params.set('originalTransactionDate__gte', opts.dateFrom)
    } else if (opts.dateTo) {
        params.set('originalTransactionDate__lte', opts.dateTo)
    }
    return luqraGet<LuqraTransactionsResponse>('/api/v1/reports/transactions', params)
}

export function getLuqraChargebacks(
    opts: FetchOpts
): Promise<LuqraResult<LuqraChargebacksResponse>> {
    const params = new URLSearchParams({
        page: String(opts.page ?? 1),
        count: String(Math.min(opts.count ?? LUQRA_DEFAULT_COUNT, LUQRA_MAX_COUNT)),
        order_by: opts.orderBy ?? '-dateLoaded',
        mid__eq: opts.mid,
    })
    if (opts.dateFrom && opts.dateTo) {
        params.set('dateLoaded__between', `${opts.dateFrom},${opts.dateTo}`)
    } else if (opts.dateFrom) {
        params.set('dateLoaded__gte', opts.dateFrom)
    } else if (opts.dateTo) {
        params.set('dateLoaded__lte', opts.dateTo)
    }
    return luqraGet<LuqraChargebacksResponse>('/api/v1/reports/chargebacks', params)
}

export function getLuqraDeposits(
    opts: FetchOpts
): Promise<LuqraResult<LuqraDepositListResponse>> {
    const params = new URLSearchParams({
        page: String(opts.page ?? 1),
        count: String(Math.min(opts.count ?? LUQRA_DEFAULT_COUNT, LUQRA_MAX_COUNT)),
        order_by: opts.orderBy ?? 'depositDate',
        mid__eq: opts.mid,
    })
    if (opts.dateFrom && opts.dateTo) {
        params.set('depositDate__between', `${opts.dateFrom},${opts.dateTo}`)
    } else if (opts.dateFrom) {
        params.set('depositDate__gte', opts.dateFrom)
    } else if (opts.dateTo) {
        params.set('depositDate__lte', opts.dateTo)
    }
    return luqraGet<LuqraDepositListResponse>('/api/v1/reports/deposits', params)
}

export function getLuqraDepositsDetails(
    opts: FetchOpts
): Promise<LuqraResult<LuqraDepositDetailsResponse>> {
    const params = new URLSearchParams({
        page: String(opts.page ?? 1),
        count: String(Math.min(opts.count ?? LUQRA_DEFAULT_COUNT, LUQRA_MAX_COUNT)),
        order_by: opts.orderBy ?? 'depositDate',
        mid__eq: opts.mid,
    })
    if (opts.dateFrom && opts.dateTo) {
        params.set('depositDate__between', `${opts.dateFrom},${opts.dateTo}`)
    } else if (opts.dateFrom) {
        params.set('depositDate__gte', opts.dateFrom)
    } else if (opts.dateTo) {
        params.set('depositDate__lte', opts.dateTo)
    }
    return luqraGet<LuqraDepositDetailsResponse>('/api/v1/reports/deposits/details', params)
}

export function getLuqraBatches(
    opts: FetchOpts
): Promise<LuqraResult<LuqraBatchesResponse>> {
    const params = new URLSearchParams({
        page: String(opts.page ?? 1),
        count: String(Math.min(opts.count ?? LUQRA_DEFAULT_COUNT, LUQRA_MAX_COUNT)),
        order_by: opts.orderBy ?? 'statementDate',
        mid__eq: opts.mid,
    })
    if (opts.dateFrom && opts.dateTo) {
        params.set('statementDate__between', `${opts.dateFrom},${opts.dateTo}`)
    } else if (opts.dateFrom) {
        params.set('statementDate__gte', opts.dateFrom)
    } else if (opts.dateTo) {
        params.set('statementDate__lte', opts.dateTo)
    }
    return luqraGet<LuqraBatchesResponse>('/api/v1/reports/batches', params)
}
