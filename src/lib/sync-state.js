import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { CliError } from './errors.js'
import { BULK_PAGE_SIZE, collectListing } from './listing.js'

/**
 * The state file of incremental reads: `{ "<key>": <last timestamp> }`.
 * @param {string} file
 * @returns {Record<string, number>}
 */
export function readState(file) {
  if (!existsSync(file)) return {}
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch (cause) {
    throw new CliError(`${file} is not valid JSON`, { exitCode: 65, cause })
  }
}

/**
 * Write the state through a temporary file: a crash never leaves half a
 * file behind.
 * @param {string} file
 * @param {Record<string, number>} state
 */
export function writeState(file, state) {
  const tmp = `${file}.tmp`
  writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`)
  renameSync(tmp, file)
}

/**
 * The timestamp to start from: the flag, else the state, else zero.
 * @param {{since?: string}} flags
 * @param {Record<string, number>} state
 * @param {string} key
 * @returns {number}
 */
export function resolveSince(flags, state, key) {
  if (flags.since !== undefined) {
    if (!/^\d+$/.test(flags.since)) {
      throw new CliError('--since expects a timestamp (digits)', {
        exitCode: 64,
      })
    }
    return Number(flags.since)
  }
  return Number(state[key] ?? 0)
}

/**
 * Walk a sync feed from a timestamp: pages of 1000, no $top, every page
 * unless --limit. Reports the highest timestamp seen and whether the walk
 * was complete (nothing left on the server, no cut by --limit).
 * @param {{ apiClient: object, flags: object }} cmd
 * @param {{ path: string, since: number, filter?: string, select?: string }} options
 * @returns {Promise<{ rows: object[], max: number, complete: boolean }>}
 */
export async function syncSince(cmd, { path, since, filter, select }) {
  const clauses = [`Timestamp gt ${since}L`]
  if (filter) clauses.push(filter)
  const query = { $filter: clauses.join(' and ') }
  if (select) {
    const fields = select.split(',').map((f) => f.trim())
    if (!fields.includes('Timestamp')) fields.push('Timestamp')
    query.$select = fields.join(',')
  }
  // A sync read wants every page: --limit is the only reason to stop early.
  cmd.flags.all = cmd.flags.limit === undefined
  const rows = await collectListing(cmd, path, query, {
    pageSize: BULK_PAGE_SIZE,
    noTop: true,
  })
  const max = rows.reduce(
    (best, row) => Math.max(best, Number(row.Timestamp)),
    since,
  )
  const complete =
    !cmd.apiClient.lastNext &&
    (cmd.flags.limit === undefined || rows.length < cmd.flags.limit)
  return { rows, max, complete }
}

/**
 * Report the next timestamp on stderr and, with a state file, remember it
 * after a complete walk.
 * @param {{ rows: object[], max: number, complete: boolean }} result
 * @param {{ since: number, key: string, stateFile?: string, state: object }} options
 */
export function finishSync(
  { rows, max, complete },
  { since, key, stateFile, state },
) {
  process.stderr.write(
    rows.length ? `Next timestamp: ${max}\n` : `No changes since ${since}\n`,
  )
  if (stateFile && complete && rows.length) {
    writeState(stateFile, { ...state, [key]: max })
  }
}
