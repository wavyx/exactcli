import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { Args, Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { CliError } from '../../lib/errors.js'
import { divisionPath } from '../../lib/odata.js'
import { collectPages } from '../../lib/pagination.js'
import { GUID_RE } from '../../lib/refs.js'

const COLUMNS = {
  fileName: { header: 'FileName' },
  size: { header: 'Size' },
  path: { header: 'Path' },
}

export default class DocumentDownloadCommand extends BaseCommand {
  static description = 'Download the attachments of a document'

  static examples = [
    '<%= config.bin %> document download <id>',
    '<%= config.bin %> document download <id> --out ./attachments --force',
  ]

  static args = {
    id: Args.string({ required: true, description: 'Document GUID' }),
  }

  static flags = {
    out: Flags.string({ description: 'Target directory', default: '.' }),
    force: Flags.boolean({
      description: 'Overwrite files that exist',
      default: false,
    }),
  }

  async run() {
    const { args } = await this.parse(DocumentDownloadCommand)
    if (!GUID_RE.test(args.id)) {
      throw new CliError('Document id must be a GUID', { exitCode: 64 })
    }
    const { out, force } = this.flags

    const path = divisionPath(
      this.resolveDivision(),
      'documents/DocumentAttachments',
    )
    const rows = await collectPages(
      this.apiClient.pageOData(path, {
        $filter: `Document eq guid'${args.id}'`,
        $select: 'ID,FileName,FileSize,Attachment,Url',
      }),
    )
    if (rows.length === 0) {
      throw new CliError(`No attachment on document ${args.id}`, {
        exitCode: 65,
      })
    }

    // basename keeps a hostile FileName inside --out. Check every target
    // before the first write: a refusal must leave the directory as it was.
    const targets = rows.map((row) => ({
      row,
      fileName: basename(row.FileName),
      target: join(out, basename(row.FileName)),
    }))
    const clash = force ? undefined : targets.find((t) => existsSync(t.target))
    if (clash) {
      throw new CliError(`${clash.target} exists. Add --force`, {
        exitCode: 65,
      })
    }

    mkdirSync(out, { recursive: true })
    const results = []
    for (const { row, fileName, target } of targets) {
      const bytes = await this.bytesOf(row)
      writeFileSync(target, bytes)
      results.push({ fileName, size: bytes.length, path: target })
    }
    await this.outputResults(results, COLUMNS)
  }

  /**
   * The content of an attachment. A GET on DocumentAttachments answers
   * `Attachment: null` and a `Url` (verified live); the bytes come from that
   * URL with the bearer token and `Download=1`, which skips the HTML viewer.
   * @param {{ Attachment?: string | null, Url?: string | null }} row
   * @returns {Promise<Buffer>}
   */
  async bytesOf(row) {
    if (row.Attachment) return Buffer.from(row.Attachment, 'base64')
    if (!row.Url) return Buffer.alloc(0)
    const { bytes } = await this.apiClient.download(`${row.Url}&Download=1`)
    return bytes
  }
}
