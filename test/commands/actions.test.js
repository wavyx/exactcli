import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import nock from 'nock'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCmd } from '../helpers.js'
import { actions } from '../../src/lib/typed/actions.js'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-actions-'))
const ID = '11111111-1111-1111-1111-111111111111'

/** The flags a dry run of each action needs, when it has required ones. */
const REQUIRED = {
  'quotation:email': ['--email-layout', ID],
  'assembly-order:finish': ['--quantity', '1'],
  'return:process': ['--status', '50'],
  'custom-field:set': [
    '--component',
    'Account',
    '--record',
    ID,
    '--value',
    'x',
  ],
}

beforeAll(() => {
  process.env.EXACTCLI_CONFIG_DIR = TMP_CONFIG_DIR
  process.env.EXACTCLI_ACCESS_TOKEN = 'test-token'
  process.env.EXACTCLI_DIVISION = '123'
})

afterAll(() => {
  delete process.env.EXACTCLI_CONFIG_DIR
  delete process.env.EXACTCLI_ACCESS_TOKEN
  delete process.env.EXACTCLI_DIVISION
  rmSync(TMP_CONFIG_DIR, { recursive: true, force: true })
})

beforeEach(() => {
  nock.disableNetConnect()
  process.stdout.isTTY = false
})

describe('action commands', () => {
  it.each(Object.keys(actions))('%s dry-runs its POST', async (key) => {
    const [topic, verb] = key.split(':')
    const { default: Cmd } = await import(
      `../../src/commands/${topic}/${verb}.js`
    )
    const action = actions[key]
    expect(Cmd.action).toBe(action)
    const target = action.target.type === 'string' ? 'Segment' : ID
    const out = JSON.parse(
      await runCmd(Cmd, [target, ...(REQUIRED[key] ?? []), '--dry-run']),
    )
    expect(out.method).toBe('POST')
    expect(out.path).toBe(`/api/v1/123/${action.resource}`)
    expect(out.body[action.target.field]).toBe(target)
  })
})
