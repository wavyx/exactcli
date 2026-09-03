import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { resolvePath } from '../../lib/catalog.js'
import { autoColumns, normalize, unwrap } from '../../lib/odata.js'
import { resolveRef } from '../../lib/refs.js'
import { renderValue } from '../../lib/typed/factory.js'
import {
  assertWritesAllowed,
  describeRequest,
  validateWrite,
  writeFlags,
} from '../../lib/writes.js'

const RESOURCE = 'crm/Contacts'

/** The text flags and the field each one fills. */
const TEXT_FIELDS = {
  'first-name': 'FirstName',
  'last-name': 'LastName',
  email: 'Email',
  phone: 'BusinessPhone',
  mobile: 'Mobile',
  'job-title': 'JobTitleDescription',
}

/** The true-or-false flags and the field each one fills. */
const BOOL_FIELDS = { main: 'IsMainContact' }

export default class ContactCreateCommand extends BaseCommand {
  static description = `Create a contact, a person of an account (POST ${RESOURCE})`

  static examples = [
    '<%= config.bin %> contact create --account 1001 --first-name Jane --last-name Doe --email jane@acme.example --dry-run',
    '<%= config.bin %> contact create --account 1001 --first-name Jane --last-name Doe --main true --allow-writes',
  ]

  static flags = {
    ...writeFlags,
    account: Flags.string({
      required: true,
      description: 'Account code or GUID (crm/Accounts)',
    }),
    'first-name': Flags.string({ required: true, description: 'First name' }),
    'last-name': Flags.string({ required: true, description: 'Last name' }),
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
    const { flags } = this
    const dryRun = flags['dry-run']
    const { path } = resolvePath(this.resolveDivision(), RESOURCE)

    // The account stays a code or a GUID here: the lookup runs after the gate.
    const body = { Account: flags.account }
    for (const [flag, field] of Object.entries(TEXT_FIELDS)) {
      if (flags[flag] !== undefined) body[field] = flags[flag]
    }
    for (const [flag, field] of Object.entries(BOOL_FIELDS)) {
      if (flags[flag] !== undefined) {
        body[field] = renderValue('bool', flags[flag]) === 'true'
      }
    }
    validateWrite({ resource: RESOURCE, body, method: 'POST' })
    // The gate comes before the reference lookup: a refused write costs no
    // call at all. A dry run needs no permission.
    if (!dryRun) assertWritesAllowed(flags, 'POST')

    body.Account = await resolveRef(this, 'crm/Accounts', flags.account)

    if (dryRun) {
      await this.outputResults(
        describeRequest({ method: 'POST', path, body }),
        {},
      )
      return
    }

    const record = normalize(unwrap(await this.apiClient.post(path, body)))
    await this.outputResults(record, autoColumns([record]))
  }
}
