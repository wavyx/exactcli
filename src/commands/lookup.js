import { Args, Flags } from '@oclif/core'
import BaseCommand from '../base-command.js'
import { findResource } from '../lib/catalog.js'
import { CliError } from '../lib/errors.js'
import { findMatches, parseMatch } from '../lib/lookup.js'
import { autoColumns } from '../lib/odata.js'

/** The flags shared by lookup and upsert. */
export const matchFlags = {
  match: Flags.string({
    multiple: true,
    required: true,
    description:
      'Field=value that identifies the record (repeatable, all must match). ' +
      'A numeric Code also matches the padded form Exact stores',
  }),
}

/**
 * The catalogue record of a resource that lookup and upsert can use.
 * @param {string} ref
 * @returns {object}
 */
export function knownResource(ref) {
  const res = findResource(ref)
  if (!res) {
    throw new CliError(`${ref} is not in the catalogue`, { exitCode: 64 })
  }
  return res
}

/** @param {{ field: string, value: string }[]} matches */
export const describeMatch = (matches) =>
  matches.map((m) => `${m.field}=${m.value}`).join(' and ')

export default class LookupCommand extends BaseCommand {
  static description =
    'Find records by exact field values and print their keys: the step ' +
    'before an update'

  static examples = [
    '<%= config.bin %> lookup crm/Accounts --match Code=1001',
    "<%= config.bin %> lookup crm/Contacts --match Email=jane@acme.example --one --jq '.ID'",
  ]

  static args = {
    resource: Args.string({
      required: true,
      description: 'Resource path, for example crm/Accounts',
    }),
  }

  static flags = {
    ...matchFlags,
    one: Flags.boolean({
      default: false,
      description:
        'Expect exactly one match: print it as one record, exit 65 on none ' +
        'or several',
    }),
  }

  async run() {
    const { args } = await this.parse(LookupCommand)
    const res = knownResource(args.resource)
    const matches = parseMatch(this.flags.match)
    // Two rows are enough to tell one match from several.
    const rows = await findMatches(this, res, matches, {
      top: this.flags.one ? 2 : undefined,
    })
    if (!this.flags.one) {
      await this.outputResults(rows, autoColumns(rows))
      return
    }
    if (rows.length !== 1) {
      const what = describeMatch(matches)
      throw new CliError(
        rows.length === 0
          ? `No ${args.resource} matches ${what}`
          : `Several ${args.resource} match ${what}: ${rows.map((r) => r[res.keys[0]]).join(', ')}`,
        { exitCode: 65 },
      )
    }
    await this.outputResults(rows[0], autoColumns(rows))
  }
}
