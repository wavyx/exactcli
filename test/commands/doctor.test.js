import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { runCmd } from '../helpers.js'

const mocks = vi.hoisted(() => ({
  fetchMe: vi.fn(),
  getValidOAuthAccess: vi.fn(),
  loadConfig: vi.fn(() => ({ activeProfile: 'default' })),
  getProfileConfig: vi.fn(),
  getConf: vi.fn(() => ({ path: '/tmp/exactcli/config.json' })),
  getOAuthTokens: vi.fn(),
  isKeychainAvailable: vi.fn(() => true),
}))

vi.mock('../../src/lib/auth.js', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchMe: mocks.fetchMe,
  getValidOAuthAccess: mocks.getValidOAuthAccess,
}))
vi.mock('../../src/lib/config.js', async (importOriginal) => ({
  ...(await importOriginal()),
  loadConfig: mocks.loadConfig,
  getProfileConfig: mocks.getProfileConfig,
  getConf: mocks.getConf,
}))
vi.mock('../../src/lib/keychain.js', () => ({
  getOAuthTokens: mocks.getOAuthTokens,
  isKeychainAvailable: mocks.isKeychainAvailable,
}))
// The real client still runs; the spy only records what the probe built.
vi.mock('../../src/lib/client.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, createClient: vi.fn(actual.createClient) }
})

const { default: DoctorCommand } = await import('../../src/commands/doctor.js')
const { createClient } = await import('../../src/lib/client.js')

function profile(values = {}) {
  mocks.getProfileConfig.mockImplementation((_profile, key) => values[key])
}

function blob(ageMs) {
  const obtainedAt = Date.now() - ageMs
  return {
    accessToken: 'at-1',
    refreshToken: 'rt-1',
    obtainedAt,
    expiresAt: obtainedAt + 600_000,
    clientId: 'cid',
    clientSecret: 'csec',
  }
}

const FULL = {
  host: 'start.exactonline.be',
  ngrok_domain: 'acme.ngrok-free.app',
  division: 123,
}
let binDir
const savedPath = process.env.PATH
const savedJq = process.env.JQ_PATH
const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')

beforeEach(() => {
  vi.resetAllMocks()
  mocks.loadConfig.mockReturnValue({ activeProfile: 'default' })
  mocks.isKeychainAvailable.mockReturnValue(true)
  mocks.getConf.mockReturnValue({ path: '/tmp/exactcli/config.json' })
  mocks.fetchMe.mockResolvedValue({ FullName: 'Jane Doe' })
  mocks.getOAuthTokens.mockResolvedValue(null)
  profile({})
  binDir = mkdtempSync(join(tmpdir(), 'exactcli-doctor-'))
  writeFileSync(join(binDir, 'ngrok'), '#!/bin/sh\n')
  chmodSync(join(binDir, 'ngrok'), 0o755)
  process.env.PATH = binDir
  process.env.JQ_PATH = process.execPath
  delete process.env.npm_config_jq_path
  process.exitCode = undefined
  process.stdout.isTTY = true
})

afterEach(() => {
  Object.defineProperty(process, 'platform', platformDescriptor)
  process.env.PATH = savedPath
  if (savedJq === undefined) delete process.env.JQ_PATH
  else process.env.JQ_PATH = savedJq
  delete process.env.EXACTCLI_ACCESS_TOKEN
  delete process.env.EXACTCLI_DIVISION
  process.exitCode = undefined
  rmSync(binDir, { recursive: true, force: true })
})

/** @returns {Record<string, {status: string, detail: string}>} */
async function runJson(argv = []) {
  const rows = JSON.parse(
    await runCmd(DoctorCommand, ['--output', 'json', ...argv]),
  )
  return Object.fromEntries(rows.map((r) => [r.check, r]))
}

describe('doctor', () => {
  it('passes every check with a full profile, a fresh token and a reachable API', async () => {
    profile(FULL)
    mocks.getOAuthTokens.mockResolvedValue(blob(10_000))
    const checks = await runJson()
    expect(Object.values(checks).every((c) => c.status === 'ok')).toBe(true)
    expect(checks.token.detail).toMatch(/fresh/)
    expect(checks.api.detail).toMatch(/Jane Doe/)
    expect(checks.writes.detail).toBe('off (default)')
    expect(mocks.getValidOAuthAccess).not.toHaveBeenCalled()
    expect(createClient.mock.calls[0][0].token).toBe('at-1')
    expect(process.exitCode).toBeUndefined()
  })

  it('refreshes an old token before the probe, as any command would', async () => {
    // The raw keychain token answers 401 after ten minutes idle, which would
    // turn the probe into a false failure.
    profile(FULL)
    mocks.getOAuthTokens.mockResolvedValue(blob(600_000))
    mocks.getValidOAuthAccess.mockResolvedValue({ accessToken: 'at-fresh' })
    const checks = await runJson()
    expect(mocks.getValidOAuthAccess).toHaveBeenCalledWith('default')
    expect(createClient.mock.calls[0][0].token).toBe('at-fresh')
    expect(checks.token.detail).toMatch(/refreshable/)
    expect(checks.api).toEqual(
      expect.objectContaining({
        status: 'ok',
        detail: expect.stringMatching(/Jane Doe/),
      }),
    )
    expect(process.exitCode).toBeUndefined()
  })

  it('reports a failed refresh as an api failure', async () => {
    profile(FULL)
    mocks.getOAuthTokens.mockResolvedValue(blob(600_000))
    mocks.getValidOAuthAccess.mockRejectedValue(
      new Error('OAuth token refresh failed (spent). Run: exactcli auth login'),
    )
    const checks = await runJson()
    expect(checks.api).toEqual(
      expect.objectContaining({
        status: 'FAIL',
        detail: 'OAuth token refresh failed (spent). Run: exactcli auth login',
      }),
    )
    expect(mocks.fetchMe).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(1)
  })

  it('reports a read-only profile as locked, even with the environment switch', async () => {
    profile({ ...FULL, read_only: true })
    mocks.getOAuthTokens.mockResolvedValue(blob(10_000))
    process.env.EXACTCLI_ALLOW_WRITES = '1'
    let checks
    try {
      checks = await runJson()
    } finally {
      delete process.env.EXACTCLI_ALLOW_WRITES
    }
    expect(checks.writes).toEqual({
      check: 'writes',
      status: 'ok',
      detail: 'locked: read-only profile',
    })
  })

  it('warns when EXACTCLI_ALLOW_WRITES is set in the environment', async () => {
    profile(FULL)
    mocks.getOAuthTokens.mockResolvedValue(blob(10_000))
    process.env.EXACTCLI_ALLOW_WRITES = '1'
    let checks
    try {
      checks = await runJson()
    } finally {
      delete process.env.EXACTCLI_ALLOW_WRITES
    }
    expect(checks.writes).toEqual({
      check: 'writes',
      status: 'warn',
      detail: 'EXACTCLI_ALLOW_WRITES is set: every command may write',
    })
    expect(process.exitCode).toBeUndefined()
  })

  it('reports an old token as refreshable', async () => {
    profile(FULL)
    mocks.getOAuthTokens.mockResolvedValue(blob(600_000))
    const checks = await runJson(['--offline'])
    expect(checks.token.detail).toMatch(/refreshable/)
    expect(checks.api.detail).toMatch(/skipped/)
  })

  it('fails the token and division checks when nothing is set up', async () => {
    const checks = await runJson()
    expect(checks.token.status).toBe('FAIL')
    expect(checks.division.status).toBe('FAIL')
    expect(process.exitCode).toBe(1)
  })

  it('warns instead of failing when ngrok-domain is unset', async () => {
    const checks = await runJson(['--offline'])
    expect(checks['ngrok-domain']).toEqual(
      expect.objectContaining({
        status: 'warn',
        detail: 'not set (auth login asks; --manual needs none)',
      }),
    )
  })

  it('skips the api probe without a token and keeps it out of the failures', async () => {
    profile({ ...FULL, division: undefined })
    const checks = await runJson()
    expect(checks.api).toEqual(
      expect.objectContaining({ status: 'ok', detail: 'skipped: no token' }),
    )
    // Only the token check counts the missing login.
    expect(process.exitCode).toBe(1)
  })

  it('accepts the token from EXACTCLI_ACCESS_TOKEN and probes with it', async () => {
    profile(FULL)
    process.env.EXACTCLI_ACCESS_TOKEN = 'env-token'
    const checks = await runJson()
    expect(checks.token).toEqual(
      expect.objectContaining({
        status: 'ok',
        detail: 'from EXACTCLI_ACCESS_TOKEN',
      }),
    )
    expect(checks.api.detail).toMatch(/Jane Doe/)
    expect(mocks.getOAuthTokens).not.toHaveBeenCalled()
    expect(createClient.mock.calls[0][0].token).toBe('env-token')
  })

  it('passes --timeout to the probe client', async () => {
    profile(FULL)
    mocks.getOAuthTokens.mockResolvedValue(blob(1000))
    await runJson(['--timeout', '1234'])
    expect(createClient.mock.calls[0][0].timeout).toBe(1234)
  })

  it('accepts the division from EXACTCLI_DIVISION', async () => {
    process.env.EXACTCLI_DIVISION = '654321'
    const checks = await runJson(['--offline'])
    expect(checks.division).toEqual(
      expect.objectContaining({ status: 'ok', detail: '654321' }),
    )
  })

  it('finds ngrok.exe on windows', async () => {
    rmSync(join(binDir, 'ngrok'))
    writeFileSync(join(binDir, 'ngrok.exe'), '#!/bin/sh\n')
    chmodSync(join(binDir, 'ngrok.exe'), 0o755)
    Object.defineProperty(process, 'platform', {
      value: 'win32',
      configurable: true,
    })
    expect((await runJson(['--offline'])).ngrok.status).toBe('ok')
  })

  it('looks for plain ngrok on other platforms', async () => {
    // The mirror of the windows case, so a windows runner covers it too.
    Object.defineProperty(process, 'platform', {
      value: 'linux',
      configurable: true,
    })
    expect((await runJson(['--offline'])).ngrok.status).toBe('ok')
  })

  it('fails host, keychain and config when they are broken', async () => {
    profile({ ...FULL, host: 'evil.example' })
    mocks.isKeychainAvailable.mockReturnValue(false)
    mocks.getConf.mockImplementation(() => {
      throw new Error('store locked')
    })
    const checks = await runJson(['--offline'])
    expect(checks.host.status).toBe('FAIL')
    expect(checks.keychain.status).toBe('FAIL')
    expect(checks.config).toEqual(
      expect.objectContaining({ status: 'FAIL', detail: 'store locked' }),
    )
  })

  it('warns instead of failing when ngrok and jq are missing', async () => {
    profile(FULL)
    mocks.getOAuthTokens.mockResolvedValue(blob(10_000))
    process.env.PATH = `${tmpdir()}${delimiter}`
    process.env.JQ_PATH = '/nonexistent/jq'
    const checks = await runJson(['--offline'])
    expect(checks.ngrok).toEqual(
      expect.objectContaining({
        status: 'warn',
        detail: 'ngrok not on PATH (auth login --manual needs none)',
      }),
    )
    expect(checks.jq).toEqual(
      expect.objectContaining({
        status: 'warn',
        detail: 'jq binary not found (only --jq needs it)',
      }),
    )
    // Neither one is required, so the run still succeeds.
    expect(process.exitCode).toBeUndefined()
  })

  it('reports an API failure and an empty Me answer', async () => {
    profile(FULL)
    mocks.getOAuthTokens.mockResolvedValue(blob(1000))
    mocks.fetchMe.mockRejectedValue(new Error('boom'))
    expect((await runJson()).api).toEqual(
      expect.objectContaining({ status: 'FAIL', detail: 'boom' }),
    )
    mocks.fetchMe.mockResolvedValue(null)
    expect((await runJson()).api.detail).toBe('empty')
  })

  it('looks for the bundled jq binary when JQ_PATH is unset', async () => {
    delete process.env.JQ_PATH
    const checks = await runJson(['--offline'])
    expect(checks.jq.detail).toMatch(/node-jq[\\/]bin[\\/]jq/)
  })

  it('prints a human summary in table mode', async () => {
    profile(FULL)
    mocks.getOAuthTokens.mockResolvedValue(blob(1000))
    const out = await runCmd(DoctorCommand, ['--offline'])
    expect(out).toMatch(/\[ok\] node/)
    expect(out).toMatch(/All checks passed/)
    mocks.getOAuthTokens.mockResolvedValue(null)
    profile({})
    delete process.env.PATH
    const bad = await runCmd(DoctorCommand, ['--offline'])
    expect(bad).toMatch(/\[!!\] token/)
    expect(bad).toMatch(/\[--\] ngrok-domain/)
    expect(bad).toMatch(/check\(s\) failed/)
  })
})
