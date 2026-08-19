import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import hook from '../../src/hooks/command-not-found.js'

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
  })

  afterEach(() => {
    spy.mockRestore()
    process.exitCode = undefined
  })

  it('names the unknown command and points at the help', async () => {
    await hook({ id: 'sales-entrie list', argv: [] })
    expect(writes.join('')).toBe(
      'Command "sales-entrie list" not found. Run: exactcli --help\n',
    )
  })

  it('exits 127', async () => {
    await hook({ id: 'nope', argv: [] })
    expect(process.exitCode).toBe(127)
  })

  it('returns nothing, so oclif adds no second error', async () => {
    await expect(hook({ id: 'nope', argv: [] })).resolves.toBeUndefined()
  })
})
