import { Args, Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { resolvePath } from '../../lib/catalog.js'
import { CliError } from '../../lib/errors.js'
import { renderKey } from '../../lib/refs.js'
import { renderValue } from '../../lib/typed/factory.js'
import {
  assertWritesAllowed,
  describeRequest,
  validateWrite,
  writeFlags,
} from '../../lib/writes.js'
import { BOOL_FIELDS, TEXT_FIELDS } from './create.js'

const RESOURCE = 'crm/Contacts'

export default class ContactUpdateCommand extends BaseCommand {
  static description = `Update the given fields of a contact (PUT ${RESOURCE})`

  static examples = [
    '<%= config.bin %> contact update <id> --email jane@acme.example --dry-run',
    '<%= config.bin %> contact update <id> --job-title CFO --main true --allow-writes',
  ]

  static args = {
    id: Args.string({
      required: true,
      description: 'Contact ID (a GUID; a contact has no code)',
    }),
  }

  static flags = {
    ...writeFlags,
    'first-name': Flags.string({ description: 'First name' }),
    'last-name': Flags.string({ description: 'Last name' }),
    email: Flags.string({ description: 'E-mail address' }),
    phone: Flags.string({ description: 'Business phone number' }),
    mobile: Flags.string({ description: 'Mobile phone number' }),
    'job-title': Flags.string({
      description: 'Job title (JobTitleDescription)',
    }),
    main: Flags.string({
      description:
        'Main contact of the account: true, false, yes, no, 1 or 0 (IsMainContact)',
    }),
    'dry-run': Flags.boolean({
      description: 'Show the validated request and send nothing',
      default: false,
    }),
  }

  async run() {
    const { args } = await this.parse(ContactUpdateCommand)
    const { flags } = this
    const dryRun = flags['dry-run']
    const { path: basePath, resource } = resolvePath(
      this.resolveDivision(),
      RESOURCE,
    )
    const path = `${basePath}${renderKey(resource, RESOURCE, args.id)}`

    const body = {}
    for (const [flag, field] of Object.entries(TEXT_FIELDS)) {
      if (flags[flag] !== undefined) body[field] = flags[flag]
    }
    for (const [flag, field] of Object.entries(BOOL_FIELDS)) {
      if (flags[flag] !== undefined) {
        body[field] = renderValue('bool', flags[flag]) === 'true'
      }
    }
    const fields = Object.keys(body)
    if (fields.length === 0) {
      throw new CliError('Nothing to update: give at least one field flag', {
        exitCode: 64,
      })
    }
    validateWrite({ resource: RESOURCE, body, method: 'PUT' })

    if (dryRun) {
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
