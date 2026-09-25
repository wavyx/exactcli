import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { resolvePath } from '../../lib/catalog.js'
import { CliError } from '../../lib/errors.js'
import { assertDate, parseLine, resolveLines } from '../../lib/lines.js'
import { autoColumns, normalize, unwrap } from '../../lib/odata.js'
import {
  assertWritesAllowed,
  describeRequest,
  validateWrite,
  writeFlags,
} from '../../lib/writes.js'

const RESOURCE = 'generaljournalentry/GeneralJournalEntries'
const GL_ACCOUNTS = 'financial/GLAccounts'
/**
 * One `--line` as the API wants it. The account stays a code or a GUID
 * here: the lookup runs after the write gate.
 */
const LINE = {
  shape: '<gl account>:<amount>[:description]',
  fields: { GLAccount: 'text', AmountFC: 'amount' },
}
/** Two-decimal amounts sum with float noise far below half a cent. */
const TOLERANCE = 0.005

export default class JournalEntryCreateCommand extends BaseCommand {
  static description =
    'Post a general journal entry (OD) from ledger account codes (POST generaljournalentry/GeneralJournalEntries)'

  static examples = [
    '<%= config.bin %> journal-entry create --journal 800 --line 499000:50:Rent --line 580600:-50 --dry-run',
    '<%= config.bin %> journal-entry create --journal 800 --line 499000:50 --line 580600:-50 --date 2026-09-03 --allow-writes',
  ]

  static flags = {
    ...writeFlags,
    journal: Flags.string({
      required: true,
      description: 'Journal code, for example 800',
    }),
    line: Flags.string({
      required: true,
      multiple: true,
      description:
        `Line as ${LINE.shape} (repeatable, at least two). ` +
        'The account is a code or a GUID; debit is positive, credit negative',
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
    await this.parse(JournalEntryCreateCommand)
    const { journal, date, description } = this.flags
    const dryRun = this.flags['dry-run']
    const { path } = resolvePath(this.resolveDivision(), RESOURCE)

    const lines = this.flags.line.map((text) => parseLine(text, LINE))
    if (lines.length < 2) {
      throw new CliError('A journal entry needs at least two --line values', {
        exitCode: 64,
      })
    }
    if (date !== undefined) assertDate(date, 'date')
    const sum = lines.reduce((total, line) => total + line.AmountFC, 0)
    if (Math.abs(sum) > TOLERANCE) {
      throw new CliError(
        `The lines do not balance: the amounts sum to ${sum.toFixed(2)}`,
        { exitCode: 64 },
      )
    }

    const body = {
      JournalCode: journal,
      GeneralJournalEntryLines: lines.map((line) => {
        const out = { ...line }
        if (!out.Description && description) out.Description = description
        if (date) out.Date = date
        return out
      }),
    }
    validateWrite({ resource: RESOURCE, body, method: 'POST' })
    // The gate comes before the account lookups: a refused write costs no
    // call at all. A dry run needs no permission.
    if (!dryRun) assertWritesAllowed(this.flags, 'POST')
    body.GeneralJournalEntryLines = await resolveLines(
      this,
      body.GeneralJournalEntryLines,
      'GLAccount',
      GL_ACCOUNTS,
    )

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
