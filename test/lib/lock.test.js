import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
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
    // The intermediate directory is missing, so the non-recursive mkdir fails
    // with ENOENT. Only EEXIST means contention; everything else must surface.
    const fn = vi.fn()

    const err = await withLock('missing/parent', fn).catch((e) => e)

    expect(err.code).toBe('ENOENT')
    expect(fn).not.toHaveBeenCalled()
  })
})
