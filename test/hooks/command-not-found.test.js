import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const aliases = vi.hoisted(() => ({ store: {} }))
vi.mock('../../src/lib/aliases.js', () => ({
  MAX_ALIAS_HOPS: 3,
  getAlias: (name) => aliases.store[name],
}))
const { default: hook } = await import('../../src/hooks/command-not-found.js')

/** A config that knows a few commands and records what runs. */
function fakeConfig(run = async () => {}) {
  const known = new Set(['sales-entry:list', 'receivable:list', 'api'])
  const config = {
    findCommand: (id) => known.has(id),
    runCommand: vi.fn(async (id, argv) => run(id, argv, config)),
  }
  return config
}

describe('command_not_found hook', () => {
  let writes
  let spy

  beforeEach(() => {
    writes = []
    spy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      writes.push(String(chunk))
      return true
    })
    process.exitCode = undefined
    aliases.store = {}
  })

  afterEach(() => {
    spy.mockRestore()
    process.exitCode = undefined
  })

  it('names the unknown command, points at the help and exits 127', async () => {
    await expect(
      hook({ id: 'sales-entrie:list', argv: [], config: fakeConfig() }),
    ).resolves.toBeUndefined()
    expect(writes.join('')).toBe(
      'Command "sales-entrie list" not found. Run: exactcli --help\n',
    )
    expect(process.exitCode).toBe(127)
  })

  it('runs an alias with the longest known command id and the typed words', async () => {
    aliases.store.unpaid = ['receivable', 'list', '--filter', "Code eq 'A B'"]
    const config = fakeConfig()

    await hook({ id: 'unpaid', argv: ['--all'], config })

    expect(config.runCommand).toHaveBeenCalledWith('receivable:list', [
      '--filter',
      "Code eq 'A B'",
      '--all',
    ])
    expect(process.exitCode).toBeUndefined()
  })

  it('keeps the words that oclif joined to the alias name', async () => {
    aliases.store.raw = ['api']
    const config = fakeConfig()

    await hook({ id: 'raw:GET', argv: ['/api/v1/current/Me'], config })

    expect(config.runCommand).toHaveBeenCalledWith('api', [
      'GET',
      '/api/v1/current/Me',
    ])
  })

  it('passes the exit code of the command on', async () => {
    aliases.store.a = ['api']
    const exited = Object.assign(new Error('EEXIT: 77'), {
      code: 'EEXIT',
      oclif: { exit: 77 },
    })
    await hook({
      id: 'a',
      config: fakeConfig(async () => {
        throw exited
      }),
    })
    expect(process.exitCode).toBe(77)
    expect(writes.join('')).toBe('')

    await hook({
      id: 'a',
      config: fakeConfig(async () => {
        throw Object.assign(new Error('Unexpected argument'), {
          oclif: { exit: 2 },
        })
      }),
    })
    expect(process.exitCode).toBe(64)
    expect(writes.join('')).toBe('Error: Unexpected argument\n')

    await hook({
      id: 'a',
      config: fakeConfig(async () => {
        throw new Error('')
      }),
    })
    expect(process.exitCode).toBe(1)
  })

  it('stops a cycle and an over-long chain with 64', async () => {
    aliases.store = { a: ['b'], b: ['a'] }
    const loop = async (id, argv, config) => hook({ id, argv, config })

    await hook({ id: 'a', config: fakeConfig(loop) })
    expect(process.exitCode).toBe(64)
    expect(writes.join('')).toContain('Alias expansion stopped: a -> b -> a')

    writes.length = 0
    process.exitCode = undefined
    aliases.store = { a: ['b'], b: ['c'], c: ['d'], d: ['api'] }
    await hook({ id: 'a', config: fakeConfig(loop) })
    expect(process.exitCode).toBe(64)
    expect(writes.join('')).toContain('a -> b -> c -> d')
  })
})
