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

const RESOURCE = 'purchase/PurchaseInvoices'
const LINE_SHAPE = 'item:quantity:unit price[:description]'
/** The `Type` codes of the catalogue. 8033 is a regular purchase invoice. */
const TYPES =
  '8030 direct purchase invoice, 8031 direct purchase invoice (credit), 8033 purchase invoice, 8034 purchase invoice (credit)'
const PURCHASE_INVOICE = 8033
const NUMBER_RE = /^-?\d+(\.\d+)?$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * One `--line` as the API wants it. A purchase invoice line needs an item
 * (or a purchase order line): there is no ledger account on it. The item
 * stays a code or a GUID here: the lookup runs after the write gate.
 * @param {string} text
 * @returns {{ Item: string, Quantity: number, UnitPrice: number, Description?: string }}
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
    Quantity: Number(quantity),
    UnitPrice: Number(price),
  }
  const description = rest.join(':')
  if (description) line.Description = description
  return line
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
    type: Flags.integer({
      description: `Invoice type: ${TYPES}`,
      default: PURCHASE_INVOICE,
    }),
    line: Flags.string({
      required: true,
      multiple: true,
      description: `Invoice line as ${LINE_SHAPE} (repeatable)`,
    }),
    description: Flags.string({ description: 'Invoice description' }),
    date: Flags.string({ description: 'Invoice date (YYYY-MM-DD)' }),
    reference: Flags.string({
      description: 'Invoice number of the supplier (YourRef)',
    }),
    'dry-run': Flags.boolean({
      description: 'Show the validated request and send nothing',
      default: false,
    }),
  }

  async run() {
    const { supplier, journal, type, description, date, reference } = this.flags
    const dryRun = this.flags['dry-run']
    const { path } = resolvePath(this.resolveDivision(), RESOURCE)

    if (date && !DATE_RE.test(date)) {
      throw new CliError(`--date expects YYYY-MM-DD, received: ${date}`, {
        exitCode: 64,
      })
    }
    const body = {
      Journal: journal,
      Supplier: supplier,
      Type: type,
      PurchaseInvoiceLines: this.flags.line.map(parseLine),
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
      PurchaseInvoiceLines: await resolveItems(this, body.PurchaseInvoiceLines),
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
