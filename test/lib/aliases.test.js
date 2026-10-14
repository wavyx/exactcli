import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-aliases-'))
process.env.EXACTCLI_CONFIG_DIR = TMP_CONFIG_DIR
const { aliasArgv, checkAlias, getAlias, getAliases, setAlias, unsetAlias } =
  await import('../../src/lib/aliases.js')

afterAll(() => {
  delete process.env.EXACTCLI_CONFIG_DIR
  rmSync(TMP_CONFIG_DIR, { recursive: true, force: true })
})

const exit = (fn) => {
  try {
    fn()
  } catch (err) {
    return err.exitCode
  }
  return undefined
}

describe('alias store', () => {
  beforeAll(() => {
    for (const name of Object.keys(getAliases())) unsetAlias(name)
  })

  it('stores an argv, reads it back, and removes it', async () => {
    await setAlias('unpaid', [
      'receivable',
      'list',
      '--filter',
      "Code eq 'A B'",
    ])
    expect(getAlias('unpaid')).toEqual([
      'receivable',
      'list',
      '--filter',
      "Code eq 'A B'",
    ])
    expect(getAliases()).toEqual({
      unpaid: ['receivable', 'list', '--filter', "Code eq 'A B'"],
    })
    await unsetAlias('unpaid')
    expect(getAlias('unpaid')).toBeUndefined()
  })
})

describe('aliasArgv', () => {
  it('splits a single quoted command on spaces, keeps several words as they are', () => {
    expect(aliasArgv(['sales-entry list --all'])).toEqual([
      'sales-entry',
      'list',
      '--all',
    ])
    expect(aliasArgv(['sales-entry', 'list', '--filter', 'A eq 1'])).toEqual([
      'sales-entry',
      'list',
      '--filter',
      'A eq 1',
    ])
  })
})

describe('checkAlias', () => {
  const config = {
    findCommand: (id) => ['sales-entry:list', 'api'].includes(id),
    findTopic: (id) => id === 'sales-entry',
  }

  it('accepts a plain name', () => {
    expect(() =>
      checkAlias('se', ['sales-entry', 'list'], config, {}),
    ).not.toThrow()
  })

  it('refuses a bad name, a command or a topic, and an empty command with 64', () => {
    expect(exit(() => checkAlias('a.b', ['api'], config, {}))).toBe(64)
    expect(exit(() => checkAlias('-x', ['api'], config, {}))).toBe(64)
    expect(exit(() => checkAlias('api', ['api'], config, {}))).toBe(64)
    expect(exit(() => checkAlias('sales-entry', ['api'], config, {}))).toBe(64)
    expect(exit(() => checkAlias('x', [], config, {}))).toBe(64)
  })

  it('refuses a cycle through other aliases with 64', () => {
    expect(exit(() => checkAlias('a', ['a', '--all'], config, {}))).toBe(64)
    const aliases = { b: ['c'], c: ['a', 'list'], d: ['d'] }
    expect(() => checkAlias('a', ['b'], config, aliases)).toThrow(
      /cycle \(a -> b -> c -> a\)/,
    )
    // A loop that does not pass through the new alias is not its problem.
    expect(() => checkAlias('a', ['d'], config, aliases)).not.toThrow()
  })

  it('reports a write alias, so the caller can warn', () => {
    expect(checkAlias('x', ['api'], config, {})).toEqual({ writes: false })
    expect(
      checkAlias('x', ['create', 'crm/Accounts', '--allow-writes'], config, {}),
    ).toEqual({ writes: true })
    expect(checkAlias('x', ['mandate', 'delete'], config, {})).toEqual({
      writes: true,
    })
  })
})
