import { describe, it, expect, beforeEach, vi } from 'vitest'
import { runCmd } from '../../helpers.js'

const mocks = vi.hoisted(() => ({
  loadConfig: vi.fn(() => ({ activeProfile: 'default' })),
  deleteOAuthTokens: vi.fn(),
  withLock: vi.fn((_name, fn) => fn()),
}))

vi.mock('../../../src/lib/config.js', async (importOriginal) => ({
  ...(await importOriginal()),
  loadConfig: mocks.loadConfig,
}))
vi.mock('../../../src/lib/keychain.js', () => ({
  deleteOAuthTokens: mocks.deleteOAuthTokens,
}))
vi.mock('../../../src/lib/lock.js', () => ({ withLock: mocks.withLock }))

const { default: LogoutCommand } =
  await import('../../../src/commands/auth/logout.js')

beforeEach(() => {
  vi.resetAllMocks()
  mocks.loadConfig.mockReturnValue({ activeProfile: 'default' })
  mocks.withLock.mockImplementation((_name, fn) => fn())
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

  it('deletes under the oauth lock of the profile', async () => {
    // A refresh in a sibling process would write fresh credentials back
    // after the delete, so the delete must wait for the lock.
    mocks.loadConfig.mockReturnValue({ activeProfile: 'acme' })
    mocks.withLock.mockImplementation(async (_name, fn) => {
      expect(mocks.deleteOAuthTokens).not.toHaveBeenCalled()
      await fn()
      expect(mocks.deleteOAuthTokens).toHaveBeenCalledWith('acme')
    })

    await runCmd(LogoutCommand, ['--profile', 'acme'])

    expect(mocks.withLock).toHaveBeenCalledWith(
      'oauth-acme',
      expect.any(Function),
    )
  })

  it('reports a lock that another process holds', async () => {
    const { CliError } = await import('../../../src/lib/errors.js')
    mocks.withLock.mockRejectedValue(
      new CliError(
        'Another exactcli process holds the lock for oauth-default',
        {
          exitCode: 75,
        },
      ),
    )

    const err = await LogoutCommand.run([]).catch((e) => e)

    expect(err.exitCode ?? err.oclif?.exit).toBe(75)
    expect(mocks.deleteOAuthTokens).not.toHaveBeenCalled()
  })
})
