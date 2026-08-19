import { runCommand } from '@oclif/test'
import nock from 'nock'
import { vi } from 'vitest'

export const HOST = 'start.exactonline.be'

export function apiBase(host = HOST) {
  return `https://${host}`
}

export function mockApi(host = HOST) {
  return nock(apiBase(host))
}

/**
 * Mock the OAuth token endpoint. `expires_in` is a string in Exact's answer.
 * `captured` fills with the decoded form body once the request arrives, so a
 * test can assert the grant parameters.
 * @param {object} [reply] fields that override the default answer
 * @param {string} [host]
 * @returns {{ scope: import('nock').Scope, captured: Record<string, string> }}
 */
export function mockTokenExchange(reply = {}, host = HOST) {
  const captured = {}
  const scope = mockApi(host)
    .post('/api/oauth2/token', (body) => {
      Object.assign(captured, Object.fromEntries(new URLSearchParams(body)))
      return true
    })
    .reply(200, {
      access_token: 'acc',
      token_type: 'Bearer',
      expires_in: '600',
      refresh_token: 'ref',
      ...reply,
    })
  return { scope, captured }
}

/**
 * Run an oclif command class and capture its console.log output.
 * Oclif Command.log ultimately calls console.log via @oclif/core ux.stdout.
 *
 * Errors are RETHROWN (with the captured stdout attached as `err.stdout`):
 * a happy-path test must fail loudly when the command actually errored.
 * Failure-path tests should call `CmdClass.run()` directly and assert.
 */
export async function runCmd(CmdClass, argv = []) {
  const lines = []
  const spy = vi.spyOn(console, 'log').mockImplementation((...args) => {
    lines.push(args.map(String).join(' '))
  })
  try {
    await CmdClass.run(argv)
  } catch (err) {
    if (err) err.stdout = lines.join('\n')
    throw err
  } finally {
    spy.mockRestore()
  }
  return lines.join('\n')
}

export { runCommand }
