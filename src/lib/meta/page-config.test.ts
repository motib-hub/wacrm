import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('@/lib/whatsapp/encryption', () => ({
  decrypt: (value: string) => `decrypted:${value}`,
}))

import {
  lookupAppSecretByPageOrIgId,
  resolveConfigByIgUserId,
  resolveConfigByPageId,
} from './page-config'

function makeStub(rows: unknown[] | null, error: unknown = null) {
  const stub = {
    from() {
      return {
        select() {
          return {
            eq() {
              return Promise.resolve({ data: rows, error })
            },
            or() {
              return { limit: () => Promise.resolve({ data: rows, error }) }
            },
          }
        },
      }
    },
  }
  return stub as unknown as SupabaseClient
}

describe('resolveConfigByPageId', () => {
  it('drops the event when no page_id is present', async () => {
    const result = await resolveConfigByPageId(makeStub([]), undefined)
    expect(result).toBeNull()
  })

  it('returns the single matching config row', async () => {
    const row = { id: 'cfg1', page_id: 'page1', account_id: 'acc1' }
    const result = await resolveConfigByPageId(makeStub([row]), 'page1')
    expect(result).toEqual(row)
  })

  it('drops the event when no config matches', async () => {
    const result = await resolveConfigByPageId(makeStub([]), 'unknown-page')
    expect(result).toBeNull()
  })

  it('drops the event when more than one config matches (ambiguous tenancy)', async () => {
    const result = await resolveConfigByPageId(
      makeStub([{ id: 'a', page_id: 'p' }, { id: 'b', page_id: 'p' }]),
      'p',
    )
    expect(result).toBeNull()
  })

  it('drops the event on a DB error', async () => {
    const result = await resolveConfigByPageId(makeStub(null, { message: 'boom' }), 'page1')
    expect(result).toBeNull()
  })
})

describe('resolveConfigByIgUserId', () => {
  it('drops the event when no ig_user_id is present', async () => {
    const result = await resolveConfigByIgUserId(makeStub([]), undefined)
    expect(result).toBeNull()
  })

  it('returns the single matching config row', async () => {
    const row = { id: 'cfg1', ig_user_id: 'ig1', account_id: 'acc1' }
    const result = await resolveConfigByIgUserId(makeStub([row]), 'ig1')
    expect(result).toEqual(row)
  })
})

describe('lookupAppSecretByPageOrIgId', () => {
  it('returns null for a null id without querying', async () => {
    const result = await lookupAppSecretByPageOrIgId(makeStub([]), null)
    expect(result).toBeNull()
  })

  it('decrypts and returns the stored secret when found', async () => {
    const result = await lookupAppSecretByPageOrIgId(
      makeStub([{ app_secret: 'enc-value' }]),
      'page1',
    )
    expect(result).toBe('decrypted:enc-value')
  })

  it('returns null when the account has no app secret of its own', async () => {
    const result = await lookupAppSecretByPageOrIgId(makeStub([{ app_secret: null }]), 'page1')
    expect(result).toBeNull()
  })

  it('returns null (not throws) when the lookup itself throws', async () => {
    const stub = {
      from() {
        throw new Error('connection reset')
      },
    } as unknown as SupabaseClient
    const result = await lookupAppSecretByPageOrIgId(stub, 'page1')
    expect(result).toBeNull()
  })
})
