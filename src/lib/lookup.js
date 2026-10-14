import { shortName } from './catalog.js'
import { CliError } from './errors.js'
import { labelField, GUID_RE, padCode, quote } from './refs.js'
import { divisionPath, normalize, unwrap } from './odata.js'

const NUMBER_TYPES = new Set([
  'Edm.Int16',
  'Edm.Int32',
  'Edm.Int64',
  'Edm.Byte',
  'Edm.Double',
])
const NUMBER_RE = /^-?\d+(\.\d+)?$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * The `--match Field=value` pairs, split at the first `=`.
 * @param {string[]} pairs
 * @returns {{ field: string, value: string }[]}
 */
export function parseMatch(pairs = []) {
  if (pairs.length === 0) {
    throw new CliError('Give at least one --match Field=value', {
      exitCode: 64,
    })
  }
  return pairs.map((pair) => {
    const at = pair.indexOf('=')
    if (at < 1) {
      throw new CliError(`--match expects Field=value, received ${pair}`, {
        exitCode: 64,
      })
    }
    return { field: pair.slice(0, at), value: pair.slice(at + 1) }
  })
}

/**
 * A value as the OData literal of its property type. The value lands in a
 * filter, so a value of the wrong shape is refused.
 * @param {{ name: string, type: string }} prop
 * @param {string} value
 * @returns {string}
 */
export function literal(prop, value) {
  const bad = (shape) =>
    new CliError(`${prop.name} expects ${shape}, received ${value}`, {
      exitCode: 64,
    })
  if (prop.type === 'Edm.String') return quote(value)
  if (prop.type === 'Edm.Guid') {
    if (!GUID_RE.test(value)) throw bad('a GUID')
    return `guid'${value}'`
  }
  if (NUMBER_TYPES.has(prop.type)) {
    if (!NUMBER_RE.test(value)) throw bad('a number')
    return value
  }
  if (prop.type === 'Edm.Boolean') {
    const v = value.toLowerCase()
    if (v !== 'true' && v !== 'false') throw bad('true or false')
    return v
  }
  if (prop.type === 'Edm.DateTime') {
    if (!DATE_RE.test(value)) throw bad('YYYY-MM-DD')
    return `datetime'${value}'`
  }
  throw new CliError(`${prop.name} (${prop.type}) cannot be matched`, {
    exitCode: 64,
  })
}

/**
 * A match value as a body field: a number or a boolean property gets the
 * typed value, the rest stays text. Call it after literal() checked it.
 * @param {{ type: string }} prop
 * @param {string} value
 * @returns {string | number | boolean}
 */
export function bodyValue(prop, value) {
  if (NUMBER_TYPES.has(prop.type)) return Number(value)
  if (prop.type === 'Edm.Boolean') return value.toLowerCase() === 'true'
  return value
}

/**
 * The filter that matches every pair. Exact stores a numeric Code right
 * aligned in 18 characters, so such a Code matches either way.
 * @param {object} res catalogue record
 * @param {{ field: string, value: string }[]} matches
 * @returns {string}
 */
export function matchFilter(res, matches) {
  return matches
    .map(({ field, value }) => {
      const prop = res.properties.find((p) => p.name === field && !p.navigation)
      if (!prop) {
        throw new CliError(`${field} is not a field of ${shortName(res)}`, {
          exitCode: 64,
        })
      }
      // Only a text Code is padded: an Int32 Code is a plain number.
      const padded =
        field === 'Code' && prop.type === 'Edm.String' ? padCode(value) : value
      if (padded !== value) {
        return `(${field} eq ${literal(prop, value)} or ${field} eq ${literal(prop, padded)})`
      }
      return `${field} eq ${literal(prop, value)}`
    })
    .join(' and ')
}

/**
 * The records that match, with their key, label and matched fields.
 * @param {{ apiClient: object, resolveDivision: () => number }} cmd
 * @param {object} res catalogue record (regular family)
 * @param {{ field: string, value: string }[]} matches
 * @param {{ top?: number }} [options]
 * @returns {Promise<object[]>}
 */
export async function findMatches(cmd, res, matches, { top } = {}) {
  const ref = shortName(res)
  const names = new Set(res.properties.map((p) => p.name))
  const label = labelField(ref)
  const select = [
    ...new Set([
      ...res.keys,
      ...(names.has(label) ? [label] : []),
      ...matches.map((m) => m.field),
    ]),
  ]
  const query = {
    $filter: matchFilter(res, matches),
    $select: select.join(','),
  }
  if (top) query.$top = top
  const body = await cmd.apiClient.get(
    divisionPath(cmd.resolveDivision(), ref),
    {
      query,
    },
  )
  // One page answers a lookup; more means the match is too loose.
  if (!top && body?.d?.__next) {
    process.stderr.write('More matches than one page: add a --match.\n')
  }
  return unwrap(body).map(normalize)
}
