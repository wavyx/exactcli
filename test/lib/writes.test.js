import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { Readable } from 'node:stream'
import nock from 'nock'
import { mockApi } from '../helpers.js'
import { createClient } from '../../src/lib/client.js'
import {
  WRITE_METHODS,
  applyRefs,
  assertWritesAllowed,
  coerce,
  describeRequest,
  parseSet,
  readBody,
  validateWrite,
  writeFlags,
  writesAllowed,
} from '../../src/lib/writes.js'

const GUID = '11111111-1111-1111-1111-111111111111'

afterEach(() => {
  delete process.env.EXACTCLI_ALLOW_WRITES
})

describe('writesAllowed', () => {
  it('is on with the flag', () => {
    expect(writesAllowed({ 'allow-writes': true })).toBe(true)
  })

  it('is on with EXACTCLI_ALLOW_WRITES=1 only', () => {
    process.env.EXACTCLI_ALLOW_WRITES = '1'
    expect(writesAllowed({})).toBe(true)
    process.env.EXACTCLI_ALLOW_WRITES = 'true'
    expect(writesAllowed({})).toBe(false)
  })

  it('is off by default', () => {
    expect(writesAllowed({})).toBe(false)
  })
})

describe('assertWritesAllowed', () => {
  it('never checks a read', () => {
    expect(() => assertWritesAllowed({}, 'GET')).not.toThrow()
  })

  it('refuses a write with exit 77 and the fix', () => {
    for (const method of WRITE_METHODS) {
      const err = (() => {
        try {
          assertWritesAllowed({}, method)
        } catch (e) {
          return e
        }
      })()
      expect(err.exitCode).toBe(77)
      expect(err.message).toBe(
        'Writes are off. Add --allow-writes (and --yes for DELETE).',
      )
    }
  })

  it('accepts POST and PUT with the flag, DELETE only with --yes too', () => {
    const flags = { 'allow-writes': true }
    expect(() => assertWritesAllowed(flags, 'POST')).not.toThrow()
    expect(() => assertWritesAllowed(flags, 'PUT')).not.toThrow()
    expect(() => assertWritesAllowed(flags, 'DELETE')).toThrow(
      /DELETE needs --yes/,
    )
    expect(() =>
      assertWritesAllowed({ ...flags, yes: true }, 'DELETE'),
    ).not.toThrow()
  })

  it('exposes the two flags', () => {
    expect(Object.keys(writeFlags)).toEqual(['allow-writes', 'yes'])
  })
})

describe('parseSet and coerce', () => {
  it('splits on the first = and coerces the values', () => {
    expect(
      parseSet(['Name=Acme', 'Status=C', 'Note=a=b', 'Blocked=false']),
    ).toEqual({
      Name: 'Acme',
      Status: 'C',
      Note: 'a=b',
      Blocked: false,
    })
    expect(parseSet()).toEqual({})
  })

  it('rejects a pair without = or with an empty key', () => {
    for (const pair of ['Name', '=x']) {
      const err = (() => {
        try {
          parseSet([pair])
        } catch (e) {
          return e
        }
      })()
      expect(err.exitCode).toBe(64)
      expect(err.message).toMatch(/--set expects Key=value/)
    }
  })

  it('coerces null, booleans, numbers, markers and strings', () => {
    expect(coerce('null')).toBeNull()
    expect(coerce('true')).toBe(true)
    expect(coerce('false')).toBe(false)
    expect(coerce('42')).toBe(42)
    expect(coerce('-1.5')).toBe(-1.5)
    expect(coerce('@str:42')).toBe('42')
    expect(coerce(`@guid:${GUID}`)).toBe(GUID)
    expect(coerce('@ref:crm/Accounts:1001')).toEqual({
      $ref: 'crm/Accounts',
      code: '1001',
    })
    expect(coerce('Acme')).toBe('Acme')
  })

  it('rejects a bad @guid or @ref marker with 64', () => {
    for (const text of ['@guid:nope', '@ref:crm/Accounts', '@ref:nope:1']) {
      const err = (() => {
        try {
          coerce(text)
        } catch (e) {
          return e
        }
      })()
      expect(err.exitCode).toBe(64)
    }
  })
})

describe('applyRefs', () => {
  let cmd
  beforeEach(() => {
    nock.disableNetConnect()
    process.env.EXACTCLI_ACCESS_TOKEN = 'test-token'
    cmd = {
      apiClient: createClient({ token: 'test-token', retry: false }),
      resolveDivision: () => 123,
    }
  })
  afterEach(() => {
    nock.cleanAll()
    nock.enableNetConnect()
    delete process.env.EXACTCLI_ACCESS_TOKEN
  })

  it('resolves every marker, deep, and leaves the rest untouched', async () => {
    const scope = mockApi()
      .get('/api/v1/123/crm/Accounts')
      .query({ $filter: "Code eq 'ACME'", $select: 'ID,Code,Name', $top: '2' })
      .reply(200, { d: { results: [{ ID: GUID }] } })

    const body = await applyRefs(cmd, {
      Customer: { $ref: 'crm/Accounts', code: 'ACME' },
      Lines: [{ Amount: 1, Note: null }],
      Name: 'x',
    })

    expect(body).toEqual({
      Customer: GUID,
      Lines: [{ Amount: 1, Note: null }],
      Name: 'x',
    })
    expect(scope.isDone()).toBe(true)
  })
})

describe('validateWrite', () => {
  it('returns the record when the body fits', () => {
    const res = validateWrite({
      resource: 'crm/Accounts',
      body: { Name: 'Acme' },
      method: 'POST',
    })
    expect(res.resource).toBe('Accounts')
  })

  it('lists every problem in one message', () => {
    const err = (() => {
      try {
        validateWrite({
          resource: 'crm/Accounts',
          body: { Nope: 1, Other: 2 },
          method: 'POST',
        })
      } catch (e) {
        return e
      }
    })()
    expect(err.exitCode).toBe(64)
    expect(err.message).toBe(
      'crm/Accounts: missing mandatory fields: Name; unknown fields: Nope, Other',
    )
  })

  it('refuses a method the resource lacks and read-only fields on PUT', () => {
    expect(() =>
      validateWrite({
        resource: 'financialtransaction/TransactionLines',
        body: {},
        method: 'DELETE',
      }),
    ).toThrow(
      /method DELETE not allowed on financialtransaction\/TransactionLines \(allowed: GET\)/,
    )
    expect(() =>
      validateWrite({
        resource: 'crm/Accounts',
        body: { ID: GUID, Name: 'x' },
        method: 'PUT',
      }),
    ).toThrow(/read-only fields on PUT: ID/)
  })

  it('ignores an unknown field on a forced PUT', () => {
    const res = validateWrite({
      resource: 'crm/Accounts',
      body: { Nope: 1 },
      method: 'PUT',
      force: true,
    })
    expect(res.resource).toBe('Accounts')
  })

  it('refuses an unknown resource unless forced, and force skips unknown fields', () => {
    expect(() =>
      validateWrite({ resource: 'crm/Nope', body: {}, method: 'POST' }),
    ).toThrow(/unknown resource crm\/Nope/)
    expect(
      validateWrite({
        resource: 'crm/Nope',
        body: {},
        method: 'POST',
        force: true,
      }),
    ).toBeUndefined()
    expect(
      validateWrite({
        resource: 'crm/Accounts',
        body: { Name: 'x', Nope: 1 },
        method: 'POST',
        force: true,
      }).resource,
    ).toBe('Accounts')
  })
})

describe('describeRequest and readBody', () => {
  afterEach(() => {
    process.stdin.isTTY = undefined
  })

  it('describes a request', () => {
    expect(
      describeRequest({ method: 'POST', path: '/x', body: { a: 1 } }),
    ).toEqual({
      method: 'POST',
      path: '/x',
      body: { a: 1 },
    })
  })

  it('parses --body, defaults to an empty body with --set or in a terminal', async () => {
    expect(await readBody({ body: '{"Name":"Acme"}' })).toEqual({
      Name: 'Acme',
    })
    expect(await readBody({ set: ['Name=Acme'] })).toEqual({})
    process.stdin.isTTY = true
    expect(await readBody({})).toEqual({})
  })

  it('reads a piped body when nothing else says what to send', async () => {
    const original = Object.getOwnPropertyDescriptor(process, 'stdin')
    Object.defineProperty(process, 'stdin', {
      value: Readable.from([Buffer.from('{"Name":"Piped"}')]),
      configurable: true,
    })
    try {
      expect(await readBody({})).toEqual({ Name: 'Piped' })
    } finally {
      Object.defineProperty(process, 'stdin', original)
    }
  })

  it('rejects a body that is not valid JSON with 64', async () => {
    const err = await readBody({ body: 'nope' }).catch((e) => e)
    expect(err.exitCode).toBe(64)
    expect(err.message).toMatch(/--body is not valid JSON/)
  })
})
