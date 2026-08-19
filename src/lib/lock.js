import { mkdirSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'
import createDebug from 'debug'
import { getConf } from './config.js'
import { CliError } from './errors.js'

const debug = createDebug('exact:lock')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Run fn while holding a cross-process lock. mkdir is atomic on every
 * platform, so the directory itself is the lock. A refresh token is single
 * use: two exactcli processes that spend the same token leave one of them
 * logged out, so the refresh path takes this lock first.
 *
 * @template T
 * @param {string} name lock identity, for example `oauth-default`
 * @param {() => Promise<T> | T} fn
 * @param {{ waitMs?: number, staleMs?: number }} [options]
 * @returns {Promise<T>}
 */
export async function withLock(
  name,
  fn,
  { waitMs = 30_000, staleMs = 60_000 } = {},
) {
  const dir = path.join(path.dirname(getConf().path), 'locks')
  const lockPath = path.join(dir, `${name}.lock`)
  mkdirSync(dir, { recursive: true })

  const start = Date.now()
  for (;;) {
    try {
      mkdirSync(lockPath)
      break
    } catch (err) {
      if (err.code !== 'EEXIST') throw err
      // A lock we cannot stat vanished between the mkdir and the stat, or it
      // is a leftover that points nowhere. Both are stale.
      const stat = statSync(lockPath, { throwIfNoEntry: false })
      const age = stat ? Date.now() - stat.mtimeMs : Infinity
      if (age > staleMs) {
        debug('remove stale lock %s (age %dms)', lockPath, age)
        rmSync(lockPath, { recursive: true, force: true })
        continue
      }
      if (Date.now() - start > waitMs) {
        throw new CliError(
          `Another exactcli process holds the lock for ${name}. Retry in a moment.`,
          { exitCode: 75 },
        )
      }
      debug('wait for lock %s', lockPath)
      // Jitter, so two waiters do not retry in lockstep.
      await sleep(100 + Math.random() * 200)
    }
  }

  try {
    return await fn()
  } finally {
    rmSync(lockPath, { recursive: true, force: true })
  }
}
