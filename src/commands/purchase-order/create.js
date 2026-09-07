import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { resolvePath } from '../../lib/catalog.js'
import { assertDate, parseLine, resolveLines } from '../../lib/lines.js'
import { autoColumns, normalize, unwrap } from '../../lib/odata.js'
import { resolveRef } from '../../lib/refs.js'
import {
  assertWritesAllowed,
  describeRequest,
  validateWrite,
  writeFlags,
} from '../../lib/writes.js'

const RESOURCE = 'purchaseorder/PurchaseOrders'
/**
 * One `--line` as the API wants it. The quantity goes to
 * `QuantityInPurchaseUnits`, the field the catalogue names for a new order.
 * The item stays a code or a GUID here: the lookup runs after the write gate.
 */
const LINE = {
  shape: 'item:quantity:unit price[:description]',
  fields: {
    Item: 'text',
    QuantityInPurchaseUnits: 'number',
    UnitPrice: 'number',
  },
}

export default class PurchaseOrderCreateCommand extends BaseCommand {
  static description = `Create a purchase order from codes (POST ${RESOURCE})`

  static examples = [
    '<%= config.bin %> purchase-order create --supplier 2001 --line Default:2:100 --dry-run',
    '<%= config.bin %> purchase-order create --supplier 2001 --line Default:2:100 --receipt-date 2026-09-10 --allow-writes',
  ]

  static flags = {
    ...writeFlags,
    supplier: Flags.string({
      required: true,
      description: 'Supplier code or GUID (crm/Accounts with IsSupplier)',
    }),
    line: Flags.string({
      required: true,
      multiple: true,
      description: `Order line as ${LINE.shape} (repeatable)`,
    }),
    description: Flags.string({ description: 'Order description' }),
    date: Flags.string({ description: 'Order date (YYYY-MM-DD)' }),
    'receipt-date': Flags.string({
      description: 'Expected receipt date (YYYY-MM-DD)',
    }),
    reference: Flags.string({
      description: 'Reference of the supplier (YourRef)',
    }),
    'dry-run': Flags.boolean({
      description: 'Show the validated request and send nothing',
      default: false,
    }),
  }

  async run() {
    const { supplier, description, date, reference } = this.flags
    const receiptDate = this.flags['receipt-date']
    const dryRun = this.flags['dry-run']
    const { path } = resolvePath(this.resolveDivision(), RESOURCE)

    if (date) assertDate(date, 'date')
    if (receiptDate) assertDate(receiptDate, 'receipt-date')
    const body = {
      Supplier: supplier,
      PurchaseOrderLines: this.flags.line.map((text) => parseLine(text, LINE)),
    }
    if (description) body.Description = description
    if (date) body.OrderDate = date
    if (receiptDate) body.ReceiptDate = receiptDate
    if (reference) body.YourRef = reference
    validateWrite({ resource: RESOURCE, body, method: 'POST' })
    // The gate comes before the reference lookups: a refused write costs no
    // call at all. A dry run needs no permission.
    if (!dryRun) assertWritesAllowed(this.flags, 'POST')

    const resolved = {
      ...body,
      Supplier: await resolveRef(this, 'crm/Accounts', supplier),
      PurchaseOrderLines: await resolveLines(
        this,
        body.PurchaseOrderLines,
        'Item',
        'logistics/Items',
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
