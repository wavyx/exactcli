import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { resolvePath } from '../../lib/catalog.js'
import { CliError } from '../../lib/errors.js'
import { autoColumns, normalize, unwrap } from '../../lib/odata.js'
import { resolveRef } from '../../lib/refs.js'
import {
  assertWritesAllowed,
  describeRequest,
  validateWrite,
  writeFlags,
} from '../../lib/writes.js'

const RESOURCE = 'purchaseorder/PurchaseOrders'
const LINE_SHAPE = 'item:quantity:unit price[:description]'
const NUMBER_RE = /^-?\d+(\.\d+)?$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * One `--line` as the API wants it. The quantity goes to
 * `QuantityInPurchaseUnits`, the field the catalogue names for a new order.
 * The item stays a code or a GUID here: the lookup runs after the write gate.
 * @param {string} text
 * @returns {{ Item: string, QuantityInPurchaseUnits: number, UnitPrice: number, Description?: string }}
 */
function parseLine(text) {
  const [item, quantity, price, ...rest] = text.split(':')
  if (!item || !NUMBER_RE.test(quantity) || !NUMBER_RE.test(price)) {
    throw new CliError(`--line expects ${LINE_SHAPE}, received: ${text}`, {
      exitCode: 64,
    })
  }
  const line = {
    Item: item,
    QuantityInPurchaseUnits: Number(quantity),
    UnitPrice: Number(price),
  }
  const description = rest.join(':')
  if (description) line.Description = description
  return line
}

/**
 * @param {string} name the flag, for the message
 * @param {string} [value]
 */
function assertDate(name, value) {
  if (value && !DATE_RE.test(value)) {
    throw new CliError(`--${name} expects YYYY-MM-DD, received: ${value}`, {
      exitCode: 64,
    })
  }
}

/**
 * The lines with every item as a GUID. Lookups run one after the other.
 * @param {BaseCommand} cmd
 * @param {object[]} lines
 * @returns {Promise<object[]>}
 */
async function resolveItems(cmd, lines) {
  const out = []
  for (const line of lines) {
    const Item = await resolveRef(cmd, 'logistics/Items', line.Item)
    out.push({ ...line, Item })
  }
  return out
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
      description: `Order line as ${LINE_SHAPE} (repeatable)`,
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

    assertDate('date', date)
    assertDate('receipt-date', receiptDate)
    const body = {
      Supplier: supplier,
      PurchaseOrderLines: this.flags.line.map(parseLine),
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
      PurchaseOrderLines: await resolveItems(this, body.PurchaseOrderLines),
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
