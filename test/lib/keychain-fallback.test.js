import { describe, it, expect, vi } from 'vitest'

// Simulate an environment where the native OS keyring is unavailable
// (e.g. Linux without libsecret). exactcli must refuse to store credentials
// rather than silently fall back to a plaintext file.
vi.mock('@napi-rs/keyring', () => {
  throw new Error('Native module not available')
})

const {
  getOAuthTokens,
  setOAuthTokens,
  deleteOAuthTokens,
  isKeychainAvailable,
} = await import('../../src/lib/keychain.js')

const testProfile = `exactcli-nokeychain-${Date.now()}`

describe('keychain when the OS keychain is unavailable', () => {
  it('isKeychainAvailable returns false', () => {
    expect(isKeychainAvailable()).toBe(false)
  })

  it('setOAuthTokens refuses to write (never writes plaintext)', async () => {
    await expect(
      setOAuthTokens(testProfile, { accessToken: 'x' }),
    ).rejects.toThrow(/keychain/i)
  })

  it('setOAuthTokens fails with exit code 78 (config)', async () => {
    const err = await setOAuthTokens(testProfile, { accessToken: 'x' }).catch(
      (e) => e,
    )
    expect(err.exitCode).toBe(78)
  })

  it('getOAuthTokens returns null instead of crashing', async () => {
    await expect(getOAuthTokens(testProfile)).resolves.toBeNull()
  })

  it('deleteOAuthTokens is a no-op that does not throw', async () => {
    await expect(deleteOAuthTokens(testProfile)).resolves.toBeUndefined()
  })
})
