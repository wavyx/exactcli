import { describe, it, expect, vi } from 'vitest'

// Simulate a keyring whose entries throw on access (e.g. locked keychain,
// permission denied) - reads and deletes must degrade gracefully.
vi.mock('@napi-rs/keyring', () => ({
  Entry: class {
    getPassword() {
      throw new Error('keychain locked')
    }
    deletePassword() {
      throw new Error('keychain locked')
    }
    setPassword() {
      throw new Error('keychain locked')
    }
  },
}))

const { getOAuthTokens, deleteOAuthTokens, isKeychainAvailable } =
  await import('../../src/lib/keychain.js')

describe('keychain when entry access throws', () => {
  it('is reported as available (module loaded)', () => {
    expect(isKeychainAvailable()).toBe(true)
  })

  it('getOAuthTokens returns null instead of throwing', async () => {
    await expect(getOAuthTokens('locked')).resolves.toBeNull()
  })

  it('deleteOAuthTokens swallows the error', async () => {
    await expect(deleteOAuthTokens('locked')).resolves.toBeUndefined()
  })
})
