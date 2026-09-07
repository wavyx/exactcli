import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { CliError } from '../errors.js'
import { DATE_RE } from '../lines.js'
import { buildQuery, divisionPath } from '../odata.js'
import { collectListing, listingFlags, visibleColumns } from '../listing.js'
import { padCode, quote, resolveRef } from '../refs.js'
import { findResource, propertyNames } from '../catalog.js'
import { columnsOf } from './descriptors.js'

const TRUE = new Set(['true', 'yes', '1'])
const FALSE = new Set(['false', 'no', '0'])

/**
 * Render a flag value as an OData v3 literal.
 * @param {string} type
 * @param {string} value
 * @returns {string}
 */
export function renderValue(type, value) {
  if (type === 'int') {
    if (!/^-?\d+$/.test(value)) {
      throw new CliError(`Expected an integer, received ${value}`, {
        exitCode: 64,
      })
    }
    return value
  }
  if (type === 'bool') {
    const v = String(value).toLowerCase()
    if (TRUE.has(v)) return 'true'
    if (FALSE.has(v)) return 'false'
    throw new CliError(`Expected true or false, received ${value}`, {
      exitCode: 64,
    })
  }
  if (type === 'date') {
    if (!DATE_RE.test(value)) {
      throw new CliError(`Expected YYYY-MM-DD, received ${value}`, {
        exitCode: 64,
      })
    }
    return `datetime'${value}'`
  }
  if (type === 'guid') return `guid'${value}'`
  return quote(value)
}

/**
 * One `$filter` clause for a typed filter and its flag value.
 * @param {import('./descriptors.js').TypedFilter} filter
 * @param {string} value
 * @param {{hasCode?: boolean}} [options] the resource has a Code field
 * @returns {string}
 */
export function renderClause(filter, value, { hasCode = true } = {}) {
  if (filter.type === 'search') {
    // Digits mean a code when the resource has one. Exact stores account
    // codes padded to 18 and ledger codes as they are (verified live), so
    // ask for both forms. A resource without Code searches the text field.
    return hasCode && /^\d+$/.test(value)
      ? `(Code eq ${quote(value)} or Code eq ${quote(padCode(value))})`
      : `substringof(${quote(value)}, ${filter.field})`
  }
  return `${filter.field} ${filter.op ?? 'eq'} ${renderValue(filter.type, value)}`
}

/**
 * The `$filter` that the given typed flags build, or undefined when none.
 * @param {{flags: object}} cmd
 * @param {import('./descriptors.js').Descriptor} descriptor
 * @returns {Promise<string | undefined>}
 */
export async function buildTypedFilter(cmd, descriptor) {
  const clauses = []
  const resource = findResource(descriptor.resource)
  const hasCode = !resource || propertyNames(resource).includes('Code')
  for (const [name, filter] of Object.entries(descriptor.filters)) {
    const raw = cmd.flags[name]
    if (raw === undefined) continue
    const value = filter.resolve
      ? await resolveRef(cmd, filter.resolve, raw)
      : raw
    clauses.push(renderClause(filter, value, { hasCode }))
  }
  return clauses.length ? clauses.join(' and ') : undefined
}

/**
 * Build the oclif command class of a typed list descriptor.
 * @param {import('./descriptors.js').Descriptor} descriptor
 * @returns {typeof BaseCommand}
 */
export function defineListCommand(descriptor) {
  const filterFlags = Object.fromEntries(
    Object.entries(descriptor.filters).map(([name, f]) => [
      name,
      Flags.string({
        description:
          f.description ?? `Filter: ${f.field} ${f.op ?? 'eq'} <${f.type}>`,
      }),
    ]),
  )
  const columns = columnsOf(descriptor)

  return class TypedListCommand extends BaseCommand {
    static descriptor = descriptor
    static description = descriptor.description
    static examples = descriptor.examples ?? [
      `<%= config.bin %> ${descriptor.topic} list`,
      `<%= config.bin %> ${descriptor.topic} list --limit 200 --output json`,
    ]
    static flags = { ...listingFlags, ...filterFlags }

    async run() {
      const path = divisionPath(this.resolveDivision(), descriptor.resource)
      const base = buildQuery(this.flags)
      const typed = await buildTypedFilter(this, descriptor)
      const query = {
        $select: descriptor.columns.join(','),
        $orderby: descriptor.orderBy,
        ...base,
      }
      if (typed) {
        query.$filter = base.$filter ? `(${base.$filter}) and ${typed}` : typed
      }
      const data = await collectListing(this, path, query)
      await this.outputResults(
        data,
        visibleColumns(columns, data, this.flags.select),
      )
    }
  }
}
