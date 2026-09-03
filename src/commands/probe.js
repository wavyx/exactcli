import { Args, Flags } from '@oclif/core'
import BaseCommand from '../base-command.js'
import { ApiError, CliError } from '../lib/errors.js'
import { resolvePath, warnUnknown } from '../lib/catalog.js'
import { DATE_RE, parseODataDate, unwrap } from '../lib/odata.js'

const COLUMNS = {
  field: { header: 'Field' },
  type: { header: 'Type' },
  sample: { header: 'Sample' },
  catalogue: { header: 'Catalogue' },
}

const DEFAULT_TOP = 3
const MAX_TOP = 60
const SAMPLE_WIDTH = 40
const ENVELOPE_KEYS = new Set(['__metadata', '__deferred'])

/**
 * The kind of a value that is not null. A /Date(ms)/ string is a date.
 * @param {*} value
 * @returns {string}
 */
function kindOf(value) {
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'string' && DATE_RE.test(value)) return 'date'
  return typeof value
}

/**
 * A short rendering of a value that is not null.
 * @param {*} value
 * @returns {string}
 */
function sampleOf(value) {
  if (Array.isArray(value)) return `[${value.length}]`
  if (typeof value === 'object') return '{...}'
  const text = String(parseODataDate(value))
  return text.length > SAMPLE_WIDTH
    ? `${text.slice(0, SAMPLE_WIDTH - 3)}...`
    : text
}

/**
 * The field names the rows carry, in the order of first appearance.
 * @param {object[]} rows
 * @returns {string[]}
 */
function fieldsOf(rows) {
  const names = new Set()
  for (const row of rows) {
    for (const name of Object.keys(row)) {
      if (!ENVELOPE_KEYS.has(name)) names.add(name)
    }
  }
  return [...names]
}

/**
 * One row per field: undocumented fields first, then the documented ones in
 * catalogue order, then the catalogue properties the answer did not carry.
 * Without a catalogue record every field is "-", in the order of the answer.
 * @param {object[]} rows
 * @param {string[]} fields
 * @param {object | undefined} resource
 * @returns {{field: string, type: string, sample: string, catalogue: string}[]}
 */
function compare(rows, fields, resource) {
  const describe = (field) => {
    const value = rows.map((row) => row[field]).find((v) => v != null)
    if (value == null) return { field, type: 'null', sample: '' }
    return { field, type: kindOf(value), sample: sampleOf(value) }
  }
  if (!resource) {
    return fields.map((field) => ({ ...describe(field), catalogue: '-' }))
  }
  const documented = new Set(resource.properties.map((p) => p.name))
  const returned = new Set(fields)
  return [
    ...fields
      .filter((field) => !documented.has(field))
      .map((field) => ({ ...describe(field), catalogue: 'undocumented' })),
    ...resource.properties
      .filter((p) => returned.has(p.name))
      .map((p) => ({ ...describe(p.name), catalogue: 'documented' })),
    ...resource.properties
      .filter((p) => !returned.has(p.name))
      .map((p) => ({
        field: p.name,
        type: p.type,
        sample: '',
        catalogue: 'not returned',
      })),
  ]
}

export default class ProbeCommand extends BaseCommand {
  static description =
    'Compare the fields a resource really returns with the catalogue'

  static examples = [
    '<%= config.bin %> probe crm/Accounts',
    '<%= config.bin %> probe financialtransaction/Transactions --top 5',
    '<%= config.bin %> probe crm/Accounts --filter "Status eq \'C\'" --output json',
  ]

  static args = {
    resource: Args.string({
      required: true,
      description: 'Resource path, for example crm/Accounts',
    }),
  }

  static flags = {
    top: Flags.integer({
      description: `Records to fetch, 1 to ${MAX_TOP}`,
      default: DEFAULT_TOP,
    }),
    filter: Flags.string({ description: 'OData $filter expression' }),
    beta: Flags.boolean({ description: 'Use the beta API namespace' }),
  }

  async run() {
    const { args } = await this.parse(ProbeCommand)
    const { beta, filter, top } = this.flags
    const { path, resource } = resolvePath(
      this.resolveDivision(),
      args.resource,
      { beta },
    )
    warnUnknown(args.resource, resource)

    // No $select: the point is to see every field the server returns.
    const query = { $top: Math.min(Math.max(top, 1), MAX_TOP) }
    if (filter) query.$filter = filter
    const data = unwrap(await this.fetchRows(path, query))
    const rows = Array.isArray(data) ? data : [data]
    if (rows.length === 0) {
      throw new CliError(`No record returned by ${args.resource}`, {
        exitCode: 65,
      })
    }

    const fields = fieldsOf(rows)
    const report = compare(rows, fields, resource)
    const count = (status) =>
      report.filter((r) => r.catalogue === status).length
    process.stderr.write(
      `${rows.length} rows, ${fields.length} fields returned, ` +
        `${count('undocumented')} undocumented, ` +
        `${count('not returned')} not returned\n`,
    )
    await this.outputResults(report, COLUMNS)
  }

  /**
   * Some resources (the sync feeds, the reporting balance, undocumented
   * ones) refuse a bare GET unless $top is exactly 1 or a $select is given
   * (verified live). A probe wants every field, so it falls back to one row.
   * @param {string} path
   * @param {{ $top: number, $filter?: string }} query
   */
  async fetchRows(path, query) {
    try {
      return await this.apiClient.get(path, { query })
    } catch (err) {
      const demandsTop1 =
        err instanceof ApiError &&
        err.statusCode === 400 &&
        /\$top=1/.test(err.message) &&
        query.$top !== 1
      if (!demandsTop1) throw err
      process.stderr.write('Exact demands $top=1 without $select: one row.\n')
      return this.apiClient.get(path, { query: { ...query, $top: 1 } })
    }
  }
}
