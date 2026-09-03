import { Args, Flags } from '@oclif/core'
import BaseCommand from '../base-command.js'
import { resolvePath } from '../lib/catalog.js'
import { renderKey } from '../lib/refs.js'
import {
  assertWritesAllowed,
  describeRequest,
  validateWrite,
  writeFlags,
} from '../lib/writes.js'

export default class DeleteCommand extends BaseCommand {
  static description =
    'Delete a record (DELETE). Needs --allow-writes and --yes'

  static examples = [
    '<%= config.bin %> delete crm/Accounts <id> --dry-run',
    '<%= config.bin %> delete crm/Accounts <id> --allow-writes --yes',
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
    ...writeFlags,
    'dry-run': Flags.boolean({
      description: 'Show the request and send nothing',
      default: false,
    }),
    force: Flags.boolean({
      description: 'Send even when the resource is not in the catalogue',
      default: false,
    }),
    beta: Flags.boolean({ description: 'Use the beta API namespace' }),
  }

  async run() {
    const { args } = await this.parse(DeleteCommand)
    const { force, beta } = this.flags
    const { path: basePath, resource } = resolvePath(
      this.resolveDivision(),
      args.resource,
      { beta },
    )
    const key = renderKey(resource, args.resource, args.id)
    const path = `${basePath}${key}`

    validateWrite({
      resource: args.resource,
      body: {},
      method: 'DELETE',
      force,
    })

    if (this.flags['dry-run']) {
      await this.outputResults(describeRequest({ method: 'DELETE', path }), {})
      return
    }

    assertWritesAllowed(this.flags, 'DELETE')
    await this.apiClient.del(path)
    await this.outputAction(
      { ok: true, path, key: args.id },
      `Deleted ${args.resource} ${args.id}`,
    )
  }
}
