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

const RESOURCE = 'crm/Quotations'
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

export default class QuotationCreateCommand extends BaseCommand {
  static description = `Create a quotation from codes (POST ${RESOURCE})`

  static examples = [
    '<%= config.bin %> quotation create --account 1001 --line Default:2:100 --dry-run',
    '<%= config.bin %> quotation create --account 1001 --line Default:2:100 --close-date 2026-09-30 --allow-writes',
  ]

  static flags = {
    ...writeFlags,
    account: Flags.string({
      required: true,
      description:
        'Account code or GUID that asked for the quotation (OrderAccount)',
    }),
    line: Flags.string({
      required: true,
      multiple: true,
      description: `Quotation line as ${LINE_SHAPE} (repeatable)`,
    }),
    description: Flags.string({ description: 'Quotation description' }),
    date: Flags.string({ description: 'Quotation date (YYYY-MM-DD)' }),
    'close-date': Flags.string({
      description:
        'Date on which the customer accepted or rejected the quotation (YYYY-MM-DD)',
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
    const { account, description, date, reference } = this.flags
    const closeDate = this.flags['close-date']
    const dryRun = this.flags['dry-run']
    const { path } = resolvePath(this.resolveDivision(), RESOURCE)

    assertDate('date', date)
    assertDate('close-date', closeDate)
    const body = {
      OrderAccount: account,
      QuotationLines: this.flags.line.map(parseLine),
    }
    if (description) body.Description = description
    if (date) body.QuotationDate = date
    if (closeDate) body.CloseDate = closeDate
    if (reference) body.YourRef = reference
    validateWrite({ resource: RESOURCE, body, method: 'POST' })
    // The gate comes before the reference lookups: a refused write costs no
    // call at all. A dry run needs no permission.
    if (!dryRun) assertWritesAllowed(this.flags, 'POST')

    const resolved = {
      ...body,
      OrderAccount: await resolveRef(this, 'crm/Accounts', account),
      QuotationLines: await resolveItems(this, body.QuotationLines),
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
