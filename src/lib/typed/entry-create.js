import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { resolvePath } from '../../lib/catalog.js'
import { CliError } from '../../lib/errors.js'
import { assertDate, parseLine, resolveLines } from '../../lib/lines.js'
import {
  autoColumns,
  divisionPath,
  normalize,
  unwrap,
} from '../../lib/odata.js'
import { resolveRef } from '../../lib/refs.js'
import {
  assertWritesAllowed,
  describeRequest,
  validateWrite,
  writeFlags,
} from '../../lib/writes.js'

const ACCOUNTS = 'crm/Accounts'
const GL_ACCOUNTS = 'financial/GLAccounts'
const DOCUMENTS = 'documents/Documents'
const ATTACHMENTS = 'documents/DocumentAttachments'
const INT_RE = /^\d+$/
/** What --dry-run prints as the document of the entry. */
const NEW_DOCUMENT = '<new document>'
/**
 * One `--line` as the API wants it. The account stays a code or a GUID
 * here: the lookup runs after the write gate.
 */
const LINE = {
  shape: '<gl account>:<amount>[:description]',
  fields: { GLAccount: 'text', AmountFC: 'amount' },
}

/**
 * The bytes of a file to attach. Every file is read before the first
 * request: a file that cannot be read must not leave a document behind.
 * @param {string} path
 * @returns {{ fileName: string, bytes: Buffer }}
 */
function readAttachment(path) {
  try {
    return { fileName: basename(path), bytes: readFileSync(path) }
  } catch (cause) {
    throw new CliError(`Cannot read ${path}: ${cause.message}`, {
      exitCode: 65,
      cause,
    })
  }
}

/**
 * A new document that carries the files, for the entry to link.
 * @param {BaseCommand} cmd
 * @param {{ subject: string, type: number, files: { fileName: string, bytes: Buffer }[] }} options
 * @returns {Promise<string>} the ID of the document
 */
async function createDocument(cmd, { subject, type, files }) {
  const division = cmd.resolveDivision()
  const doc = unwrap(
    await cmd.apiClient.post(divisionPath(division, DOCUMENTS), {
      Subject: subject,
      Type: type,
    }),
  )
  for (const { fileName, bytes } of files) {
    await cmd.apiClient.post(divisionPath(division, ATTACHMENTS), {
      Document: doc.ID,
      FileName: fileName,
      Attachment: bytes.toString('base64'),
    })
  }
  return doc.ID
}

/**
 * A `create` command that posts a sales or a purchase entry from codes.
 * Exact books the control account line itself, so the lines carry only
 * the revenue or cost side. Files land on one new document of the entry.
 * @param {object} options
 * @param {string} options.topic `sales-entry` or `purchase-entry`
 * @param {string} options.resource `service/Resource` of the entry
 * @param {string} options.party body field of the account: `Customer` or `Supplier`; the flag is its lower case
 * @param {string} options.partyLabel help text of the party flag
 * @param {string} options.journal journal code of the examples
 * @param {string} options.journalHint help text of the journal flag
 * @param {string} options.lines body field of the lines
 * @param {{ field: string, integer?: boolean }} options.invoice body field of `--invoice`
 * @param {number} options.documentType document type of the files: 10 sales, 20 purchase
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
  documentType,
}) {
  const partyFlag = party.toLowerCase()
  const kind = topic.split('-')[0]
  const example = `<%= config.bin %> ${topic} create --${partyFlag} 1001 --journal ${journal} --line 700000:100`

  return class EntryCreateCommand extends BaseCommand {
    static description = `Post a ${kind} entry from codes (POST ${resource})`

    static examples = [
      `${example} --dry-run`,
      `${example} --allow-writes`,
      `${example} --file invoice.pdf --allow-writes`,
    ]

    static flags = {
      ...writeFlags,
      [partyFlag]: Flags.string({ required: true, description: partyLabel }),
      journal: Flags.string({ required: true, description: journalHint }),
      line: Flags.string({
        required: true,
        multiple: true,
        description:
          `Line as ${LINE.shape} (repeatable). ` +
          'The account is a code or a GUID; the amount is a decimal',
      }),
      description: Flags.string({ description: 'Entry description' }),
      date: Flags.string({ description: 'Entry date (YYYY-MM-DD)' }),
      invoice: Flags.string({
        description: `${invoice.integer ? 'Invoice number' : 'Invoice reference'} (${invoice.field})`,
      }),
      file: Flags.string({
        multiple: true,
        description:
          'File to attach (repeatable). The files land on one new document ' +
          `of type ${documentType}, and the entry links that document`,
      }),
      'dry-run': Flags.boolean({
        description: 'Show the validated request and send nothing',
        default: false,
      }),
    }

    async run() {
      const { journal, description, date, file = [] } = this.flags
      const dryRun = this.flags['dry-run']
      const reference = this.flags.invoice
      const { path } = resolvePath(this.resolveDivision(), resource)

      const files = file.map(readAttachment)
      if (date) assertDate(date, 'date')
      if (reference && invoice.integer && !INT_RE.test(reference)) {
        throw new CliError(
          `--invoice expects a whole number, received: ${reference}`,
          { exitCode: 64 },
        )
      }
      const body = {
        [party]: this.flags[partyFlag],
        Journal: journal,
        [lines]: this.flags.line.map((text) => parseLine(text, LINE)),
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
      body[lines] = await resolveLines(
        this,
        body[lines],
        'GLAccount',
        GL_ACCOUNTS,
      )

      if (dryRun) {
        const request = describeRequest({ method: 'POST', path, body })
        if (files.length) {
          request.body = { ...body, Document: NEW_DOCUMENT }
          request.attachments = files.map(({ fileName, bytes }) => ({
            fileName,
            size: bytes.length,
          }))
        }
        await this.outputResults(request, {})
        return
      }

      if (files.length) {
        body.Document = await createDocument(this, {
          subject: description || files[0].fileName,
          type: documentType,
          files,
        })
      }
      const record = normalize(unwrap(await this.apiClient.post(path, body)))
      if (files.length) record.document = body.Document
      await this.outputResults(record, autoColumns([record]))
    }
  }
}
