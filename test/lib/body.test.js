import { describe, it, expect, vi } from 'vitest'
import { Readable } from 'node:stream'
import { readFileSync } from 'node:fs'

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
}))

const { resolveBody } = await import('../../src/lib/body.js')

describe('resolveBody', () => {
  it('returns inline text from the --body flag', async () => {
    expect(await resolveBody({ body: 'hello world' })).toBe('hello world')
  })

  it('reads the file when --body starts with @', async () => {
    readFileSync.mockReturnValue('file contents here')
    const result = await resolveBody({ body: '@payload.json' })
    expect(readFileSync).toHaveBeenCalledWith('payload.json', 'utf8')
    expect(result).toBe('file contents here')
  })

  it('throws a usage error (exit 64) when there is no body and stdin is a TTY', async () => {
    const origIsTTY = process.stdin.isTTY
    process.stdin.isTTY = true
    const err = await resolveBody({}).catch((e) => e)
    expect(err.message).toMatch(/--body is required/)
    expect(err.exitCode).toBe(64)
    process.stdin.isTTY = origIsTTY
  })

  it('reads from stdin when it is not a TTY and there is no --body flag', async () => {
    const origStdin = process.stdin

    const mockStdin = Readable.from([Buffer.from('stdin content\n')])
    mockStdin.isTTY = false
    Object.defineProperty(process, 'stdin', {
      value: mockStdin,
      writable: true,
      configurable: true,
    })

    expect(await resolveBody({})).toBe('stdin content')

    Object.defineProperty(process, 'stdin', {
      value: origStdin,
      writable: true,
      configurable: true,
    })
  })
})
