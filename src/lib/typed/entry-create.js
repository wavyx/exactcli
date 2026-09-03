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

const ACCOUNTS = 'crm/Accounts'
const GL_ACCOUNTS = 'financial/GLAccounts'
const LINE_SHAPE = '<gl account>:<amount>[:description]'
const AMOUNT_RE = /^[+-]?\d+(\.\d+)?$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const INT_RE = /^\d+$/

/**
 * One `--line` as the API wants it. The account stays a code or a GUID
 * here: the lookup runs after the write gate.
 * @param {string} text
 * @returns {{ GLAccount: string, AmountFC: number, Description?: string }}
 */
function parseLine(text) {
  const [account, amount, ...rest] = text.split(':')
  if (!account || !AMOUNT_RE.test(amount ?? '')) {
    throw new CliError(`--line expects ${LINE_SHAPE}, received: ${text}`, {
      exitCode: 64,
    })
  }
  const line = { GLAccount: account, AmountFC: Number(amount) }
  const description = rest.join(':')
  if (description) line.Description = description
  return line
}

/**
 * A `create` command that posts a sales or a purchase entry from codes.
 * Exact books the control account line itself, so the lines carry only
 * the revenue or cost side.
 * @param {object} options
 * @param {string} options.topic `sales-entry` or `purchase-entry`
 * @param {string} options.resource `service/Resource` of the entry
 * @param {string} options.party body field of the account: `Customer` or `Supplier`; the flag is its lower case
 * @param {string} options.partyLabel help text of the party flag
 * @param {string} options.journal journal code of the examples
 * @param {string} options.journalHint help text of the journal flag
 * @param {string} options.lines body field of the lines
 * @param {{ field: string, integer?: boolean }} options.invoice body field of `--invoice`
 * @returns {typeof BaseCommand}
 */
export function defineEntryCreate({
  topic,
  resource,
  party,
  partyLabel,
  journal,
  journalHint,
  lines,
  invoice,
}) {
  const partyFlag = party.toLowerCase()
  const kind = topic.split('-')[0]
  const example = `<%= config.bin %> ${topic} create --${partyFlag} 1001 --journal ${journal} --line 700000:100`

  return class EntryCreateCommand extends BaseCommand {
    static description = `Post a ${kind} entry from codes (POST ${resource})`

    static examples = [`${example} --dry-run`, `${example} --allow-writes`]

    static flags = {
      ...writeFlags,
      [partyFlag]: Flags.string({ required: true, description: partyLabel }),
      journal: Flags.string({ required: true, description: journalHint }),
      line: Flags.string({
        required: true,
        multiple: true,
        description:
          `Line as ${LINE_SHAPE} (repeatable). ` +
          'The account is a code or a GUID; the amount is a decimal',
      }),
      description: Flags.string({ description: 'Entry description' }),
      date: Flags.string({ description: 'Entry date (YYYY-MM-DD)' }),
      invoice: Flags.string({
        description: `${invoice.integer ? 'Invoice number' : 'Invoice reference'} (${invoice.field})`,
      }),
      'dry-run': Flags.boolean({
        description: 'Show the validated request and send nothing',
        default: false,
      }),
    }

    async run() {
      const { journal, description, date } = this.flags
      const dryRun = this.flags['dry-run']
      const reference = this.flags.invoice
      const { path } = resolvePath(this.resolveDivision(), resource)

      if (date && !DATE_RE.test(date)) {
        throw new CliError(`--date expects YYYY-MM-DD, received: ${date}`, {
          exitCode: 64,
        })
      }
      if (reference && invoice.integer && !INT_RE.test(reference)) {
        throw new CliError(
          `--invoice expects a whole number, received: ${reference}`,
          { exitCode: 64 },
        )
      }
      const body = {
        [party]: this.flags[partyFlag],
        Journal: journal,
        [lines]: this.flags.line.map(parseLine),
      }
      if (description) body.Description = description
      if (date) body.EntryDate = date
      if (reference) {
        body[invoice.field] = invoice.integer ? Number(reference) : reference
      }
      validateWrite({ resource, body, method: 'POST' })
      // The gate comes before the reference lookups: a refused write costs no
      // call at all. A dry run needs no permission.
      if (!dryRun) assertWritesAllowed(this.flags, 'POST')

      body[party] = await resolveRef(this, ACCOUNTS, body[party])
      for (const line of body[lines]) {
        line.GLAccount = await resolveRef(this, GL_ACCOUNTS, line.GLAccount)
      }

      if (dryRun) {
        await this.outputResults(
          describeRequest({ method: 'POST', path, body }),
          {},
        )
        return
      }

      const record = normalize(unwrap(await this.apiClient.post(path, body)))
      await this.outputResults(record, autoColumns([record]))
    }
  }
}
