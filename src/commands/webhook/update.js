import { Args, Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { resolvePath } from '../../lib/catalog.js'
import { CliError } from '../../lib/errors.js'
import { renderKey } from '../../lib/refs.js'
import {
  assertWritesAllowed,
  describeRequest,
  validateWrite,
  writeFlags,
} from '../../lib/writes.js'

const RESOURCE = 'webhooks/WebhookSubscriptions'

/** The text flags and the field each one fills. The topic is fixed. */
const TEXT_FIELDS = { url: 'CallbackURL', description: 'Description' }

export default class WebhookUpdateCommand extends BaseCommand {
  static description = `Update the callback URL or the description of a webhook subscription (PUT ${RESOURCE})`

  static examples = [
    '<%= config.bin %> webhook update <id> --url https://acme.example/hooks/exact-v2 --dry-run',
    '<%= config.bin %> webhook update <id> --description "Production hook" --allow-writes',
  ]

  static args = {
    id: Args.string({
      required: true,
      description: 'Subscription ID (a GUID)',
    }),
  }

  static flags = {
    ...writeFlags,
    url: Flags.string({ description: 'Callback URL (https only)' }),
    description: Flags.string({
      description: 'Description of the subscription',
    }),
    'dry-run': Flags.boolean({
      description: 'Show the validated request and send nothing',
      default: false,
    }),
  }

  async run() {
    const { args } = await this.parse(WebhookUpdateCommand)
    const { flags } = this
    const { path: basePath, resource } = resolvePath(
      this.resolveDivision(),
      RESOURCE,
    )
    const path = `${basePath}${renderKey(resource, RESOURCE, args.id)}`

    if (flags.url !== undefined && !flags.url.startsWith('https://')) {
      throw new CliError(
        `--url must start with https://, received: ${flags.url}`,
        { exitCode: 64 },
      )
    }
    const body = {}
    for (const [flag, field] of Object.entries(TEXT_FIELDS)) {
      if (flags[flag] !== undefined) body[field] = flags[flag]
    }
    const fields = Object.keys(body)
    if (fields.length === 0) {
      throw new CliError('Nothing to update: give at least one field flag', {
        exitCode: 64,
      })
    }
    validateWrite({ resource: RESOURCE, body, method: 'PUT' })

    if (flags['dry-run']) {
      await this.outputResults(
        describeRequest({ method: 'PUT', path, body }),
        {},
      )
      return
    }

    assertWritesAllowed(flags, 'PUT')
    await this.apiClient.put(path, body)
    await this.outputAction(
      { ok: true, path, key: args.id, fields },
      `Updated ${RESOURCE} ${args.id}: ${fields.join(', ')}`,
    )
  }
}
