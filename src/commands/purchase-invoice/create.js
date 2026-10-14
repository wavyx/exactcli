import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { resolvePath } from '../../lib/catalog.js'
import { CliError } from '../../lib/errors.js'
import {
  assertDate,
  assertPeriod,
  parseLine,
  resolveLines,
} from '../../lib/lines.js'
import { autoColumns, normalize, unwrap } from '../../lib/odata.js'
import { resolveRef } from '../../lib/refs.js'
import { financialPeriod, today } from '../../lib/periods.js'
import {
  assertWritesAllowed,
  describeRequest,
  validateWrite,
  writeFlags,
} from '../../lib/writes.js'

const RESOURCE = 'purchase/PurchaseInvoices'
/** The `Type` codes of the catalogue. 8033 is a regular purchase invoice. */
const TYPES =
  '8030 direct purchase invoice, 8031 direct purchase invoice (credit), 8033 purchase invoice, 8034 purchase invoice (credit)'
const PURCHASE_INVOICE = 8033
/** The credit note types: Exact refuses them with a positive total. */
const CREDIT_TYPES = [8031, 8034]
const TYPE_CODES = [8030, 8031, PURCHASE_INVOICE, 8034]
/**
 * One `--line` as the API wants it. A purchase invoice line needs an item
 * (or a purchase order line): there is no ledger account on it. The item
 * stays a code or a GUID here: the lookup runs after the write gate.
 */
const LINE = {
  shape: 'item:quantity:unit price[:option=value...][:description]',
  fields: { Item: 'text', Quantity: 'number', UnitPrice: 'number' },
  options: {
    vat: { field: 'VATCode', type: 'text' },
    'vat-amount': { field: 'VATAmount', type: 'amount' },
    // A fraction of the price; above 1 the line would flip its sign.
    discount: { field: 'Discount', type: 'fraction' },
    from: { field: 'From', type: 'date' },
    to: { field: 'To', type: 'date' },
    'cost-center': { field: 'CostCenter', type: 'text' },
    'cost-unit': { field: 'CostUnit', type: 'text' },
  },
}

export default class PurchaseInvoiceCreateCommand extends BaseCommand {
  static description = `Create a purchase invoice from codes (POST ${RESOURCE})`

  static examples = [
    '<%= config.bin %> purchase-invoice create --supplier 2001 --journal 600 --line Default:2:100 --dry-run',
    '<%= config.bin %> purchase-invoice create --supplier 2001 --journal 600 --line Default:2:100 --reference INV-2026-42 --allow-writes',
  ]

  static flags = {
    ...writeFlags,
    supplier: Flags.string({
      required: true,
      description: 'Supplier code or GUID (crm/Accounts with IsSupplier)',
    }),
    journal: Flags.string({
      required: true,
      description: 'Purchase journal code, for example 600',
    }),
    type: Flags.string({
      description: `Invoice type: ${TYPES}`,
      // Any other code would skip the credit sign check.
      options: TYPE_CODES.map(String),
      default: String(PURCHASE_INVOICE),
    }),
    line: Flags.string({
      required: true,
      multiple: true,
      description:
        `Invoice line as ${LINE.shape} (repeatable). Options: vat (code), ` +
        'vat-amount, discount (a fraction: 0.1 is 10%), from and to ' +
        '(YYYY-MM-DD, together), cost-center, cost-unit. A credit type ' +
        'takes negative quantities',
    }),
    description: Flags.string({ description: 'Invoice description' }),
    date: Flags.string({
      description:
        'Invoice date (YYYY-MM-DD). The financial year and period come from ' +
        'it, or from today without --date',
    }),
    reference: Flags.string({
      description: 'Invoice number of the supplier (YourRef)',
    }),
    'dry-run': Flags.boolean({
      description: 'Show the validated request and send nothing',
      default: false,
    }),
  }

  async run() {
    const { supplier, journal, description, date, reference } = this.flags
    const type = Number(this.flags.type)
    const dryRun = this.flags['dry-run']
    const { path } = resolvePath(this.resolveDivision(), RESOURCE)

    if (date) assertDate(date, 'date')
    const body = {
      Journal: journal,
      Supplier: supplier,
      Type: type,
      PurchaseInvoiceLines: this.flags.line.map((text) => {
        const line = parseLine(text, LINE)
        assertPeriod(line, text)
        return line
      }),
    }
    if (CREDIT_TYPES.includes(type)) {
      // Exact refuses a credit note with a positive total (verified live).
      const total = body.PurchaseInvoiceLines.reduce(
        (sum, l) => sum + l.Quantity * l.UnitPrice * (1 - (l.Discount ?? 0)),
        0,
      )
      if (!(total < 0)) {
        throw new CliError(
          `--type ${type} is a credit note: give the lines negative ` +
            'quantities, Exact refuses a positive total',
          { exitCode: 64 },
        )
      }
    }
    if (description) body.Description = description
    if (date) body.InvoiceDate = date
    if (reference) body.YourRef = reference
    validateWrite({ resource: RESOURCE, body, method: 'POST' })
    // The gate comes before the reference lookups: a refused write costs no
    // call at all. A dry run needs no permission.
    if (!dryRun) assertWritesAllowed(this.flags, 'POST')

    const resolved = {
      ...body,
      Supplier: await resolveRef(this, 'crm/Accounts', supplier),
      PurchaseInvoiceLines: await resolveLines(
        this,
        body.PurchaseInvoiceLines,
        'Item',
        'logistics/Items',
      ),
      // Exact refuses a purchase invoice without its financial year and does
      // not derive it from the date (verified live).
      ...(await financialPeriod(this, date ?? today())),
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
