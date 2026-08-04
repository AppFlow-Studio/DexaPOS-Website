import { describe, expect, it } from 'vitest'

import { selectHqOrganization } from '@/lib/admin/hq-identity'

const HQ_ORG_ID = 'org_hq'

describe('selectHqOrganization', () => {
  it('selects the HQ organization when a merchant membership is first', () => {
    const hqOrganization = {
      name: 'Dexa POS HQ',
      imageURL: 'https://example.com/hq.png',
    }

    expect(
      selectHqOrganization(
        {
          members: [
            {
              organization_id: 'org_merchant',
              organizations: { name: 'Merchant DBA' },
            },
            {
              organization_id: HQ_ORG_ID,
              organizations: hqOrganization,
            },
          ],
        },
        HQ_ORG_ID,
      ),
    ).toEqual(hqOrganization)
  })

  it('selects the HQ organization when the HQ membership is first', () => {
    const hqOrganization = { name: 'Dexa POS HQ' }

    expect(
      selectHqOrganization(
        {
          members: [
            {
              organization_id: HQ_ORG_ID,
              organizations: hqOrganization,
            },
            {
              organization_id: 'org_merchant',
              organizations: { name: 'Merchant DBA' },
            },
          ],
        },
        HQ_ORG_ID,
      ),
    ).toEqual(hqOrganization)
  })

  it('does not guess when no HQ membership exists', () => {
    expect(
      selectHqOrganization(
        {
          members: [
            {
              organization_id: 'org_merchant',
              organizations: { name: 'Merchant DBA' },
            },
          ],
        },
        HQ_ORG_ID,
      ),
    ).toBeNull()
  })

  it.each([
    ['an empty HQ organization id', { members: [] }, ''],
    ['a loading payload', undefined, HQ_ORG_ID],
    ['a null payload', null, HQ_ORG_ID],
    ['an error payload', new Error('failed'), HQ_ORG_ID],
    ['a non-array members value', { members: {} }, HQ_ORG_ID],
    [
      'a missing organization join',
      { members: [{ organization_id: HQ_ORG_ID, organizations: null }] },
      HQ_ORG_ID,
    ],
    [
      'null membership entries',
      { members: [null, { organization_id: 'org_merchant' }] },
      HQ_ORG_ID,
    ],
  ])('returns null for %s', (_label, userInfo, hqOrgId) => {
    expect(selectHqOrganization(userInfo, hqOrgId)).toBeNull()
  })
})
