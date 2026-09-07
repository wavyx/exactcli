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

const RESOURCE = 'cashflow/Payments'
const METHODS = ['B', 'I', 'K', 'V']

/**
 * PUT the payment method of one payment. This is the switch of the "Approve
 * payments" flow of Exact: K (cash) takes the payment off the payments page,
 * B (electronic) puts it back so that it can be processed.
 * @param {BaseCommand} cmd a command that parsed the write flags and --dry-run
 * @param {string} id payment GUID
 * @param {string} method one of B, I, K, V
 */
export async function setPaymentMethod(cmd, id, method) {
  const { path: basePath, resource } = resolvePath(
    cmd.resolveDivision(),
    RESOURCE,
  )
  const path = `${basePath}${renderKey(resource, RESOURCE, id)}`
  const body = { PaymentMethod: method }
  validateWrite({ resource: RESOURCE, body, method: 'PUT' })

  if (cmd.flags['dry-run']) {
    await cmd.outputResults(describeRequest({ method: 'PUT', path, body }), {})
    return
  }

  assertWritesAllowed(cmd.flags, 'PUT')
  await cmd.apiClient.put(path, body)
  await cmd.outputAction(
    { ok: true, path, key: id, method },
    `Payment ${id}: method ${method}`,
  )
}

export default class PaymentApproveCommand extends BaseCommand {
  static description =
    `Approve a payment: set PaymentMethod B, electronic (PUT ${RESOURCE}). ` +
    'The payment shows on the payments page again and can be processed'

  static examples = [
    '<%= config.bin %> payment approve <payment-id> --dry-run',
    '<%= config.bin %> payment approve <payment-id> --allow-writes',
    '<%= config.bin %> payment approve <payment-id> --method K --allow-writes',
  ]

  static args = {
    id: Args.string({
      required: true,
      description: 'Payment ID (a GUID)',
    }),
  }

  static flags = {
    ...writeFlags,
    method: Flags.string({
      default: 'B',
      options: METHODS,
      description:
        'PaymentMethod: B electronic (approved), I collection, K cash ' +
        '(held), V credit card',
    }),
    'dry-run': Flags.boolean({
      description: 'Show the request and send nothing',
      default: false,
    }),
  }

  async run() {
    const { args } = await this.parse(PaymentApproveCommand)
    await setPaymentMethod(this, args.id, this.flags.method)
  }
}
