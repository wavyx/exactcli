import { describe, it, expect, afterEach } from 'vitest'
import {
  WRITE_METHODS,
  assertWritesAllowed,
  writeFlags,
  writesAllowed,
} from '../../src/lib/writes.js'

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
