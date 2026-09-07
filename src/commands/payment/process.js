import { Args, Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { resolvePath } from '../../lib/catalog.js'
import { CliError } from '../../lib/errors.js'
import { autoColumns, normalize, unwrap } from '../../lib/odata.js'
import { GUID_RE } from '../../lib/refs.js'
import {
  assertWritesAllowed,
  describeRequest,
  validateWrite,
  writeFlags,
} from '../../lib/writes.js'

const RESOURCE = 'cashflow/ProcessPayments'

export default class PaymentProcessCommand extends BaseCommand {
  static description =
    `Process approved payments (POST ${RESOURCE}). The answer carries ` +
    'SuccessMessage, ErrorMessage and the BankExportDocumentsUrl of the ' +
    'files to send to the bank'

  static examples = [
    '<%= config.bin %> payment process <payment-id> --dry-run',
    '<%= config.bin %> payment process <payment-id> <payment-id> --allow-writes',
  ]

  /** The command takes one GUID per argument, as many as needed. */
  static strict = false

  static args = {
    payment: Args.string({
      required: true,
      description: 'Payment GUID (repeat for more payments)',
    }),
  }

  static flags = {
    ...writeFlags,
    'dry-run': Flags.boolean({
      description: 'Show the validated request and send nothing',
      default: false,
    }),
  }

  async run() {
    const { argv } = await this.parse(PaymentProcessCommand)
    const dryRun = this.flags['dry-run']
    const { path } = resolvePath(this.resolveDivision(), RESOURCE)

    const bad = argv.find((id) => !GUID_RE.test(id))
    if (bad !== undefined) {
      throw new CliError(`A payment is a GUID, received: ${bad}`, {
        exitCode: 64,
      })
    }

    // PaymentIDs is a collection of the PaymentIDs sub entity, one { ID } each.
    const body = { PaymentIDs: argv.map((id) => ({ ID: id })) }
    validateWrite({ resource: RESOURCE, body, method: 'POST' })
    // A refused write costs no call at all. A dry run needs no permission.
    if (!dryRun) assertWritesAllowed(this.flags, 'POST')

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
