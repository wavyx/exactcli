import { Args, Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { resolvePath } from '../../lib/catalog.js'
import { CliError } from '../../lib/errors.js'
import { assertDate } from '../../lib/lines.js'
import { renderKey } from '../../lib/refs.js'
import {
  assertWritesAllowed,
  describeRequest,
  validateWrite,
  writeFlags,
} from '../../lib/writes.js'

const RESOURCE = 'crm/Quotations'

/** The text flags and the field each one fills. */
const TEXT_FIELDS = { description: 'Description', reference: 'YourRef' }

/** The date flags (YYYY-MM-DD) and the field each one fills. */
const DATE_FIELDS = { date: 'QuotationDate', 'close-date': 'CloseDate' }

export default class QuotationUpdateCommand extends BaseCommand {
  static description = `Update the header fields of a quotation (PUT ${RESOURCE}). Lines stay as they are`

  static examples = [
    '<%= config.bin %> quotation update <id> --close-date 2026-09-30 --dry-run',
    '<%= config.bin %> quotation update <id> --description "Spring offer" --reference PO-42 --allow-writes',
  ]

  static args = {
    id: Args.string({
      required: true,
      description: 'Quotation ID (a GUID, QuotationID)',
    }),
  }

  static flags = {
    ...writeFlags,
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
    const { args } = await this.parse(QuotationUpdateCommand)
    const { flags } = this
    const { path: basePath, resource } = resolvePath(
      this.resolveDivision(),
      RESOURCE,
    )
    const path = `${basePath}${renderKey(resource, RESOURCE, args.id)}`

    const body = {}
    for (const [flag, field] of Object.entries(TEXT_FIELDS)) {
      if (flags[flag] !== undefined) body[field] = flags[flag]
    }
    for (const [flag, field] of Object.entries(DATE_FIELDS)) {
      if (flags[flag] !== undefined) {
        assertDate(flags[flag], flag)
        body[field] = flags[flag]
      }
    }
    const fields = Object.keys(body)
    if (fields.length === 0) {
      throw new CliError('Nothing to update: give at least one field flag', {
        exitCode: 64,
      })
    }
    validateWrite({ resource: RESOURCE, body, method: 'PUT' })

    if (flags['dry-run']) {
      await this.outputResults(
        describeRequest({ method: 'PUT', path, body }),
        {},
      )
      return
    }

    assertWritesAllowed(flags, 'PUT')
    await this.apiClient.put(path, body)
    await this.outputAction(
      { ok: true, path, key: args.id, fields },
      `Updated ${RESOURCE} ${args.id}: ${fields.join(', ')}`,
    )
  }
}
