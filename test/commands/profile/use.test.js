import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-profile-use-test-'))
process.env.EXACTCLI_CONFIG_DIR = TMP_CONFIG_DIR

const { getConf, getActiveProfile } = await import('../../../src/lib/config.js')
const { default: ProfileUseCommand } =
  await import('../../../src/commands/profile/use.js')
const { runCmd } = await import('../../helpers.js')

describe('profile use', () => {
  beforeAll(() => {
    expect(getConf().path).toContain(TMP_CONFIG_DIR)
  })

  afterAll(() => {
    delete process.env.EXACTCLI_CONFIG_DIR
    rmSync(TMP_CONFIG_DIR, { recursive: true, force: true })
  })

  beforeEach(() => {
    getConf().clear()
  })

  it('switches the active profile', async () => {
    const stdout = await runCmd(ProfileUseCommand, ['work'])

    expect(getActiveProfile()).toBe('work')
    expect(stdout).toContain('work')
  })

  it.each(['work.two', 'work_two', 'work-two', 'Work123'])(
    'accepts profile name %s',
    async (name) => {
      await runCmd(ProfileUseCommand, [name])

      expect(getActiveProfile()).toBe(name)
    },
  )

  it('rejects a name with a space with exit 64', async () => {
    const err = await ProfileUseCommand.run(['not valid']).catch((e) => e)

    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(err.message).toMatch(/letters, digits, dot, underscore and dash/)
    expect(getActiveProfile()).toBe('default')
  })

  it('rejects a name with a path separator with exit 64', async () => {
    const err = await ProfileUseCommand.run(['a/b']).catch((e) => e)

    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
  })

  it('emits { profile, active: true } as json', async () => {
    const stdout = await runCmd(ProfileUseCommand, ['work', '--output', 'json'])

    expect(JSON.parse(stdout)).toEqual({ profile: 'work', active: true })
  })
})
