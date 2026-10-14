import { Args, Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { resolvePath } from '../../lib/catalog.js'
import { CliError } from '../../lib/errors.js'
import { resultError, waitForInvoiceResult } from '../../lib/invoice-result.js'
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
  static description =
    `Invoice sales orders: Exact queues the run and answers a ProcessID ` +
    `(POST ${RESOURCE}); --wait reads the result ` +
    `(GET read/salesinvoice/InvoiceSalesOrderResult)`

  static examples = [
    '<%= config.bin %> sales-order invoice <order-id> --journal 700 --dry-run',
    '<%= config.bin %> sales-order invoice <order-id> <order-id> --journal 700 --create-mode 0 --allow-writes',
    '<%= config.bin %> sales-order invoice <order-id> --journal 700 --wait --allow-writes',
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
    wait: Flags.boolean({
      default: false,
      description:
        'Wait for the queued run to end and print its result (exit 65 on an ' +
        'error status)',
    }),
    interval: Flags.integer({
      default: 5,
      min: 2,
      description: 'Seconds between two result reads with --wait',
    }),
    'wait-timeout': Flags.integer({
      default: 300,
      min: 1,
      description:
        'Seconds to wait with --wait; then exit 75 and name the ProcessID',
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
    // Exact switched the synchronous mode off in October 2026: the run is
    // always queued (Mode 1) and InvoiceSalesOrderResult reports it.
    body.Mode = 1
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
    if (!this.flags.wait) {
      await this.outputResults(record, autoColumns([record]))
      return
    }
    if (!record.ProcessID) {
      throw new CliError('Exact answered no ProcessID: nothing to wait for', {
        exitCode: 65,
      })
    }
    // The invoicing runs already: a failed read below must not lose its id.
    process.stderr.write(`ProcessID: ${record.ProcessID}\n`)
    const result = await waitForInvoiceResult(
      this,
      this.resolveDivision(),
      record.ProcessID,
      {
        intervalMs: this.flags.interval * 1000,
        timeoutMs: this.flags['wait-timeout'] * 1000,
      },
    )
    await this.outputResults(result, autoColumns([result]))
    const error = resultError(result)
    if (error) throw error
  }
}
