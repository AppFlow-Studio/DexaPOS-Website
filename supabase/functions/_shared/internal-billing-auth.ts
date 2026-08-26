const encoder = new TextEncoder()

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.digest('SHA-256', encoder.encode(value)),
  )
}

async function secretsMatch(left: string, right: string): Promise<boolean> {
  const [leftDigest, rightDigest] = await Promise.all([
    digest(left),
    digest(right),
  ])

  let difference = 0
  for (let index = 0; index < leftDigest.length; index += 1) {
    difference |= leftDigest[index] ^ rightDigest[index]
  }

  return difference === 0
}

export async function isAuthorizedInternalBillingRequest(
  request: Request,
): Promise<boolean> {
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() ?? ''
  const internalSecret =
    Deno.env.get('INTERNAL_NOTIFICATION_SECRET')?.trim() ?? ''
  const authorization = request.headers.get('authorization')?.trim() ?? ''
  const bearerToken = authorization.toLowerCase().startsWith('bearer ')
    ? authorization.slice(7).trim()
    : ''
  const providedInternalSecret =
    request.headers.get('x-internal-secret')?.trim() ?? ''

  if (
    serviceRoleKey &&
    bearerToken &&
    (await secretsMatch(bearerToken, serviceRoleKey))
  ) {
    return true
  }

  return Boolean(
    internalSecret &&
      providedInternalSecret &&
      (await secretsMatch(providedInternalSecret, internalSecret)),
  )
}

