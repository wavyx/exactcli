import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { resolvePath } from '../catalog.js'
import { assertDate, parseLine, resolveLines } from '../lines.js'
import { autoColumns, normalize, unwrap } from '../odata.js'
import { resolveRef } from '../refs.js'
import {
  assertWritesAllowed,
  describeRequest,
  validateWrite,
  writeFlags,
} from '../writes.js'

const GL_ACCOUNTS = 'financial/GLAccounts'
const ACCOUNTS = 'crm/Accounts'
/**
 * One `--line` as the API wants it. The account stays a code or a GUID
 * here: the lookup runs after the write gate.
 */
const LINE = {
  shape: '<gl account>:<amount>[:description]',
  fields: { GLAccount: 'text', AmountFC: 'amount' },
}

/**
 * @typedef {object} BookSpec
 * @property {string} topic
 * @property {string} resource `service/Resource` of the headers
 * @property {string} lines the body field of the lines
 * @property {string} what for example "a bank statement"
 * @property {string} journal an example journal code
 * @property {string} side whose point of view signs the amounts
 */

/**
 * Build the command that books bank or cash movements by hand from ledger
 * account codes. Exact books the line of the bank or cash account itself,
 * so the lines need not balance.
 * @param {BookSpec} spec
 * @returns {typeof BaseCommand}
 */
export function defineBookCommand(spec) {
  const RESOURCE = spec.resource
  return class BookCreateCommand extends BaseCommand {
    static description =
      `Book ${spec.what} by hand from ledger account codes (POST ` +
      `${RESOURCE})`

    static examples = [
      `<%= config.bin %> ${spec.topic} create --journal ${spec.journal} --line "400000:121:Invoice 26700001" --account 1001 --dry-run`,
      `<%= config.bin %> ${spec.topic} create --journal ${spec.journal} --line 656000:-12.5:Fees --date 2026-09-03 --allow-writes`,
    ]

    static flags = {
      ...writeFlags,
      journal: Flags.string({
        required: true,
        description: `Code of the journal, for example ${spec.journal}`,
      }),
      line: Flags.string({
        required: true,
        multiple: true,
        description:
          `Line as ${LINE.shape} (repeatable, at least one). ` +
          'The account is a code or a GUID. The amount is signed from the point ' +
          `of view of ${spec.side}: money received is positive, money paid negative`,
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

      const lines = this.flags.line.map((text) => parseLine(text, LINE))
      if (date !== undefined) assertDate(date, 'date')

      const body = {
        JournalCode: journal,
        [spec.lines]: lines.map((line) => {
          const out = { ...line }
          if (!out.Description && description) out.Description = description
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
        for (const line of body[spec.lines]) line.Account = id
      }
      body[spec.lines] = await resolveLines(
        this,
        body[spec.lines],
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
}
