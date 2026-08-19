import { describe, it, expect, beforeEach, vi } from 'vitest'
import { runCmd } from '../../helpers.js'

const mocks = vi.hoisted(() => ({
  loadConfig: vi.fn(() => ({ activeProfile: 'default' })),
  deleteOAuthTokens: vi.fn(),
}))

vi.mock('../../../src/lib/config.js', async (importOriginal) => ({
  ...(await importOriginal()),
  loadConfig: mocks.loadConfig,
}))
vi.mock('../../../src/lib/keychain.js', () => ({
  deleteOAuthTokens: mocks.deleteOAuthTokens,
}))

const { default: LogoutCommand } =
  await import('../../../src/commands/auth/logout.js')

beforeEach(() => {
  vi.resetAllMocks()
  mocks.loadConfig.mockReturnValue({ activeProfile: 'default' })
})

describe('auth logout', () => {
  it('deletes the token blob of the active profile', async () => {
    const stdout = await runCmd(LogoutCommand)

    expect(mocks.deleteOAuthTokens).toHaveBeenCalledWith('default')
    expect(stdout).toContain('Logged out of profile default')
  })

  it('deletes the token blob of the profile on the flag', async () => {
    mocks.loadConfig.mockReturnValue({ activeProfile: 'acme' })

    const stdout = await runCmd(LogoutCommand, ['--profile', 'acme'])

    expect(mocks.deleteOAuthTokens).toHaveBeenCalledWith('acme')
    expect(stdout).toContain('Logged out of profile acme')
  })
})
