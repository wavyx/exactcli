import { Args, Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { resolvePath } from '../../lib/catalog.js'
import { renderKey } from '../../lib/refs.js'
import {
  assertWritesAllowed,
  describeRequest,
  validateWrite,
  writeFlags,
} from '../../lib/writes.js'

const RESOURCE = 'webhooks/WebhookSubscriptions'

export default class WebhookDeleteCommand extends BaseCommand {
  static description = `Delete a webhook subscription (DELETE ${RESOURCE}). Needs --allow-writes and --yes`

  static examples = [
    '<%= config.bin %> webhook delete <id> --dry-run',
    '<%= config.bin %> webhook delete <id> --allow-writes --yes',
  ]

  static args = {
    id: Args.string({
      required: true,
      description: 'Subscription ID (a GUID)',
    }),
  }

  static flags = {
    ...writeFlags,
    'dry-run': Flags.boolean({
      description: 'Show the request and send nothing',
      default: false,
    }),
  }

  async run() {
    const { args } = await this.parse(WebhookDeleteCommand)
    const { path: basePath, resource } = resolvePath(
      this.resolveDivision(),
      RESOURCE,
    )
    const path = `${basePath}${renderKey(resource, RESOURCE, args.id)}`
    validateWrite({ resource: RESOURCE, body: {}, method: 'DELETE' })

    if (this.flags['dry-run']) {
      await this.outputResults(describeRequest({ method: 'DELETE', path }), {})
      return
    }

    assertWritesAllowed(this.flags, 'DELETE')
    await this.apiClient.del(path)
    await this.outputAction(
      { ok: true, path, key: args.id },
      `Deleted webhook ${args.id}`,
    )
  }
}
