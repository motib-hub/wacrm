import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchInstagramProfile } from './graph-api'

describe('fetchInstagramProfile', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns the profile on a successful call', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ name: 'Juana', username: 'juana.ig' }), { status: 200 })),
    )
    const profile = await fetchInstagramProfile('17800000000000', 'token123')
    expect(profile).toEqual({ name: 'Juana', username: 'juana.ig' })
  })

  it('returns null on a non-2xx response rather than throwing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 400 })))
    const profile = await fetchInstagramProfile('17800000000000', 'token123')
    expect(profile).toBeNull()
  })

  it('returns null when the network call rejects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down')
      }),
    )
    const profile = await fetchInstagramProfile('17800000000000', 'token123')
    expect(profile).toBeNull()
  })
})
