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

const RESOURCE = 'salesorder/SalesOrders'
/**
 * One `--line` as the API wants it. The item stays a code or a GUID here:
 * the lookup runs after the write gate.
 */
const LINE = {
  shape: 'item:quantity:unit price[:description]',
  fields: { Item: 'text', Quantity: 'number', UnitPrice: 'number' },
}

export default class SalesOrderCreateCommand extends BaseCommand {
  static description = `Create a sales order from codes (POST ${RESOURCE})`

  static examples = [
    '<%= config.bin %> sales-order create --customer 1001 --line Default:2:100 --dry-run',
    '<%= config.bin %> sales-order create --customer 1001 --line Default:2:100 --delivery-date 2026-09-10 --allow-writes',
  ]

  static flags = {
    ...writeFlags,
    customer: Flags.string({
      required: true,
      description: 'Customer code or GUID (crm/Accounts with IsSales)',
    }),
    line: Flags.string({
      required: true,
      multiple: true,
      description: `Order line as ${LINE.shape} (repeatable)`,
    }),
    description: Flags.string({ description: 'Order description' }),
    date: Flags.string({ description: 'Order date (YYYY-MM-DD)' }),
    'delivery-date': Flags.string({
      description: 'Delivery date (YYYY-MM-DD)',
    }),
    reference: Flags.string({
      description: 'Reference of the customer (YourRef)',
    }),
    'dry-run': Flags.boolean({
      description: 'Show the validated request and send nothing',
      default: false,
    }),
  }

  async run() {
    const { customer, description, date, reference } = this.flags
    const deliveryDate = this.flags['delivery-date']
    const dryRun = this.flags['dry-run']
    const { path } = resolvePath(this.resolveDivision(), RESOURCE)

    if (date) assertDate(date, 'date')
    if (deliveryDate) assertDate(deliveryDate, 'delivery-date')
    const body = {
      OrderedBy: customer,
      SalesOrderLines: this.flags.line.map((text) => parseLine(text, LINE)),
    }
    if (description) body.Description = description
    if (date) body.OrderDate = date
    if (deliveryDate) body.DeliveryDate = deliveryDate
    if (reference) body.YourRef = reference
    validateWrite({ resource: RESOURCE, body, method: 'POST' })
    // The gate comes before the reference lookups: a refused write costs no
    // call at all. A dry run needs no permission.
    if (!dryRun) assertWritesAllowed(this.flags, 'POST')

    const resolved = {
      ...body,
      OrderedBy: await resolveRef(this, 'crm/Accounts', customer),
      SalesOrderLines: await resolveLines(
        this,
        body.SalesOrderLines,
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
