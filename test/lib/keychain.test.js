import { describe, it, expect, afterEach } from 'vitest'
import {
  getOAuthTokens,
  setOAuthTokens,
  deleteOAuthTokens,
  isKeychainAvailable,
} from '../../src/lib/keychain.js'

const sampleOAuth = {
  accessToken: 'at-123',
  refreshToken: 'rt-456',
  obtainedAt: 1750000000000,
  expiresAt: 1750000600000,
  clientId: 'cid',
  clientSecret: 'csec',
}

describe('isKeychainAvailable', () => {
  it('returns a boolean', () => {
    expect(typeof isKeychainAvailable()).toBe('boolean')
  })
})

// The real-keyring round-trip needs an OS keychain; skip where unavailable
// (e.g. Linux CI without libsecret). The refusal behavior is covered by
// keychain-fallback.test.js, which mocks the native module.
describe.skipIf(!isKeychainAvailable())(
  'keychain OAuth slot (real keyring)',
  () => {
    const oauthProfile = `exactcli-oauth-test-${Date.now()}`

    afterEach(async () => {
      await deleteOAuthTokens(oauthProfile)
    })

    it('round-trips the OAuth token blob as JSON', async () => {
      await setOAuthTokens(oauthProfile, sampleOAuth)
      expect(await getOAuthTokens(oauthProfile)).toEqual(sampleOAuth)
    })

    it('returns null for a profile without OAuth tokens', async () => {
      expect(await getOAuthTokens(`none-${Date.now()}`)).toBeNull()
    })

    it('returns null for corrupted stored JSON', async () => {
      const { Entry } = await import('@napi-rs/keyring')
      const entry = new Entry('exactcli', `${oauthProfile}/oauth`)
      entry.setPassword('not-json{{{')
      expect(await getOAuthTokens(oauthProfile)).toBeNull()
      entry.deletePassword()
    })

    it('deleteOAuthTokens removes the blob and tolerates repeats', async () => {
      await setOAuthTokens(oauthProfile, sampleOAuth)
      await deleteOAuthTokens(oauthProfile)
      expect(await getOAuthTokens(oauthProfile)).toBeNull()
      await expect(deleteOAuthTokens(oauthProfile)).resolves.toBeUndefined()
    })
  },
)
