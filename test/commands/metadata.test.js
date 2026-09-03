import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCmd } from '../helpers.js'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-metadata-'))

const { default: Cmd, shortName } =
  await import('../../src/commands/metadata.js')

beforeAll(() => {
  process.env.EXACTCLI_CONFIG_DIR = TMP_CONFIG_DIR
})

afterAll(() => {
  delete process.env.EXACTCLI_CONFIG_DIR
  rmSync(TMP_CONFIG_DIR, { recursive: true, force: true })
})

beforeEach(() => {
  process.stdout.isTTY = false
})

describe('metadata', () => {
  it('lists the properties of a resource', async () => {
    const out = JSON.parse(await runCmd(Cmd, ['crm/Accounts']))
    expect(out[0]).toEqual(
      expect.objectContaining({ name: 'ID', type: 'Edm.Guid', key: true }),
    )
    expect(Object.keys(out[0])).toEqual([
      'name',
      'type',
      'key',
      'mandatory',
      'filter',
      'post',
      'put',
      'description',
    ])
    expect(out.some((p) => p.name === 'Name' && p.mandatory)).toBe(true)
  })

  it('filters to mandatory or filterable properties', async () => {
    const mandatory = JSON.parse(
      await runCmd(Cmd, ['crm/Accounts', '--mandatory']),
    )
    expect(mandatory.map((p) => p.name)).toEqual(['Name'])
    const filterable = JSON.parse(
      await runCmd(Cmd, [
        'financialtransaction/TransactionLines',
        '--filterable',
      ]),
    )
    expect(filterable.map((p) => p.name)).toContain('FinancialYear')
    expect(filterable.every((p) => p.filter === 'yes')).toBe(true)
  })

  it('shows the resource summary with --methods', async () => {
    const out = JSON.parse(await runCmd(Cmd, ['crm/Accounts', '--methods']))
    expect(out).toEqual({
      uri: '/api/v1/{division}/crm/Accounts',
      family: 'regular',
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      keys: ['ID'],
      webhook: true,
      scope: 'crm-accounts',
      mandatoryFilters: null,
      properties: expect.any(Number),
    })
  })

  it('searches resources with --search', async () => {
    const out = JSON.parse(await runCmd(Cmd, ['--search', 'GLAccount']))
    expect(out[0]).toEqual({
      resource: 'financial/GLAccounts',
      family: 'regular',
      methods: 'GET POST PUT DELETE',
      properties: expect.any(Number),
    })
  })

  it('prints a table in a terminal', async () => {
    process.stdout.isTTY = true
    const out = await runCmd(Cmd, ['system/Divisions', '--methods'])
    expect(out).toMatch(/Divisions/)
    const table = await runCmd(Cmd, ['--search', 'Divisions'])
    expect(table).toMatch(/system\/Divisions/)
  })

  it('fails with 65 on an unknown resource and suggests --search', async () => {
    process.stdout.isTTY = true
    const err = await Cmd.run(['crm/Nope']).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(65)
    expect(err.message).toMatch(
      /not in the catalogue of \d{4}-\d{2}-\d{2}.*--search/,
    )
  })

  it('fails with 64 without a resource and without --search', async () => {
    process.stdout.isTTY = true
    const err = await Cmd.run([]).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
  })

  it('shortName strips the api prefix and the division', () => {
    expect(shortName({ uri: '/api/v1/{division}/crm/Accounts' })).toBe(
      'crm/Accounts',
    )
    expect(shortName({ uri: '/api/v1/beta/{division}/crm/X' })).toBe('crm/X')
    expect(shortName({ uri: '/api/v1/current/Me' })).toBe('current/Me')
    expect(shortName({ uri: '/api/v1/{division}/sync/CRM/Accounts' })).toBe(
      'sync/CRM/Accounts',
    )
  })
})
