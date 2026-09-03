import { Args, Flags } from '@oclif/core'
import BaseCommand from '../base-command.js'
import { resolvePath } from '../lib/catalog.js'
import { autoColumns, normalize, unwrap } from '../lib/odata.js'
import {
  applyRefs,
  assertWritesAllowed,
  describeRequest,
  parseSet,
  readBody,
  validateWrite,
  writeFlags,
} from '../lib/writes.js'

/** Flags shared by create and update. */
export const bodyFlags = {
  body: Flags.string({
    description: 'Request body (JSON string, @file, or piped stdin)',
  }),
  set: Flags.string({
    multiple: true,
    description:
      'Field as Key=value (repeatable). Values: text, number, true, false, ' +
      'null, @str:text, @guid:id, @ref:service/Resource:code',
  }),
  'dry-run': Flags.boolean({
    description: 'Show the validated request and send nothing',
    default: false,
  }),
  force: Flags.boolean({
    description:
      'Send even when the resource or a field is not in the catalogue',
    default: false,
  }),
  beta: Flags.boolean({ description: 'Use the beta API namespace' }),
}

export default class CreateCommand extends BaseCommand {
  static description = 'Create a record (POST), validated against the catalogue'

  static examples = [
    '<%= config.bin %> create crm/Accounts --set Name=Acme --set Code=1001 --dry-run',
    '<%= config.bin %> create crm/Accounts --set Name=Acme --allow-writes',
    '<%= config.bin %> create salesentry/SalesEntries --body @entry.json --set Customer=@ref:crm/Accounts:1001 --allow-writes',
  ]

  static args = {
    resource: Args.string({
      required: true,
      description: 'Resource path, for example crm/Accounts',
    }),
  }

  static flags = { ...writeFlags, ...bodyFlags }

  async run() {
    const { args } = await this.parse(CreateCommand)
    const { force, beta } = this.flags
    const dryRun = this.flags['dry-run']
    const { path } = resolvePath(this.resolveDivision(), args.resource, {
      beta,
    })

    const body = {
      ...(await readBody(this.flags)),
      ...parseSet(this.flags.set),
    }
    validateWrite({ resource: args.resource, body, method: 'POST', force })
    // The gate comes before the reference lookups: a refused write costs no
    // call at all. A dry run needs no permission.
    if (!dryRun) assertWritesAllowed(this.flags, 'POST')
    const resolved = await applyRefs(this, body)

    if (dryRun) {
      await this.outputResults(
        describeRequest({ method: 'POST', path, body: resolved }),
        {},
      )
      return
    }

    const response = await this.apiClient.post(path, resolved)
    const data = unwrap(response)
    const record = normalize(Array.isArray(data) ? data[0] : data)
    await this.outputResults(record, autoColumns([record]))
  }
}
