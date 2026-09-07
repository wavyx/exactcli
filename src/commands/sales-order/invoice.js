import { Args, Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { resolvePath } from '../../lib/catalog.js'
import { CliError } from '../../lib/errors.js'
import { assertDate } from '../../lib/lines.js'
import { autoColumns, normalize, unwrap } from '../../lib/odata.js'
import { GUID_RE } from '../../lib/refs.js'
import {
  assertWritesAllowed,
  describeRequest,
  validateWrite,
  writeFlags,
} from '../../lib/writes.js'

const RESOURCE = 'salesinvoice/InvoiceSalesOrders'

export default class SalesOrderInvoiceCommand extends BaseCommand {
  static description = `Invoice sales orders (POST ${RESOURCE})`

  static examples = [
    '<%= config.bin %> sales-order invoice <order-id> --journal 700 --dry-run',
    '<%= config.bin %> sales-order invoice <order-id> <order-id> --journal 700 --create-mode 0 --allow-writes',
    '<%= config.bin %> sales-order invoice <order-id> --journal 700 --async --allow-writes',
  ]

  /** The command takes one GUID per argument, as many as needed. */
  static strict = false

  static args = {
    order: Args.string({
      required: true,
      description: 'Sales order GUID (repeat for more orders)',
    }),
  }

  static flags = {
    ...writeFlags,
    journal: Flags.string({
      required: true,
      description: 'Code of the sales journal, for example 700',
    }),
    'create-mode': Flags.integer({
      default: 1,
      min: 0,
      max: 1,
      description:
        'CreateMode: 0 one invoice per customer, 1 one invoice per sales order',
    }),
    'invoice-mode': Flags.integer({
      default: 0,
      min: 0,
      max: 1,
      description:
        'InvoiceMode: 0 invoice the quantity delivered (default), 1 the ' +
        'quantity ordered',
    }),
    'invoice-date': Flags.string({
      description:
        'Invoice date (YYYY-MM-DD, UserInvoiceDate). Exact applies it only ' +
        'in the QuickBooks integration',
    }),
    async: Flags.boolean({
      default: false,
      description:
        'Mode 1: Exact queues the run and answers a ProcessID for ' +
        'InvoiceSalesOrdersResult. Exact keeps only this mode after October ' +
        '2026; without the flag the run is synchronous (Mode 0)',
    }),
    'dry-run': Flags.boolean({
      description: 'Show the validated request and send nothing',
      default: false,
    }),
  }

  async run() {
    const { argv } = await this.parse(SalesOrderInvoiceCommand)
    const { journal } = this.flags
    const invoiceDate = this.flags['invoice-date']
    const dryRun = this.flags['dry-run']
    const { path } = resolvePath(this.resolveDivision(), RESOURCE)

    const bad = argv.find((id) => !GUID_RE.test(id))
    if (bad !== undefined) {
      throw new CliError(`A sales order is a GUID, received: ${bad}`, {
        exitCode: 64,
      })
    }
    if (invoiceDate) assertDate(invoiceDate, 'invoice-date')

    const body = {
      CreateMode: this.flags['create-mode'],
      InvoiceMode: this.flags['invoice-mode'],
      JournalCode: journal,
      SalesOrderIDs: argv.map((id) => ({ ID: id })),
    }
    if (invoiceDate) body.UserInvoiceDate = invoiceDate
    if (this.flags.async) body.Mode = 1
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
