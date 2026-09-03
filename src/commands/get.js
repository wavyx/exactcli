import { Args, Flags } from '@oclif/core'
import BaseCommand from '../base-command.js'
import { CliError } from '../lib/errors.js'
import {
  autoColumns,
  buildQuery,
  normalize,
  odataFlags,
  unwrap,
} from '../lib/odata.js'
import { resolvePath, warnUnknown } from '../lib/catalog.js'
import { renderKey } from '../lib/refs.js'

export default class GetCommand extends BaseCommand {
  static description = 'Read one record of any Exact Online resource'

  static examples = [
    '<%= config.bin %> get crm/Accounts 8f4b0e2a-1c3d-4e5f-9a7b-2c1d3e4f5a6b',
    '<%= config.bin %> get system/Divisions 123456',
    '<%= config.bin %> get crm/Accounts <id> --select Code,Name --output json',
  ]

  static args = {
    resource: Args.string({
      required: true,
      description: 'Resource path, for example crm/Accounts',
    }),
    id: Args.string({
      required: true,
      description: 'Record key: a GUID, or a plain key such as 123456',
    }),
  }

  static flags = {
    select: odataFlags.select,
    expand: odataFlags.expand,
    beta: Flags.boolean({ description: 'Use the beta API namespace' }),
    raw: Flags.boolean({ description: 'Print the raw API envelope' }),
  }

  async run() {
    const { args } = await this.parse(GetCommand)
    const { beta, expand, raw, select } = this.flags

    const { path: basePath, resource } = resolvePath(
      this.resolveDivision(),
      args.resource,
      { beta },
    )
    warnUnknown(args.resource, resource)

    const key = renderKey(resource, args.resource, args.id)
    const path = `${basePath}${key}`

    const body = await this.apiClient.get(path, {
      query: buildQuery({ select, expand }),
    })

    if (raw) {
      await this.outputResults(body, {})
      return
    }

    const data = unwrap(body)
    const found = Array.isArray(data) ? data[0] : data
    // An empty results envelope is a miss, not a record. Report it as a data
    // error instead of printing an empty table.
    if (found == null) {
      throw new CliError(`No record found for ${args.resource} ${args.id}`, {
        exitCode: 65,
      })
    }
    const record = normalize(found)
    await this.outputResults(record, autoColumns([record]))
  }
}
