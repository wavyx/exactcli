import { Args } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { bodyFlags } from '../../commands/create.js'
import { CliError } from '../errors.js'
import { autoColumns, divisionPath, normalize, unwrap } from '../odata.js'
import {
  applyRefs,
  assertWritesAllowed,
  describeRequest,
  parseSet,
  readBody,
  validateWrite,
  writeFlags,
} from '../writes.js'
import { headerKeys, headerRefs } from './line-list.js'

/**
 * The record spec of the lines of a header descriptor, for the GUID-keyed
 * update and delete commands of record-write.js.
 * @param {import('./line-descriptors.js').LineDescriptor} d
 * @returns {import('./record-write.js').RecordSpec}
 */
export const lineSpec = (d) => ({
  topic: d.topic,
  resource: d.resource,
  singular: `a line of ${d.singular}`,
  plural: `lines of ${d.plural}`,
})

/**
 * Build the command that adds a line to an existing header (an entry), named
 * by its GUID or its number. The link field comes from the argument only.
 * @param {import('./line-descriptors.js').LineDescriptor} d
 * @returns {typeof BaseCommand}
 */
export function defineLineAddCommand(d) {
  return class LineAddCommand extends BaseCommand {
    static descriptor = d
    static description = `Add a line to ${d.singular}, by ${d.ref} (POST ${d.resource})`
    static examples = [
      `<%= config.bin %> ${d.topic} line-add <number> --set GLAccount=@ref:financial/GLAccounts:700000 --set AmountFC=100 --dry-run`,
      `<%= config.bin %> ${d.topic} line-add <guid> --body @line.json --allow-writes`,
    ]

    static args = {
      ref: Args.string({
        required: true,
        description: `${d.parentKey} GUID or ${d.number}`,
      }),
    }

    static flags = {
      ...writeFlags,
      body: bodyFlags.body,
      set: bodyFlags.set,
      'dry-run': bodyFlags['dry-run'],
    }

    async run() {
      const { args } = await this.parse(LineAddCommand)
      const refs = headerRefs([args.ref])
      const dryRun = this.flags['dry-run']
      const fields = {
        ...(await readBody(this.flags)),
        ...parseSet(this.flags.set),
      }
      // A second link in the body would move the line to another header.
      if (d.link in fields) {
        throw new CliError(
          `${d.link} comes from the argument: remove it from the body`,
          { exitCode: 64 },
        )
      }
      // The check runs with a placeholder link: the lookup comes later.
      validateWrite({
        resource: d.resource,
        body: { ...fields, [d.link]: null },
        method: 'POST',
      })
      // A refused write costs no call at all. A dry run needs no permission.
      if (!dryRun) assertWritesAllowed(this.flags, 'POST')

      const division = this.resolveDivision()
      const [key] = await headerKeys(this, d, division, refs, { unique: true })
      const body = { ...(await applyRefs(this, fields)), [d.link]: key }
      const path = divisionPath(division, d.resource)
      if (dryRun) {
        await this.outputResults(
          describeRequest({ method: 'POST', path, body }),
          {},
        )
        return
      }
      const record = normalize(unwrap(await this.apiClient.post(path, body)))
      await this.outputResults(record, autoColumns([record]))
    }
  }
}
