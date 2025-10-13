export { }

declare global {
  interface CustomJwtSessionClaims {
    "role": string,
    "metadata": string,
    "user_id": string,
    "org_id": string,
    "org_role": string,
    "org_type": string,
    "carrier_id": string
  }
}