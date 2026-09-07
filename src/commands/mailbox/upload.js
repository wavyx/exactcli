import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { CliError } from '../../lib/errors.js'
import { divisionPath, unwrap } from '../../lib/odata.js'
import { GUID_RE } from '../../lib/refs.js'
import {
  assertWritesAllowed,
  describeRequest,
  validateWrite,
  writeFlags,
} from '../../lib/writes.js'

const DEFAULT_MAILBOX = 'read/mailbox/DefaultMailbox'
const MESSAGES = 'mailbox/MailMessagesSent'
const ATTACHMENTS = 'mailbox/MailMessageAttachments'

const COLUMNS = {
  ID: { header: 'ID' },
  RecipientMailboxID: { header: 'RecipientMailboxID' },
  attachments: {
    header: 'Attachments',
    get: (row) =>
      row.attachments.map((a) => `${a.fileName} (${a.size})`).join(', '),
  },
}

/**
 * The bytes of a file to send. Every file is read before the first request:
 * a file that cannot be read must not leave a message behind.
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
 * The mailboxes of the division: the own mailbox sends, the scan service
 * mailbox receives. A division with one mailbox uses it for both.
 * @param {{ apiClient: object }} cmd
 * @param {string} path
 * @returns {Promise<{ sender: string, recipient: string }>}
 */
async function defaultMailboxes(cmd, path) {
  const rows = unwrap(await cmd.apiClient.get(path))
  if (rows.length === 0) {
    throw new CliError('No default mailbox in this division', { exitCode: 65 })
  }
  const isScan = (row) => row.IsScanServiceMailbox === true
  return {
    sender: (rows.find((row) => !isScan(row)) ?? rows[0]).ID,
    recipient: (rows.find(isScan) ?? rows[0]).ID,
  }
}

export default class MailboxUploadCommand extends BaseCommand {
  static description =
    'Send files to the digital postbox or the scan service of the division'

  static examples = [
    '<%= config.bin %> mailbox upload --file invoice.pdf --operation 2 --dry-run',
    '<%= config.bin %> mailbox upload --file invoice.pdf --file receipt.pdf --operation 1 --allow-writes',
    '<%= config.bin %> mailbox upload --file statement.xml --to <mailbox-id> --subject "Bank export" --allow-writes',
  ]

  static flags = {
    ...writeFlags,
    file: Flags.string({
      required: true,
      multiple: true,
      description: 'File to send (repeatable)',
    }),
    to: Flags.string({
      description:
        'Recipient mailbox GUID. Default: the scan service mailbox of the division, else its default mailbox',
    }),
    subject: Flags.string({
      description: 'Message subject. Default: the name of the first file',
    }),
    operation: Flags.integer({
      description:
        'Scan service operation: 1 purchase invoice without details, 2 with details, 3 sales invoice, 4 bank statement',
    }),
    'dry-run': Flags.boolean({
      description: 'Show the validated request and send nothing',
      default: false,
    }),
  }

  async run() {
    await this.parse(MailboxUploadCommand)
    const { file, to, subject, operation } = this.flags
    const dryRun = this.flags['dry-run']
    const division = this.resolveDivision()
    const path = divisionPath(division, MESSAGES)
    const attachmentsPath = divisionPath(division, ATTACHMENTS)

    const files = file.map(readAttachment)
    if (to && !GUID_RE.test(to)) {
      throw new CliError('--to must be a mailbox GUID', { exitCode: 64 })
    }
    // The gate comes before the mailbox lookup: a refused write costs no
    // call at all. A dry run needs no permission.
    if (!dryRun) assertWritesAllowed(this.flags, 'POST')
    // The sender is always the own mailbox of the division. The catalogue
    // marks SenderMailboxID as mandatory, so the lookup runs even with --to.
    const { sender, recipient } = await defaultMailboxes(
      this,
      divisionPath(division, DEFAULT_MAILBOX),
    )
    const body = {
      Subject: subject ?? files[0].fileName,
      SenderMailboxID: sender,
      RecipientMailboxID: to ?? recipient,
    }
    if (operation !== undefined) body.Operation = operation
    validateWrite({ resource: MESSAGES, body, method: 'POST' })

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

    const message = unwrap(await this.apiClient.post(path, body))
    const attachments = []
    for (const { fileName, bytes } of files) {
      const created = unwrap(
        await this.apiClient.post(attachmentsPath, {
          MailMessageID: message.ID,
          AttachmentFileName: fileName,
          Attachment: bytes.toString('base64'),
        }),
      )
      attachments.push({ id: created.ID, fileName, size: bytes.length })
    }
    await this.outputResults(
      {
        ID: message.ID,
        RecipientMailboxID: body.RecipientMailboxID,
        attachments,
      },
      COLUMNS,
    )
  }
}
