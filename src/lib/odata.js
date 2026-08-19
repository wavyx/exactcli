import { Flags } from '@oclif/core'
import { CliError, ConfigError } from './errors.js'

/** Regex for the Exact Online /Date(ms)/ or /Date(ms+offset)/ literal. */
export const DATE_RE = /^\/Date\((-?\d+)([+-]\d{4})?\)\/$/

const NO_DIVISION_MESSAGE =
  'No division configured. Run: exactcli auth login or exactcli config set division <code>'

/** Global flags shared by every command that lists or reads a collection. */
export const odataFlags = {
  filter: Flags.string({ description: 'OData $filter expression' }),
  select: Flags.string({
    description: 'Comma-separated properties for $select',
  }),
  expand: Flags.string({ description: 'OData $expand expression' }),
  orderby: Flags.string({ description: 'OData $orderby expression' }),
  top: Flags.integer({
    description: 'Page size ($top), max 60',
    min: 1,
    max: 60,
  }),
}

/**
 * @param {{filter?: string, select?: string, expand?: string, orderby?: string, top?: number}} flags
 * @returns {object}
 */
export function buildQuery(flags) {
  const query = {}
  if (flags.filter) query.$filter = flags.filter
  if (flags.select) query.$select = flags.select
  if (flags.expand) query.$expand = flags.expand
  if (flags.orderby) query.$orderby = flags.orderby
  if (flags.top !== undefined) query.$top = flags.top
  return query
}

/**
 * @param {number|string} value
 * @returns {number}
 */
export function requireDivision(value) {
  const isDigitString = typeof value === 'string' && /^\d+$/.test(value)
  const isPositiveInteger =
    (typeof value === 'number' && Number.isInteger(value)) || isDigitString
  if (!isPositiveInteger || Number(value) <= 0) {
    throw new ConfigError(NO_DIVISION_MESSAGE)
  }
  return Number(value)
}

/**
 * @param {string} resource
 * @returns {boolean}
 */
function isValidResource(resource) {
  return (
    typeof resource === 'string' &&
    resource.includes('/') &&
    !resource.includes('..') &&
    !resource.includes('?')
  )
}

/**
 * @param {number|string} division
 * @param {string} resource resource path such as `crm/Accounts` or `/crm/Accounts`
 * @param {{beta?: boolean}} [options]
 * @returns {string}
 */
export function divisionPath(division, resource, { beta = false } = {}) {
  if (!isValidResource(resource)) {
    throw new CliError('Resource must look like service/Resource', {
      exitCode: 64,
    })
  }
  const divisionCode = requireDivision(division)
  const strippedResource = resource.startsWith('/')
    ? resource.slice(1)
    : resource
  const betaSegment = beta ? 'beta/' : ''
  return `/api/v1/${betaSegment}${divisionCode}/${strippedResource}`
}

/**
 * @param {string} path
 * @param {number|string} division
 * @returns {string}
 */
export function substituteDivision(path, division) {
  if (!path.includes('{division}')) return path
  const divisionCode = requireDivision(division)
  return path.split('{division}').join(divisionCode)
}

/**
 * Unwrap an Exact Online OData envelope into the data it carries.
 * @param {object} [body]
 * @returns {object|Array}
 */
export function unwrap(body) {
  if (body == null) return { ok: true }
  if (Array.isArray(body.d?.results)) return body.d.results
  if (typeof body.d === 'object' && body.d !== null) return body.d
  return body
}

/**
 * @param {string} value
 * @returns {string}
 */
export function parseODataDate(value) {
  const match = typeof value === 'string' ? value.match(DATE_RE) : null
  if (!match) return value
  const date = new Date(Number(match[1]))
  const pad = (n) => String(n).padStart(2, '0')
  const year = date.getUTCFullYear()
  const month = pad(date.getUTCMonth() + 1)
  const day = pad(date.getUTCDate())
  const hours = pad(date.getUTCHours())
  const minutes = pad(date.getUTCMinutes())
  const seconds = pad(date.getUTCSeconds())
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`
}

/**
 * Deep copy that strips `__metadata` and `__deferred` and converts every
 * `/Date(ms)/` string to a plain ISO-like string. Never mutates its input.
 * @param {*} value
 * @returns {*}
 */
export function normalize(value) {
  if (Array.isArray(value)) return value.map((item) => normalize(item))
  if (value !== null && typeof value === 'object') {
    const result = {}
    for (const [key, entryValue] of Object.entries(value)) {
      if (key === '__metadata' || key === '__deferred') continue
      result[key] = normalize(entryValue)
    }
    return result
  }
  if (typeof value === 'string') return parseODataDate(value)
  return value
}

const COLUMN_VALUE_TYPES = new Set(['string', 'number', 'boolean'])

/**
 * Derive default table columns from the first row of a result set.
 * @param {object[]} rows
 * @returns {object}
 */
export function autoColumns(rows) {
  const firstRow = rows[0]
  if (!firstRow) return {}
  const columns = {}
  for (const [key, value] of Object.entries(firstRow)) {
    if (value === null || COLUMN_VALUE_TYPES.has(typeof value)) {
      columns[key] = { header: key }
    }
  }
  return columns
}
