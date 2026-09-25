import { Args } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { CliError } from '../errors.js'
import { buildQuery, divisionPath } from '../odata.js'
import { collectListing, listingFlags, visibleColumns } from '../listing.js'
import { collectPages } from '../pagination.js'
import { GUID_RE } from '../refs.js'

/** A header number is an Int32: ten digits at most. */
const NUMBER_RE = /^\d{1,10}$/

/**
 * The header GUIDs of the references. A GUID passes through; the numbers are
 * looked up on the header resource in one request. A number that matches
 * nothing fails with 65.
 * @param {{ apiClient: object }} cmd
 * @param {import('./line-descriptors.js').LineDescriptor} d
 * @param {number} division
 * @param {string[]} refs validated GUIDs and digit strings
 * @returns {Promise<string[]>}
 */
async function headerKeys(cmd, d, division, refs) {
  const guids = refs.filter((ref) => GUID_RE.test(ref))
  const numbers = refs.filter((ref) => !GUID_RE.test(ref))
  if (numbers.length === 0) return guids

  const rows = await collectPages(
    cmd.apiClient.pageOData(divisionPath(division, d.parent), {
      $select: `${d.parentKey},${d.number}`,
      $filter: numbers.map((n) => `${d.number} eq ${n}`).join(' or '),
    }),
  )
  const found = new Set(rows.map((row) => String(row[d.number])))
  const missing = numbers.filter((n) => !found.has(n))
  if (missing.length > 0) {
    throw new CliError(
      `No ${d.parent} with ${d.number} ${missing.join(', ')}`,
      { exitCode: 65 },
    )
  }
  return [...guids, ...rows.map((row) => row[d.parentKey])]
}

/**
 * Build the oclif command class that lists the lines of one or more headers
 * (invoices, entries, orders), each named by its GUID or its number.
 * @param {import('./line-descriptors.js').LineDescriptor} d
 * @returns {typeof BaseCommand}
 */
export function defineLinesCommand(d) {
  const columns = Object.fromEntries(d.columns.map((c) => [c, { header: c }]))

  return class LinesCommand extends BaseCommand {
    static descriptor = d
    static description = d.description
    static examples = [
      `<%= config.bin %> ${d.topic} lines <guid>`,
      `<%= config.bin %> ${d.topic} lines <number> <number> --output json`,
    ]

    /** One reference per argument, as many as needed. */
    static strict = false

    static args = {
      ref: Args.string({
        required: true,
        description: `${d.parentKey} GUID or ${d.number} (repeat for more)`,
      }),
    }

    static flags = { ...listingFlags }

    async run() {
      const { argv } = await this.parse(LinesCommand)
      // A reference lands in $filter, so anything but a GUID or digits could
      // close the literal and append its own clause.
      const bad = argv.find((ref) => !GUID_RE.test(ref) && !NUMBER_RE.test(ref))
      if (bad !== undefined) {
        throw new CliError(`Expected a GUID or a number, received ${bad}`, {
          exitCode: 64,
        })
      }
      const division = this.resolveDivision()
      const refs = [
        ...new Set(
          argv.map((ref) => (GUID_RE.test(ref) ? ref : String(Number(ref)))),
        ),
      ]
      const keys = [...new Set(await headerKeys(this, d, division, refs))]

      const byHeader = keys.map((k) => `${d.link} eq guid'${k}'`).join(' or ')
      const base = buildQuery(this.flags)
      const query = {
        $select: d.columns.join(','),
        $orderby: `${d.link},LineNumber`,
        ...base,
        $filter: base.$filter
          ? `(${base.$filter}) and (${byHeader})`
          : byHeader,
      }
      const data = await collectListing(
        this,
        divisionPath(division, d.resource),
        query,
      )
      await this.outputResults(
        data,
        visibleColumns(columns, data, this.flags.select),
      )
    }
  }
}
