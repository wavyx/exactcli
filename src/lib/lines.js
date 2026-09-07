import { CliError } from './errors.js'
import { resolveRef } from './refs.js'

/** A plain decimal: a quantity, a price. */
export const NUMBER_RE = /^-?\d+(\.\d+)?$/
/** A signed decimal: an amount carries an explicit plus or minus. */
export const AMOUNT_RE = /^[+-]?\d+(\.\d+)?$/
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** The pattern of each typed line field. A text field only needs a value. */
const PATTERNS = { number: NUMBER_RE, amount: AMOUNT_RE }

/**
 * Refuse a date that is not YYYY-MM-DD.
 * @param {string} value
 * @param {string} flag the flag, for the message
 */
export function assertDate(value, flag) {
  if (!DATE_RE.test(value)) {
    throw new CliError(`--${flag} expects YYYY-MM-DD, received: ${value}`, {
      exitCode: 64,
    })
  }
}

/**
 * @param {string} text
 * @param {string} flag the flag, for the message
 * @returns {number}
 */
export function parseNumber(text, flag) {
  if (!NUMBER_RE.test(text)) {
    throw new CliError(`--${flag} expects a number, received: ${text}`, {
      exitCode: 64,
    })
  }
  return Number(text)
}

/**
 * @typedef {object} LineSpec
 * @property {string} shape the expected shape, for the message and the help
 * @property {Record<string, 'text' | 'number' | 'amount'>} fields the body field of each part, in order
 * @property {string} [flag] the flag, for the message; `line` by default
 * @property {string} [description] the body field of the rest; `Description` by default
 */

/**
 * One repeatable line flag as the API wants it. The first colons split the
 * fields; the rest is the description and keeps any colon in it. A number
 * or an amount becomes a `Number`; a missing description sets no field.
 * @param {string} text
 * @param {LineSpec} spec
 * @returns {object}
 */
export function parseLine(
  text,
  { shape, fields, flag = 'line', description = 'Description' },
) {
  const names = Object.keys(fields)
  const parts = text.split(':')
  const bad = names.some((name, i) => {
    const value = parts[i] ?? ''
    const pattern = PATTERNS[fields[name]]
    return pattern ? !pattern.test(value) : !value
  })
  if (bad) {
    throw new CliError(`--${flag} expects ${shape}, received: ${text}`, {
      exitCode: 64,
    })
  }
  const line = {}
  names.forEach((name, i) => {
    line[name] = fields[name] === 'text' ? parts[i] : Number(parts[i])
  })
  const rest = parts.slice(names.length).join(':')
  if (rest) line[description] = rest
  return line
}

/**
 * The lines with `field` as a GUID. Lookups run one after the other.
 * @param {{ apiClient: object, resolveDivision: () => number }} cmd
 * @param {object[]} lines
 * @param {string} field the line field that holds a code or a GUID
 * @param {string} resource `service/Resource` that carries the Code
 * @returns {Promise<object[]>}
 */
export async function resolveLines(cmd, lines, field, resource) {
  const out = []
  for (const line of lines) {
    out.push({ ...line, [field]: await resolveRef(cmd, resource, line[field]) })
  }
  return out
}
