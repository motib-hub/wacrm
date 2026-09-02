import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchLeadDetails } from './graph-api'

describe('fetchLeadDetails', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns lead details on a successful call', async () => {
    const body = { field_data: [{ name: 'email', values: ['a@b.com'] }], ad_id: '1', form_id: '2' }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })))
    const details = await fetchLeadDetails('999888777', 'token123')
    expect(details).toEqual(body)
  })

  it('returns null on a non-2xx response rather than throwing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 403 })))
    const details = await fetchLeadDetails('999888777', 'token123')
    expect(details).toBeNull()
  })

  it('returns null when the network call rejects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down')
      }),
    )
    const details = await fetchLeadDetails('999888777', 'token123')
    expect(details).toBeNull()
  })
})
