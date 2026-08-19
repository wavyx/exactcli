import { Args, Flags } from '@oclif/core'
import BaseCommand from '../base-command.js'
import {
  autoColumns,
  buildQuery,
  divisionPath,
  normalize,
  odataFlags,
  unwrap,
} from '../lib/odata.js'

const GUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default class GetCommand extends BaseCommand {
  static description = 'Read one record of any Exact Online resource'

  static examples = [
    '<%= config.bin %> get crm/Accounts 8f4b0e2a-1c3d-4e5f-9a7b-2c1d3e4f5a6b',
    '<%= config.bin %> get financial/GLAccounts 700',
    '<%= config.bin %> get crm/Accounts <id> --select Code,Name --output json',
  ]

  static args = {
    resource: Args.string({
      required: true,
      description: 'Resource path, for example crm/Accounts',
    }),
    id: Args.string({
      required: true,
      description: 'Record key: a GUID, or a plain key such as 700',
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

    // Exact Online keys a GUID column as guid'...'; every other key type
    // (a number, an enum) goes into the parentheses as it is.
    const key = GUID_RE.test(args.id) ? `(guid'${args.id}')` : `(${args.id})`
    const path = divisionPath(
      this.resolveDivision(),
      `${args.resource}${key}`,
      { beta },
    )

    const body = await this.apiClient.get(path, {
      query: buildQuery({ select, expand }),
    })

    if (raw) {
      await this.outputResults(body, {})
      return
    }

    const data = unwrap(body)
    const record = normalize(Array.isArray(data) ? data[0] : data)
    await this.outputResults(record, autoColumns([record]))
  }
}
