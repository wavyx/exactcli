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

const RESOURCE = 'salesinvoice/SalesInvoices'
/**
 * One `--line` as the API wants it. The item stays a code or a GUID here:
 * the lookup runs after the write gate.
 */
const LINE = {
  shape: 'item:quantity:unit price[:description]',
  fields: { Item: 'text', Quantity: 'number', UnitPrice: 'number' },
}

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
      description: `Invoice line as ${LINE.shape} (repeatable)`,
    }),
    description: Flags.string({ description: 'Invoice description' }),
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
    validateWrite({ resource: RESOURCE, body, method: 'POST' })
    // The gate comes before the reference lookups: a refused write costs no
    // call at all. A dry run needs no permission.
    if (!dryRun) assertWritesAllowed(this.flags, 'POST')

    const resolved = {
      ...body,
      OrderedBy: await resolveRef(this, 'crm/Accounts', customer),
      SalesInvoiceLines: await resolveLines(
        this,
        body.SalesInvoiceLines,
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
