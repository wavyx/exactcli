import { Args, Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { writeFlags } from '../../lib/writes.js'
import { setPaymentMethod } from './approve.js'

export default class PaymentHoldCommand extends BaseCommand {
  static description =
    'Hold a payment: set PaymentMethod K, cash (PUT cashflow/Payments). ' +
    'The payment leaves the payments page until "payment approve" puts it back'

  static examples = [
    '<%= config.bin %> payment hold <payment-id> --dry-run',
    '<%= config.bin %> payment hold <payment-id> --allow-writes',
  ]

  static args = {
    id: Args.string({
      required: true,
      description: 'Payment ID (a GUID)',
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
    const { args } = await this.parse(PaymentHoldCommand)
    await setPaymentMethod(this, args.id, 'K')
  }
}
