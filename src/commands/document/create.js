import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { CliError } from '../../lib/errors.js'
import { divisionPath, normalize, unwrap } from '../../lib/odata.js'
import { resolveRef } from '../../lib/refs.js'
import {
  assertWritesAllowed,
  describeRequest,
  validateWrite,
  writeFlags,
} from '../../lib/writes.js'

const DOCUMENTS = 'documents/Documents'
const ATTACHMENTS = 'documents/DocumentAttachments'

const COLUMNS = {
  ID: { header: 'ID' },
  Subject: { header: 'Subject' },
  Type: { header: 'Type' },
  TypeDescription: { header: 'TypeDescription' },
  attachments: {
    header: 'Attachments',
    get: (row) =>
      row.attachments.map((a) => `${a.fileName} (${a.size})`).join(', '),
  },
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

export default class DocumentCreateCommand extends BaseCommand {
  static description = 'Create a document and attach files'

  static examples = [
    '<%= config.bin %> document create --subject "Invoice 2026-001" --type 183 --file invoice.pdf --dry-run',
    '<%= config.bin %> document create --subject "Invoice 2026-001" --type 183 --account 1001 --file invoice.pdf --allow-writes',
  ]

  static flags = {
    ...writeFlags,
    subject: Flags.string({ required: true, description: 'Document subject' }),
    type: Flags.integer({
      required: true,
      description: 'Document type code (183 Attachment, 55 Miscellaneous)',
    }),
    account: Flags.string({ description: 'Account GUID or code' }),
    file: Flags.string({
      multiple: true,
      description: 'File to attach (repeatable)',
    }),
    'dry-run': Flags.boolean({
      description: 'Show the validated request and send nothing',
      default: false,
    }),
  }

  async run() {
    await this.parse(DocumentCreateCommand)
    const { subject, type, account, file = [] } = this.flags
    const dryRun = this.flags['dry-run']
    const division = this.resolveDivision()
    const path = divisionPath(division, DOCUMENTS)
    const attachmentsPath = divisionPath(division, ATTACHMENTS)

    const files = file.map(readAttachment)
    const body = { Subject: subject, Type: type }
    if (account) body.Account = account
    validateWrite({ resource: DOCUMENTS, body, method: 'POST' })
    // The gate comes before the account lookup: a refused write costs no
    // call at all. A dry run needs no permission.
    if (!dryRun) assertWritesAllowed(this.flags, 'POST')
    if (account) body.Account = await resolveRef(this, 'crm/Accounts', account)

    if (dryRun) {
      const attachments = files.map(({ fileName, bytes }) => ({
        fileName,
        size: bytes.length,
      }))
      await this.outputResults(
        { ...describeRequest({ method: 'POST', path, body }), attachments },
        {},
      )
      return
    }

    const doc = normalize(unwrap(await this.apiClient.post(path, body)))
    const attachments = []
    for (const { fileName, bytes } of files) {
      const created = unwrap(
        await this.apiClient.post(attachmentsPath, {
          Document: doc.ID,
          FileName: fileName,
          Attachment: bytes.toString('base64'),
        }),
      )
      attachments.push({ id: created.ID, fileName, size: bytes.length })
    }
    const { ID, Subject, Type, TypeDescription } = doc
    await this.outputResults(
      { ID, Subject, Type, TypeDescription, attachments },
      COLUMNS,
    )
  }
}
