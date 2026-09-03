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

const RESOURCE = 'salesinvoice/SalesInvoices'
const LINE_SHAPE = 'item:quantity:unit price[:description]'
const NUMBER_RE = /^-?\d+(\.\d+)?$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * One `--line` as the API wants it. The item stays a code or a GUID here:
 * the lookup runs after the write gate.
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
      description: `Invoice line as ${LINE_SHAPE} (repeatable)`,
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

    if (date && !DATE_RE.test(date)) {
      throw new CliError(`--date expects YYYY-MM-DD, received: ${date}`, {
        exitCode: 64,
      })
    }
    const body = {
      Journal: journal,
      OrderedBy: customer,
      SalesInvoiceLines: this.flags.line.map(parseLine),
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
      SalesInvoiceLines: await resolveItems(this, body.SalesInvoiceLines),
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
