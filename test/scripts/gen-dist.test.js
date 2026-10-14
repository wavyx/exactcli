import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { fetchDist, renderHomebrewFormula } from '../../scripts/gen-dist.mjs'

describe('renderHomebrewFormula', () => {
  it('pins the tarball and its sha256, and wires jq for --jq', () => {
    const formula = renderHomebrewFormula({
      url: 'https://registry.npmjs.org/@wavyx/exactcli/-/exactcli-1.0.0.tgz',
      sha256: 'abc123',
    })

    expect(formula).toContain('class Exactcli < Formula')
    expect(formula).toContain(
      'url "https://registry.npmjs.org/@wavyx/exactcli/-/exactcli-1.0.0.tgz"',
    )
    expect(formula).toContain('sha256 "abc123"')
    expect(formula).toContain('depends_on "jq"')
    expect(formula).toContain('JQ_PATH: formula_opt_bin("jq")/"jq"')
    expect([...formula].every((ch) => ch.charCodeAt(0) < 128)).toBe(true)
  })
})

const sri = (buf) =>
  'sha512-' + createHash('sha512').update(buf).digest('base64')

describe('fetchDist', () => {
  it('reads the tarball URL from the registry and hashes the tarball', async () => {
    const tarball = Buffer.from('tarball bytes')
    const calls = []
    const fetchFn = async (url) => {
      calls.push(url)
      return url.endsWith('.tgz')
        ? { ok: true, arrayBuffer: async () => tarball }
        : {
            ok: true,
            json: async () => ({
              dist: {
                tarball: 'https://x/exactcli-1.0.0.tgz',
                integrity: sri(tarball),
              },
            }),
          }
    }

    const dist = await fetchDist('1.0.0', fetchFn)

    expect(calls).toEqual([
      'https://registry.npmjs.org/@wavyx/exactcli/1.0.0',
      'https://x/exactcli-1.0.0.tgz',
    ])
    expect(dist).toEqual({
      version: '1.0.0',
      url: 'https://x/exactcli-1.0.0.tgz',
      sha256: createHash('sha256').update(tarball).digest('hex'),
    })
  })

  it('fails clearly when the registry does not have the version yet', async () => {
    const fetchFn = async () => ({ ok: false, status: 404 })

    await expect(fetchDist('9.9.9', fetchFn)).rejects.toThrow(
      'GET https://registry.npmjs.org/@wavyx/exactcli/9.9.9 answered 404',
    )
  })

  it('fails when the tarball download fails', async () => {
    const fetchFn = async (url) =>
      url.endsWith('.tgz')
        ? { ok: false, status: 503 }
        : {
            ok: true,
            json: async () => ({
              dist: { tarball: 'https://x/a.tgz', integrity: 'sha512-x' },
            }),
          }

    await expect(fetchDist('1.0.0', fetchFn)).rejects.toThrow(
      'GET https://x/a.tgz answered 503',
    )
  })

  it('refuses a tarball that does not match the registry integrity', async () => {
    const fetchFn = async (url) =>
      url.endsWith('.tgz')
        ? { ok: true, arrayBuffer: async () => Buffer.from('tampered') }
        : {
            ok: true,
            json: async () => ({
              dist: {
                tarball: 'https://x/a.tgz',
                integrity: sri(Buffer.from('original')),
              },
            }),
          }

    await expect(fetchDist('1.0.0', fetchFn)).rejects.toThrow(
      'does not match the registry integrity',
    )
  })
})
