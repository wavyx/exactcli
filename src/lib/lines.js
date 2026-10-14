import { CliError } from './errors.js'
import { resolveRef } from './refs.js'

/** A plain decimal: a quantity, a price. */
export const NUMBER_RE = /^-?\d+(\.\d+)?$/
/** A signed decimal: an amount carries an explicit plus or minus. */
export const AMOUNT_RE = /^[+-]?\d+(\.\d+)?$/
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** The pattern of each typed line field. A text field only needs a value. */
const PATTERNS = { number: NUMBER_RE, amount: AMOUNT_RE }
/** What an option value must look like, for the message. */
const EXPECTS = {
  number: 'a number',
  fraction: 'a fraction from 0 to 1',
  amount: 'an amount',
  date: 'YYYY-MM-DD',
  text: 'a value',
}
/** A `key=value` part of a line. */
const OPTION_RE = /^([a-z][a-z-]*)=(.*)$/s
/** A part that looks like an option in any case, for the misplaced check. */
const OPTION_LIKE_RE = /^([a-z][a-z-]*)=/i

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
 * A line period needs both bounds, in order: Exact spreads an entry line from
 * `From` to `To`, and uses them as a pair on an invoice line.
 * @param {object} line a parsed line
 * @param {string} text the flag value, for the message
 */
export function assertPeriod(line, text) {
  const reason =
    'From' in line !== 'To' in line
      ? 'needs from and to together'
      : line.From > line.To
        ? 'has from after to'
        : undefined
  if (reason) {
    throw new CliError(`--line ${reason}, received: ${text}`, {
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
 * @property {Record<string, { field: string, type: 'text' | 'number' | 'amount' | 'date' | 'fraction' }>} [options]
 *   named `key=value` parts between the fields and the description
 */

/**
 * The value of one named option, typed per its spec. A fraction is a share
 * from 0 to 1: Exact stores 0.5 for 50%.
 * @param {string} value
 * @param {'text' | 'number' | 'amount' | 'date' | 'fraction'} type
 * @returns {string | number | undefined} undefined for a bad value
 */
function optionValue(value, type) {
  if (type === 'date') return DATE_RE.test(value) ? value : undefined
  if (type === 'text') return value || undefined
  if (type === 'fraction') {
    const share = NUMBER_RE.test(value) ? Number(value) : NaN
    return share >= 0 && share <= 1 ? share : undefined
  }
  return PATTERNS[type].test(value) ? Number(value) : undefined
}

/**
 * One repeatable line flag as the API wants it. The first colons split the
 * fields. With `options` in the spec, the next `key=value` parts set named
 * fields; an unknown key fails, because a mistyped option on a financial
 * write must not land in the description. The rest is the description and
 * keeps any colon in it. A number or an amount becomes a `Number`; a missing
 * description sets no field.
 * @param {string} text
 * @param {LineSpec} spec
 * @returns {object}
 */
export function parseLine(
  text,
  { shape, fields, flag = 'line', description = 'Description', options },
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
  let next = names.length
  const seen = new Set()
  const refuse = (reason) => {
    throw new CliError(`--${flag} ${reason}, received: ${text}`, {
      exitCode: 64,
    })
  }
  for (; options && next < parts.length; next++) {
    const match = OPTION_RE.exec(parts[next])
    if (!match) break
    const [, key, raw] = match
    const option = options[key]
    if (!option) {
      refuse(
        `has an unknown option ${key} (allowed: ${Object.keys(options).join(', ')})`,
      )
    }
    if (seen.has(key)) refuse(`option ${key} is given twice`)
    seen.add(key)
    const value = optionValue(raw, option.type)
    if (value === undefined) {
      refuse(`option ${key} expects ${EXPECTS[option.type]}`)
    }
    line[option.field] = value
  }
  // A known option after the description, or in upper case, would land in
  // the text while the user meant a field: Exact would book its default.
  for (const part of options ? parts.slice(next) : []) {
    const key = OPTION_LIKE_RE.exec(part)?.[1].toLowerCase()
    if (key && options[key]) {
      refuse(`option ${key} must come before the description, in lower case`)
    }
  }
  const rest = parts.slice(next).join(':')
  if (rest) line[description] = rest
  return line
}

/**
 * The lines with `field` as a GUID. Lookups run one after the other. A line
 * without the field, an optional one, stays as it is.
 * @param {{ apiClient: object, resolveDivision: () => number }} cmd
 * @param {object[]} lines
 * @param {string} field the line field that holds a code or a GUID
 * @param {string} resource `service/Resource` that carries the Code
 * @returns {Promise<object[]>}
 */
export async function resolveLines(cmd, lines, field, resource) {
  const out = []
  for (const line of lines) {
    out.push(
      line[field] === undefined
        ? { ...line }
        : { ...line, [field]: await resolveRef(cmd, resource, line[field]) },
    )
  }
  return out
}
