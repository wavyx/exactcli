import { findResource, keyType } from './catalog.js'
import { CliError, RefNotFoundError } from './errors.js'
import { divisionPath, unwrap } from './odata.js'

export const GUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * A plain Exact Online key: a number, a code, an enum value. The key travels
 * unquoted inside the parentheses, so anything outside this set could close
 * them and append its own OData. Refuse it before it reaches the wire.
 */
const PLAIN_KEY_RE = /^[A-Za-z0-9_.:-]+$/

/**
 * A string key travels quoted, so only the quote itself needs care: it is
 * doubled. What the URL parser would split or rewrite is refused instead.
 */
const STRING_KEY_RE = /^[^?#/\\%]+$/

/** @param {string} value @returns {string} */
export const quote = (value) => `'${String(value).replace(/'/g, "''")}'`

/**
 * The key suffix of a record path: `(guid'...')` for a GUID column, `('...')`
 * for a string column, `(123)` for any other key. The catalogue says which
 * one the resource wants; an unknown resource keeps the guess.
 * @param {object | undefined} resource catalogue record
 * @param {string} ref what the user typed, for the message
 * @param {string} id
 * @returns {string}
 */
export function renderKey(resource, ref, id) {
  const isGuid = GUID_RE.test(id)
  const wanted = resource ? keyType(resource) : undefined
  if (wanted === 'string') {
    if (!STRING_KEY_RE.test(id)) {
      throw new CliError(`Record key of ${ref} must not contain ? # / \\ %`, {
        exitCode: 64,
      })
    }
    return `(${quote(id)})`
  }
  if (wanted === 'guid' && !isGuid) {
    throw new CliError(`Record key of ${ref} must be a GUID`, { exitCode: 64 })
  }
  if (wanted === 'plain' && isGuid) {
    throw new CliError(
      `Record key of ${ref} must be a plain key (letters, digits, _ . : -)`,
      { exitCode: 64 },
    )
  }
  if (!isGuid && !PLAIN_KEY_RE.test(id)) {
    throw new CliError(
      'Record key must be a GUID or a plain key (letters, digits, _ . : -)',
      { exitCode: 64 },
    )
  }
  return isGuid ? `(guid'${id}')` : `(${id})`
}

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

/**
 * The field that names a record: `Name` on an account, `Description` on a
 * ledger account or an item. Asking for a field a resource lacks is a 400.
 * @param {string} resource
 * @returns {string}
 */
export function labelField(resource) {
  const names = new Set(
    (findResource(resource)?.properties ?? []).map((p) => p.name),
  )
  if (names.size === 0 || names.has('Name')) return 'Name'
  return names.has('Description') ? 'Description' : 'Code'
}

async function lookup(cmd, path, code, label) {
  const select = [...new Set(['ID', 'Code', label])].join(',')
  const body = await cmd.apiClient.get(path, {
    query: { $filter: `Code eq ${quote(code)}`, $select: select, $top: 2 },
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
  const label = labelField(resource)
  let rows = await lookup(cmd, path, value, label)
  if (rows.length === 0 && padCode(value) !== value) {
    rows = await lookup(cmd, path, padCode(value), label)
  }
  if (rows.length === 0) {
    throw new RefNotFoundError(`No ${resource} with Code ${value}`)
  }
  if (rows.length > 1) {
    const names = rows.map((r) => `${r[label]} (${r.ID})`).join(', ')
    throw new CliError(`Ambiguous code ${value} on ${resource}: ${names}`, {
      exitCode: 65,
    })
  }
  return rows[0].ID
}
