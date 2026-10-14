import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { resolvePath } from '../../lib/catalog.js'
import { CliError } from '../../lib/errors.js'
import { assertDate, parseLine, resolveLines } from '../../lib/lines.js'
import { autoColumns, normalize, unwrap } from '../../lib/odata.js'
import { resolveRef } from '../../lib/refs.js'
import {
  assertWritesAllowed,
  describeRequest,
  validateWrite,
  writeFlags,
} from '../../lib/writes.js'

const RESOURCE = 'salesinvoice/SalesInvoices'
/**
 * One `--line` as the API wants it. The item stays a code or a GUID here:
 * the lookup runs after the write gate.
 */
const LINE = {
  shape: 'item:quantity:unit price[:option=value...][:description]',
  fields: { Item: 'text', Quantity: 'number', UnitPrice: 'number' },
  options: {
    vat: { field: 'VATCode', type: 'text' },
    // A fraction of the price from 0 to 1: a negative one would be a
    // surcharge, above 1 the line would flip its sign.
    discount: { field: 'Discount', type: 'fraction' },
    'gl-account': { field: 'GLAccount', type: 'text' },
    'cost-center': { field: 'CostCenter', type: 'text' },
    'cost-unit': { field: 'CostUnit', type: 'text' },
  },
}
/** The Type of a sales credit note; an invoice is 8020, the API default. */
const CREDIT_NOTE_TYPE = 8021

export default class InvoiceCreateCommand extends BaseCommand {
  static description = `Create a sales invoice from codes (POST ${RESOURCE})`

  static examples = [
    '<%= config.bin %> invoice create --customer 1001 --journal 700 --line Default:2:100 --dry-run',
    '<%= config.bin %> invoice create --customer 1001 --journal 700 --line Default:2:100 --allow-writes',
  ]

  static flags = {
    ...writeFlags,
    customer: Flags.string({
      required: true,
      description: 'Customer code or GUID (crm/Accounts with IsSales)',
    }),
    journal: Flags.string({
      required: true,
      description: 'Sales journal code, for example 700',
    }),
    line: Flags.string({
      required: true,
      multiple: true,
      description:
        `Invoice line as ${LINE.shape} (repeatable). Options: vat (code), ` +
        'discount (a fraction: 0.1 is 10%), gl-account (revenue account code ' +
        'or GUID, instead of the one of the item), cost-center, cost-unit',
    }),
    description: Flags.string({ description: 'Invoice description' }),
    'credit-note': Flags.boolean({
      description:
        `Create a credit note (Type ${CREDIT_NOTE_TYPE}). The lines carry ` +
        'negative quantities: Exact books the signs as given',
      default: false,
    }),
    remarks: Flags.string({ description: 'Remarks printed on the invoice' }),
    reference: Flags.string({
      description: 'Reference of the customer (YourRef)',
    }),
    'payment-condition': Flags.string({
      description: 'Payment condition code (PaymentCondition)',
    }),
    date: Flags.string({ description: 'Invoice date (YYYY-MM-DD)' }),
    'dry-run': Flags.boolean({
      description: 'Show the validated request and send nothing',
      default: false,
    }),
  }

  async run() {
    const { customer, journal, description, date } = this.flags
    const dryRun = this.flags['dry-run']
    const { path } = resolvePath(this.resolveDivision(), RESOURCE)

    if (date) assertDate(date, 'date')
    const body = {
      Journal: journal,
      OrderedBy: customer,
      SalesInvoiceLines: this.flags.line.map((text) => parseLine(text, LINE)),
    }
    if (description) body.Description = description
    if (date) body.InvoiceDate = date
    if (this.flags['credit-note']) {
      // Exact keeps Type 8021 but books the quantities as given (verified
      // live): a positive credit note would post like an invoice.
      const total = body.SalesInvoiceLines.reduce(
        (sum, l) => sum + l.Quantity * l.UnitPrice * (1 - (l.Discount ?? 0)),
        0,
      )
      if (!(total < 0)) {
        throw new CliError(
          '--credit-note needs a negative total: give the lines negative ' +
            'quantities. Exact books the signs as given',
          { exitCode: 64 },
        )
      }
      body.Type = CREDIT_NOTE_TYPE
    }
    if (this.flags.remarks) body.Remarks = this.flags.remarks
    if (this.flags.reference) body.YourRef = this.flags.reference
    if (this.flags['payment-condition']) {
      body.PaymentCondition = this.flags['payment-condition']
    }
    validateWrite({ resource: RESOURCE, body, method: 'POST' })
    // The gate comes before the reference lookups: a refused write costs no
    // call at all. A dry run needs no permission.
    if (!dryRun) assertWritesAllowed(this.flags, 'POST')

    const resolved = {
      ...body,
      OrderedBy: await resolveRef(this, 'crm/Accounts', customer),
      SalesInvoiceLines: await resolveLines(
        this,
        await resolveLines(
          this,
          body.SalesInvoiceLines,
          'Item',
          'logistics/Items',
        ),
        'GLAccount',
        'financial/GLAccounts',
      ),
    }

    if (dryRun) {
      await this.outputResults(
        describeRequest({ method: 'POST', path, body: resolved }),
        {},
      )
      return
    }

    const record = normalize(unwrap(await this.apiClient.post(path, resolved)))
    await this.outputResults(record, autoColumns([record]))
  }
}
