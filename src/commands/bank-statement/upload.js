import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { CliError } from '../../lib/errors.js'
import { divisionPath, unwrap } from '../../lib/odata.js'
import {
  assertWritesAllowed,
  describeRequest,
  validateWrite,
  writeFlags,
} from '../../lib/writes.js'

const DOCUMENTS = 'documents/Documents'
const UPLOADS = 'cashflow/BankStatementUploadAttachments'
/** The document type of a bank statement file. */
const BANK_STATEMENT_FILE = 42

const COLUMNS = {
  document: { header: 'Document' },
  attachment: { header: 'Attachment' },
  fileName: { header: 'FileName' },
  size: { header: 'Size' },
}

export default class BankStatementUploadCommand extends BaseCommand {
  static description =
    'Upload a bank statement file (CODA, MT940, CAMT) to the bank import'

  static examples = [
    '<%= config.bin %> bank-statement upload --file statement.cod --dry-run',
    '<%= config.bin %> bank-statement upload --file statement.cod --subject "September 2026" --allow-writes',
  ]

  static flags = {
    ...writeFlags,
    file: Flags.string({
      required: true,
      description: 'Bank statement file to upload',
    }),
    subject: Flags.string({
      description: 'Document subject. Default: the file name',
    }),
    'dry-run': Flags.boolean({
      description: 'Show the validated request and send nothing',
      default: false,
    }),
  }

  async run() {
    await this.parse(BankStatementUploadCommand)
    const { file, subject } = this.flags
    const dryRun = this.flags['dry-run']
    const division = this.resolveDivision()
    const path = divisionPath(division, DOCUMENTS)
    const uploadsPath = divisionPath(division, UPLOADS)

    // The file is read before the first request: a file that cannot be read
    // must not leave a document behind.
    const fileName = basename(file)
    let bytes
    try {
      bytes = readFileSync(file)
    } catch (cause) {
      throw new CliError(`Cannot read ${file}: ${cause.message}`, {
        exitCode: 65,
        cause,
      })
    }
    const body = { Subject: subject ?? fileName, Type: BANK_STATEMENT_FILE }
    validateWrite({ resource: DOCUMENTS, body, method: 'POST' })
    if (!dryRun) assertWritesAllowed(this.flags, 'POST')

    if (dryRun) {
      await this.outputResults(
        {
          ...describeRequest({ method: 'POST', path, body }),
          fileName,
          size: bytes.length,
        },
        {},
      )
      return
    }

    const doc = unwrap(await this.apiClient.post(path, body))
    const upload = unwrap(
      await this.apiClient.post(uploadsPath, {
        Document: doc.ID,
        FileName: fileName,
        Attachment: bytes.toString('base64'),
      }),
    )
    await this.outputResults(
      { document: doc.ID, attachment: upload.ID, fileName, size: bytes.length },
      COLUMNS,
    )
  }
}
