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

const RESOURCE = 'crm/Quotations'
/**
 * One `--line` as the API wants it. The item stays a code or a GUID here:
 * the lookup runs after the write gate.
 */
const LINE = {
  shape: 'item:quantity:unit price[:description]',
  fields: { Item: 'text', Quantity: 'number', UnitPrice: 'number' },
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
      description: `Quotation line as ${LINE.shape} (repeatable)`,
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

    if (date) assertDate(date, 'date')
    if (closeDate) assertDate(closeDate, 'close-date')
    const body = {
      OrderAccount: account,
      QuotationLines: this.flags.line.map((text) => parseLine(text, LINE)),
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
      QuotationLines: await resolveLines(
        this,
        body.QuotationLines,
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
