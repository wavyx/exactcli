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
import { keyType, resolvePath, warnUnknown } from '../lib/catalog.js'

const GUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * A plain Exact Online key: a number, a code, an enum value. The key travels
 * unquoted inside the parentheses, so anything outside this set could close
 * them and append its own OData. Refuse it before it reaches the wire.
 */
const PLAIN_KEY_RE = /^[A-Za-z0-9_.:-]+$/

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

    // Exact Online keys a GUID column as guid'...'; every other key type
    // (a number, an enum) goes into the parentheses as it is. The catalogue
    // says which one the resource wants; an unknown resource keeps the guess.
    const isGuid = GUID_RE.test(args.id)
    const wanted = resource ? keyType(resource) : undefined
    if (wanted === 'guid' && !isGuid) {
      throw new CliError(`Record key of ${args.resource} must be a GUID`, {
        exitCode: 64,
      })
    }
    if (wanted === 'plain' && isGuid) {
      throw new CliError(
        `Record key of ${args.resource} must be a plain key (letters, digits, _ . : -)`,
        { exitCode: 64 },
      )
    }
    if (!isGuid && !PLAIN_KEY_RE.test(args.id)) {
      throw new CliError(
        'Record key must be a GUID or a plain key (letters, digits, _ . : -)',
        { exitCode: 64 },
      )
    }
    const key = isGuid ? `(guid'${args.id}')` : `(${args.id})`
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
