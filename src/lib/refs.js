import { CliError } from './errors.js'
import { divisionPath, unwrap } from './odata.js'

export const GUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Exact stores a numeric code right-aligned in a field this wide. */
const CODE_WIDTH = 18

/**
 * A numeric code as Exact stores it: right-aligned in 18 characters. Any
 * other code is returned as it is.
 * @param {string} code
 * @returns {string}
 */
export const padCode = (code) =>
  /^\d+$/.test(code) ? code.padStart(CODE_WIDTH, ' ') : code

/** @param {string} value @returns {string} */
export const quote = (value) => `'${String(value).replace(/'/g, "''")}'`

async function lookup(cmd, path, code) {
  const body = await cmd.apiClient.get(path, {
    query: {
      $filter: `Code eq ${quote(code)}`,
      $select: 'ID,Code,Name',
      $top: 2,
    },
  })
  const rows = unwrap(body)
  return Array.isArray(rows) ? rows : []
}

/**
 * Turn a reference into a GUID: a GUID passes through, a code is looked up
 * on the resource. A numeric code that finds nothing is tried again padded.
 * @param {{ apiClient: object, resolveDivision: () => number }} cmd
 * @param {string} resource `service/Resource` that carries the Code
 * @param {string} value
 * @returns {Promise<string>}
 */
export async function resolveRef(cmd, resource, value) {
  if (GUID_RE.test(value)) return value
  const path = divisionPath(cmd.resolveDivision(), resource)
  let rows = await lookup(cmd, path, value)
  if (rows.length === 0 && padCode(value) !== value) {
    rows = await lookup(cmd, path, padCode(value))
  }
  if (rows.length === 0) {
    throw new CliError(`No ${resource} with Code ${value}`, { exitCode: 65 })
  }
  if (rows.length > 1) {
    const names = rows.map((r) => `${r.Name} (${r.ID})`).join(', ')
    throw new CliError(`Ambiguous code ${value} on ${resource}: ${names}`, {
      exitCode: 65,
    })
  }
  return rows[0].ID
}
