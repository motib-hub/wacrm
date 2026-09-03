import { afterEach, describe, expect, it, vi } from 'vitest'
import { verifyPageAccess } from './graph-api'

describe('verifyPageAccess', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns the page info on a 200 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ id: 'page-1', name: 'Motib' }), { status: 200 }),
      ),
    )

    const result = await verifyPageAccess({ pageId: 'page-1', accessToken: 'tok' })
    expect(result).toEqual({ id: 'page-1', name: 'Motib' })
  })

  it("throws Meta's own error message on a non-2xx response", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({ error: { message: 'Invalid OAuth access token.', code: 190 } }),
          { status: 400 },
        ),
      ),
    )

    await expect(
      verifyPageAccess({ pageId: 'page-1', accessToken: 'bad-token' }),
    ).rejects.toThrow('Invalid OAuth access token.')
  })

  it('falls back to a generic message when the error body is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('not json', { status: 500 })),
    )

    await expect(
      verifyPageAccess({ pageId: 'page-1', accessToken: 'tok' }),
    ).rejects.toThrow(/HTTP 500/)
  })
})
