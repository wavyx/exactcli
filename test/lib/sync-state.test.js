import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  finishSync,
  readState,
  resolveSince,
  writeState,
} from '../../src/lib/sync-state.js'

const dir = mkdtempSync(join(tmpdir(), 'exactcli-sync-state-'))
const file = join(dir, 'state.json')

afterEach(() => {
  rmSync(file, { force: true })
  vi.restoreAllMocks()
})

describe('readState and writeState', () => {
  it('reads an absent file as an empty state', () => {
    expect(readState(file)).toEqual({})
  })

  it('writes through a temporary file and reads it back', () => {
    writeState(file, { 'sync/CRM/Accounts': 20 })
    expect(existsSync(`${file}.tmp`)).toBe(false)
    expect(readFileSync(file, 'utf8')).toBe('{\n  "sync/CRM/Accounts": 20\n}\n')
    expect(readState(file)).toEqual({ 'sync/CRM/Accounts': 20 })
  })

  it('fails with 65 on a file that is not JSON', () => {
    writeFileSync(file, 'nope')
    const err = (() => {
      try {
        readState(file)
      } catch (e) {
        return e
      }
    })()
    expect(err.exitCode).toBe(65)
    expect(err.message).toMatch(/is not valid JSON/)
  })
})

describe('resolveSince', () => {
  it('prefers the flag, then the state, then zero', () => {
    expect(resolveSince({ since: '7' }, { k: 20 }, 'k')).toBe(7)
    expect(resolveSince({}, { k: 20 }, 'k')).toBe(20)
    expect(resolveSince({}, {}, 'k')).toBe(0)
  })

  it('rejects a --since that is not digits with 64', () => {
    const err = (() => {
      try {
        resolveSince({ since: 'yesterday' }, {}, 'k')
      } catch (e) {
        return e
      }
    })()
    expect(err.exitCode).toBe(64)
  })
})

describe('finishSync', () => {
  const stderr = () =>
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

  it('reports the next timestamp and writes the state after a complete walk', () => {
    const spy = stderr()
    finishSync(
      { rows: [{}], max: 20, complete: true },
      { since: 0, key: 'k', stateFile: file, state: { other: 1 } },
    )
    expect(spy).toHaveBeenCalledWith('Next timestamp: 20\n')
    expect(readState(file)).toEqual({ other: 1, k: 20 })
  })

  it('reports no changes and leaves the state alone', () => {
    const spy = stderr()
    finishSync(
      { rows: [], max: 20, complete: true },
      { since: 20, key: 'k', stateFile: file, state: {} },
    )
    expect(spy).toHaveBeenCalledWith('No changes since 20\n')
    expect(existsSync(file)).toBe(false)
  })

  it('does not write the state after a partial walk or without a file', () => {
    stderr()
    finishSync(
      { rows: [{}], max: 20, complete: false },
      { since: 0, key: 'k', stateFile: file, state: {} },
    )
    expect(existsSync(file)).toBe(false)
    finishSync(
      { rows: [{}], max: 20, complete: true },
      { since: 0, key: 'k', state: {} },
    )
    expect(existsSync(file)).toBe(false)
  })
})
