import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** @type {import('../../src/lib/lock.js').withLock} */
let withLock
/** @type {typeof import('../../src/lib/errors.js').CliError} */
let CliError
let tmpDir
let locksDir

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'exactcli-lock-test-'))
  locksDir = join(tmpDir, 'locks')
  process.env.EXACTCLI_CONFIG_DIR = tmpDir
  // config.js caches the Conf instance in a module-level variable, so a fresh
  // module registry is the only way to point the lock directory at this
  // test's temp dir. errors.js must come from the same registry, otherwise
  // `instanceof CliError` compares two different class objects.
  vi.resetModules()
  const lockModule = await import('../../src/lib/lock.js')
  const errorsModule = await import('../../src/lib/errors.js')
  withLock = lockModule.withLock
  CliError = errorsModule.CliError
})

afterEach(() => {
  delete process.env.EXACTCLI_CONFIG_DIR
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('withLock', () => {
  it('holds the lock while fn runs and releases it after', async () => {
    const lockPath = join(locksDir, 'oauth-default.lock')
    let heldDuringFn

    const result = await withLock('oauth-default', async () => {
      heldDuringFn = existsSync(lockPath)
      return 'token'
    })

    expect(heldDuringFn).toBe(true)
    expect(result).toBe('token')
    expect(existsSync(lockPath)).toBe(false)
  })

  it('releases the lock and re-throws when fn fails', async () => {
    const lockPath = join(locksDir, 'oauth-default.lock')
    const boom = new Error('refresh failed')

    await expect(
      withLock('oauth-default', () => {
        throw boom
      }),
    ).rejects.toBe(boom)

    expect(existsSync(lockPath)).toBe(false)
  })

  it('replaces a lock older than staleMs', async () => {
    const lockPath = join(locksDir, 'stale.lock')
    mkdirSync(lockPath, { recursive: true })
    writeFileSync(join(lockPath, 'marker'), '')
    const old = new Date(Date.now() - 120_000)
    utimesSync(lockPath, old, old)
    let markerSeen

    await withLock(
      'stale',
      () => {
        markerSeen = existsSync(join(lockPath, 'marker'))
      },
      { staleMs: 60_000 },
    )

    // The marker is gone, so the stale lock was removed and not reused.
    expect(markerSeen).toBe(false)
    expect(existsSync(lockPath)).toBe(false)
  })

  it('treats a lock it cannot stat as stale', async () => {
    mkdirSync(locksDir, { recursive: true })
    const lockPath = join(locksDir, 'dangling.lock')
    // A dangling symlink answers EEXIST to mkdir and ENOENT to stat, which is
    // what a holder that releases between those two calls looks like.
    symlinkSync(join(tmpDir, 'gone'), lockPath)
    const fn = vi.fn()

    await withLock('dangling', fn)

    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('gives up with exit code 75 when a holder keeps the lock', async () => {
    const lockPath = join(locksDir, 'busy.lock')
    mkdirSync(lockPath, { recursive: true })
    const fn = vi.fn()

    const err = await withLock('busy', fn, { waitMs: 300 }).catch((e) => e)

    expect(err).toBeInstanceOf(CliError)
    expect(err.exitCode).toBe(75)
    expect(err.message).toBe(
      'Another exactcli process holds the lock for busy. Retry in a moment.',
    )
    expect(fn).not.toHaveBeenCalled()
    // The other holder's lock survives the timeout.
    expect(existsSync(lockPath)).toBe(true)
  })

  it('acquires the lock after the holder releases it', async () => {
    const lockPath = join(locksDir, 'handover.lock')
    mkdirSync(lockPath, { recursive: true })
    const release = setTimeout(
      () => rmSync(lockPath, { recursive: true, force: true }),
      150,
    )

    const result = await withLock('handover', () => 'acquired', {
      waitMs: 5_000,
    })

    clearTimeout(release)
    expect(result).toBe('acquired')
    expect(existsSync(lockPath)).toBe(false)
  })

  it('propagates a filesystem error that is not contention', async () => {
    // The name exceeds the filename limit, so the mkdir of the lock fails
    // before any contention. Only EEXIST means contention; everything else
    // must surface with its own errno.
    const fn = vi.fn()

    const err = await withLock('x'.repeat(300), fn).catch((e) => e)

    expect(err).not.toBeInstanceOf(CliError)
    expect(err.code).toBeDefined()
    expect(fn).not.toHaveBeenCalled()
  })

  it.each(['../oauth-default', 'a/b', ''])(
    'refuses the lock name %o with exit 70',
    async (name) => {
      const fn = vi.fn()

      const err = await withLock(name, fn).catch((e) => e)

      expect(err).toBeInstanceOf(CliError)
      expect(err.exitCode).toBe(70)
      expect(err.message).toMatch(/Invalid lock name/)
      expect(fn).not.toHaveBeenCalled()
    },
  )

  it('serializes concurrent callers after a stale takeover', async () => {
    const lockPath = join(locksDir, 'shared.lock')
    mkdirSync(lockPath, { recursive: true })
    const old = new Date(Date.now() - 120_000)
    utimesSync(lockPath, old, old)
    const spans = []
    const section = async (id) => {
      const enter = Date.now()
      await new Promise((resolve) => setTimeout(resolve, 60))
      spans.push({ id, enter, exit: Date.now() })
    }

    await Promise.all([
      withLock('shared', () => section('a'), { waitMs: 5_000 }),
      withLock('shared', () => section('b'), { waitMs: 5_000 }),
    ])

    const [first, second] = spans
    expect(spans).toHaveLength(2)
    expect(first.id).not.toBe(second.id)
    // The second caller enters only after the first one left.
    expect(second.enter).toBeGreaterThanOrEqual(first.exit)
    // No lock and no claimed stale directory survives the run.
    expect(readdirSync(locksDir)).toEqual([])
  })

  it('times out instead of spinning when it cannot claim a stale lock', async () => {
    // A name this long makes the claim target exceed the 255 byte filename
    // limit, so every rename fails: the loop must fall through to the wait,
    // not retry the takeover forever.
    const name = 'x'.repeat(240)
    const lockPath = join(locksDir, `${name}.lock`)
    mkdirSync(lockPath, { recursive: true })
    const old = new Date(Date.now() - 120_000)
    utimesSync(lockPath, old, old)
    const fn = vi.fn()

    const err = await withLock(name, fn, { waitMs: 300 }).catch((e) => e)

    expect(err).toBeInstanceOf(CliError)
    expect(err.exitCode).toBe(75)
    expect(fn).not.toHaveBeenCalled()
    expect(existsSync(lockPath)).toBe(true)
  })
})
