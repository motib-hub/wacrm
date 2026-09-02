import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

import { alreadyStoredMessage } from './dedupe'

function makeStub(opts: { rows?: unknown[]; error?: unknown } = {}) {
  const stub = {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    limit() {
                      return Promise.resolve({ data: opts.rows ?? [], error: opts.error ?? null })
                    },
                  }
                },
              }
            },
          }
        },
      }
    },
  }
  return stub as unknown as SupabaseClient
}

describe('alreadyStoredMessage', () => {
  it('returns false when no matching row exists', async () => {
    const result = await alreadyStoredMessage(makeStub({ rows: [] }), 'conv-1', 'mid-1')
    expect(result).toBe(false)
  })

  it('returns true when a matching row exists', async () => {
    const result = await alreadyStoredMessage(makeStub({ rows: [{ id: 'm1' }] }), 'conv-1', 'mid-1')
    expect(result).toBe(true)
  })

  it('fails closed (treats a lookup error as already stored)', async () => {
    const result = await alreadyStoredMessage(
      makeStub({ error: { message: 'db down' } }),
      'conv-1',
      'mid-1',
    )
    expect(result).toBe(true)
  })
})
