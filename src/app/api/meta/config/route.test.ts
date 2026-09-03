import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Tests for /api/meta/config — the settings-screen route for meta_page_config
// (Instagram DM + Lead Ads). Mirrors the shape of /api/whatsapp/config: GET
// never 500s on a business-logic failure, POST verifies with the Graph API
// before saving.
// ---------------------------------------------------------------------------

let configRow: Record<string, unknown> | null = null
const upserts: { op: 'insert' | 'update'; payload: Record<string, unknown> }[] = []
let claimedRow: Record<string, unknown> | null = null

function makeAuthedSupabaseMock() {
  function builder(table: string) {
    let didWrite = false
    let writeOp: 'insert' | 'update' = 'insert'

    const selectResult = () => {
      switch (table) {
        case 'profiles':
          return { data: { account_id: 'acct-1' }, error: null }
        case 'meta_page_config':
          return { data: configRow, error: null }
        default:
          return { data: null, error: null }
      }
    }

    const writeResult = () => {
      if (table === 'meta_page_config') {
        return { data: { id: 'cfg-1' }, error: null }
      }
      return { data: null, error: null }
    }

    const b: Record<string, unknown> = {}
    const chain = () => b
    for (const m of ['select', 'eq', 'neq', 'or']) b[m] = vi.fn(chain)
    b.delete = vi.fn(() => {
      didWrite = true
      writeOp = 'update' // delete doesn't matter for upserts tracking
      return b
    })
    b.insert = vi.fn((payload: Record<string, unknown>) => {
      didWrite = true
      writeOp = 'insert'
      upserts.push({ op: 'insert', payload })
      return b
    })
    b.update = vi.fn((payload: Record<string, unknown>) => {
      didWrite = true
      writeOp = 'update'
      upserts.push({ op: 'update', payload })
      return b
    })
    b.maybeSingle = vi.fn(() =>
      Promise.resolve(didWrite ? writeResult() : selectResult()),
    )
    b.then = (resolve: (v: unknown) => unknown) =>
      resolve(didWrite ? writeResult() : selectResult())
    void writeOp
    return b
  }

  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: 'user-1' } },
        error: null,
      })),
    },
    from: vi.fn((table: string) => builder(table)),
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => makeAuthedSupabaseMock()),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => {
      const b: Record<string, unknown> = {}
      const chain = () => b
      for (const m of ['select', 'eq', 'neq', 'or']) b[m] = vi.fn(chain)
      b.maybeSingle = vi.fn(() => Promise.resolve({ data: claimedRow, error: null }))
      return b
    }),
  })),
}))

vi.mock('@/lib/whatsapp/encryption', () => ({
  encrypt: vi.fn((v: string) => `enc:${v}`),
  decrypt: vi.fn((v: string) => {
    if (v === 'corrupted') throw new Error('bad token')
    return v.replace(/^enc:/, '')
  }),
}))

const { verifyPageAccess } = vi.hoisted(() => ({
  verifyPageAccess: vi.fn(async () => ({ id: 'page-1', name: 'Motib' })),
}))
vi.mock('@/lib/meta/graph-api', () => ({ verifyPageAccess }))

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'

import { GET, POST, DELETE } from './route'

beforeEach(() => {
  configRow = null
  claimedRow = null
  upserts.length = 0
  verifyPageAccess.mockClear()
  verifyPageAccess.mockResolvedValue({ id: 'page-1', name: 'Motib' })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/meta/config', () => {
  it('returns connected:false with reason no_config when nothing is saved', async () => {
    const res = await GET()
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ connected: false, reason: 'no_config' })
  })

  it('returns connected:true with page_info when the saved token decrypts and Meta accepts it', async () => {
    configRow = {
      page_id: 'page-1',
      ig_user_id: 'ig-1',
      page_name: 'Motib',
      access_token: 'enc:good-token',
      app_id: null,
      status: 'connected',
    }
    const res = await GET()
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.connected).toBe(true)
    expect(json.page_info).toEqual({ id: 'page-1', name: 'Motib' })
    expect(verifyPageAccess).toHaveBeenCalledWith({ pageId: 'page-1', accessToken: 'good-token' })
  })

  it('flags needs_reset when the stored token cannot be decrypted', async () => {
    configRow = {
      page_id: 'page-1',
      access_token: 'corrupted',
      status: 'connected',
    }
    const res = await GET()
    const json = await res.json()
    expect(json).toMatchObject({ connected: false, reason: 'token_corrupted', needs_reset: true })
  })

  it('surfaces a meta_api_error without throwing when Meta rejects the token', async () => {
    configRow = {
      page_id: 'page-1',
      access_token: 'enc:stale-token',
      status: 'connected',
    }
    verifyPageAccess.mockRejectedValueOnce(new Error('Invalid OAuth access token.'))
    const res = await GET()
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ connected: false, reason: 'meta_api_error' })
    expect(json.message).toContain('Invalid OAuth access token.')
  })
})

describe('POST /api/meta/config', () => {
  it('requires page_id and access_token', async () => {
    const res = await POST(
      new Request('http://localhost/api/meta/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
    )
    expect(res.status).toBe(400)
  })

  it('verifies with Meta before saving and encrypts the token', async () => {
    const res = await POST(
      new Request('http://localhost/api/meta/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page_id: 'page-1',
          ig_user_id: 'ig-1',
          access_token: 'fresh-token',
          verify_token: 'my-verify-token',
        }),
      }),
    )
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(verifyPageAccess).toHaveBeenCalledWith({ pageId: 'page-1', accessToken: 'fresh-token' })
    expect(upserts).toHaveLength(1)
    expect(upserts[0].payload).toMatchObject({
      page_id: 'page-1',
      ig_user_id: 'ig-1',
      access_token: 'enc:fresh-token',
      verify_token: 'enc:my-verify-token',
      status: 'connected',
    })
  })

  it('rejects when Meta rejects the token, without writing a row', async () => {
    verifyPageAccess.mockRejectedValueOnce(new Error('Invalid OAuth access token.'))
    const res = await POST(
      new Request('http://localhost/api/meta/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page_id: 'page-1', access_token: 'bad-token' }),
      }),
    )
    const json = await res.json()
    expect(res.status).toBe(400)
    expect(json.error).toContain('Invalid OAuth access token.')
    expect(upserts).toHaveLength(0)
  })

  it('rejects when the page is already claimed by another account', async () => {
    claimedRow = { account_id: 'acct-2', page_id: 'page-1' }
    const res = await POST(
      new Request('http://localhost/api/meta/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page_id: 'page-1', access_token: 'tok' }),
      }),
    )
    expect(res.status).toBe(409)
    expect(upserts).toHaveLength(0)
  })
})

describe('DELETE /api/meta/config', () => {
  it('clears the config for the caller\'s account', async () => {
    const res = await DELETE()
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
  })
})
