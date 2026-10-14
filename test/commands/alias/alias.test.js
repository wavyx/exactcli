import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCmd } from '../../helpers.js'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-alias-cmd-'))
process.env.EXACTCLI_CONFIG_DIR = TMP_CONFIG_DIR

const { default: Set } = await import('../../../src/commands/alias/set.js')
const { default: List } = await import('../../../src/commands/alias/list.js')
const { default: Unset } = await import('../../../src/commands/alias/unset.js')
const { getAliases, unsetAlias } = await import('../../../src/lib/aliases.js')

beforeAll(() => {
  process.env.EXACTCLI_CONFIG_DIR = TMP_CONFIG_DIR
})
afterAll(() => {
  delete process.env.EXACTCLI_CONFIG_DIR
  rmSync(TMP_CONFIG_DIR, { recursive: true, force: true })
})
beforeEach(async () => {
  process.stdout.isTTY = false
  for (const name of Object.keys(getAliases())) await unsetAlias(name)
})

const exit = (err) => err.exitCode ?? err.oclif?.exit

describe('alias set, list, unset', () => {
  it('stores a quoted command and the words after --, then lists them', async () => {
    expect(
      JSON.parse(await runCmd(Set, ['unpaid', 'receivable list --all'])),
    ).toEqual({ name: 'unpaid', command: ['receivable', 'list', '--all'] })
    await runCmd(Set, [
      'acme',
      '--',
      'account',
      'list',
      '--filter',
      "Name eq 'Acme NV'",
    ])

    expect(JSON.parse(await runCmd(List, []))).toEqual([
      { name: 'unpaid', command: ['receivable', 'list', '--all'] },
      {
        name: 'acme',
        command: ['account', 'list', '--filter', "Name eq 'Acme NV'"],
      },
    ])

    process.stdout.isTTY = true
    expect(await runCmd(List, [])).toMatch(
      /acme.*account list --filter Name eq 'Acme NV'/,
    )
  })

  it('warns on stderr when the alias can write', async () => {
    const chunks = []
    const spy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((c) => chunks.push(String(c)) > 0)
    try {
      await runCmd(Set, ['drop', '--', 'mandate', 'delete', '--yes'])
    } finally {
      spy.mockRestore()
    }
    expect(chunks.join('')).toMatch(/Warning: alias drop can write/)
  })

  it('refuses a name that hides a command, with 64', async () => {
    process.stdout.isTTY = true
    // The real config knows the commands; a bare run loads none.
    const err = await Set.run(['api', 'version'], process.cwd()).catch((e) => e)
    expect(exit(err)).toBe(64)
    expect(err.message).toMatch(/hides an exactcli command/)
  })

  it('removes an alias, and fails with 64 on an unknown one', async () => {
    await runCmd(Set, ['unpaid', 'receivable list'])
    expect(JSON.parse(await runCmd(Unset, ['unpaid']))).toEqual({
      removed: 'unpaid',
    })
    expect(getAliases()).toEqual({})

    process.stdout.isTTY = true
    const err = await Unset.run(['unpaid']).catch((e) => e)
    expect(exit(err)).toBe(64)
  })
})
