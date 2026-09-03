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

const RESOURCE = 'financialtransaction/BankEntries'
const GL_ACCOUNTS = 'financial/GLAccounts'
const ACCOUNTS = 'crm/Accounts'
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const AMOUNT_RE = /^[+-]?\d+(\.\d+)?$/

/**
 * One `--line` value: `<gl account>:<amount>[:description]`. The first two
 * colons split; the description keeps any colon after them.
 * @param {string} text
 * @returns {{ account: string, amount: number, description: string }}
 */
function parseLine(text) {
  const [account, amount, ...rest] = text.split(':')
  if (!account || !AMOUNT_RE.test(amount ?? '')) {
    throw new CliError(
      `--line expects <gl account>:<amount>[:description], received: ${text}`,
      { exitCode: 64 },
    )
  }
  return { account, amount: Number(amount), description: rest.join(':') }
}

export default class BankEntryCreateCommand extends BaseCommand {
  static description =
    'Book a bank statement by hand from ledger account codes (POST ' +
    `${RESOURCE})`

  static examples = [
    '<%= config.bin %> bank-entry create --journal 500 --line 400000:121:Invoice 26700001 --account 1001 --dry-run',
    '<%= config.bin %> bank-entry create --journal 500 --line 656000:-12.5:Fees --date 2026-09-03 --allow-writes',
  ]

  static flags = {
    ...writeFlags,
    journal: Flags.string({
      required: true,
      description: 'Code of the bank journal, for example 500',
    }),
    line: Flags.string({
      required: true,
      multiple: true,
      description:
        'Line as <gl account>:<amount>[:description] (repeatable, at least one). ' +
        'The account is a code or a GUID. The amount is signed from the point ' +
        'of view of the bank: money received is positive, money paid negative',
    }),
    account: Flags.string({
      description:
        'Customer or supplier code or GUID (crm/Accounts) carried by every line: ' +
        'a receipt from a customer or a payment to a supplier',
    }),
    date: Flags.string({ description: 'Date of every line (YYYY-MM-DD)' }),
    description: Flags.string({
      description: 'Description of the lines that carry none',
    }),
    'dry-run': Flags.boolean({
      description: 'Show the validated request and send nothing',
      default: false,
    }),
  }

  async run() {
    const { journal, account, date, description } = this.flags
    const dryRun = this.flags['dry-run']
    const { path } = resolvePath(this.resolveDivision(), RESOURCE)

    const lines = this.flags.line.map(parseLine)
    if (date !== undefined && !DATE_RE.test(date)) {
      throw new CliError(`Expected YYYY-MM-DD, received ${date}`, {
        exitCode: 64,
      })
    }

    // Exact books the line of the bank account itself, so the lines need not
    // balance.
    const body = {
      JournalCode: journal,
      BankEntryLines: lines.map((line) => {
        const out = { GLAccount: line.account, AmountFC: line.amount }
        const text = line.description || description
        if (text) out.Description = text
        if (date) out.Date = date
        return out
      }),
    }
    validateWrite({ resource: RESOURCE, body, method: 'POST' })
    // The gate comes before the lookups: a refused write costs no call at
    // all. A dry run needs no permission.
    if (!dryRun) assertWritesAllowed(this.flags, 'POST')
    if (account) {
      const id = await resolveRef(this, ACCOUNTS, account)
      for (const line of body.BankEntryLines) line.Account = id
    }
    for (const line of body.BankEntryLines) {
      line.GLAccount = await resolveRef(this, GL_ACCOUNTS, line.GLAccount)
    }

    if (dryRun) {
      await this.outputResults(
        describeRequest({ method: 'POST', path, body }),
        {},
      )
      return
    }

    const response = await this.apiClient.post(path, body)
    const record = normalize(unwrap(response))
    await this.outputResults(record, autoColumns([record]))
  }
}
