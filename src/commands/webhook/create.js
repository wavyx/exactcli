import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { resolvePath } from '../../lib/catalog.js'
import { CliError } from '../../lib/errors.js'
import { autoColumns, normalize, unwrap } from '../../lib/odata.js'
import {
  assertWritesAllowed,
  describeRequest,
  validateWrite,
  writeFlags,
} from '../../lib/writes.js'

const RESOURCE = 'webhooks/WebhookSubscriptions'

export default class WebhookCreateCommand extends BaseCommand {
  static description = `Subscribe to a webhook topic (POST ${RESOURCE})`

  static examples = [
    '<%= config.bin %> webhook create --topic Accounts --url https://acme.example/hooks/exact --dry-run',
    '<%= config.bin %> webhook create --topic SalesInvoices --url https://acme.example/hooks/exact --allow-writes',
  ]

  static flags = {
    ...writeFlags,
    topic: Flags.string({
      required: true,
      description: 'Topic, for example Accounts or SalesInvoices',
    }),
    url: Flags.string({
      required: true,
      description: 'Callback URL (https only)',
    }),
    description: Flags.string({
      description: 'Description of the subscription',
    }),
    'dry-run': Flags.boolean({
      description: 'Show the validated request and send nothing',
      default: false,
    }),
  }

  async run() {
    const { topic, url, description } = this.flags
    const { path } = resolvePath(this.resolveDivision(), RESOURCE)

    if (!url.startsWith('https://')) {
      throw new CliError(`--url must start with https://, received: ${url}`, {
        exitCode: 64,
      })
    }
    const body = { Topic: topic, CallbackURL: url }
    if (description) body.Description = description
    validateWrite({ resource: RESOURCE, body, method: 'POST' })

    if (this.flags['dry-run']) {
      await this.outputResults(
        describeRequest({ method: 'POST', path, body }),
        {},
      )
      return
    }

    assertWritesAllowed(this.flags, 'POST')
    const record = normalize(unwrap(await this.apiClient.post(path, body)))
    await this.outputResults(record, autoColumns([record]))
  }
}
