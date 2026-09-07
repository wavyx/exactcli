import { Args, Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { resolvePath } from '../../lib/catalog.js'
import { CliError } from '../../lib/errors.js'
import { renderKey, resolveRef } from '../../lib/refs.js'
import { renderValue } from '../../lib/typed/factory.js'
import {
  assertWritesAllowed,
  describeRequest,
  validateWrite,
  writeFlags,
} from '../../lib/writes.js'
import { BOOL_FIELDS, TEXT_FIELDS } from './create.js'

const RESOURCE = 'crm/Accounts'
const COUNTRY_RE = /^[A-Za-z]{2}$/

export default class AccountUpdateCommand extends BaseCommand {
  static description = `Update the given fields of an account (PUT ${RESOURCE})`

  static examples = [
    '<%= config.bin %> account update 1001 --name "Acme NV" --city Ghent --dry-run',
    '<%= config.bin %> account update <id> --status C --customer true --allow-writes',
  ]

  static args = {
    id: Args.string({
      required: true,
      description: 'Account GUID or code',
    }),
  }

  static flags = {
    ...writeFlags,
    name: Flags.string({ description: 'Account name' }),
    code: Flags.string({
      description: 'Account code (numeric in Belgium; Exact pads it)',
    }),
    customer: Flags.string({
      description: 'Customer: true, false, yes, no, 1 or 0 (IsSales)',
    }),
    supplier: Flags.string({
      description: 'Supplier: true, false, yes, no, 1 or 0 (IsSupplier)',
    }),
    'vat-number': Flags.string({
      description: 'VAT number, for example BE0123456789',
    }),
    email: Flags.string({ description: 'E-mail address' }),
    phone: Flags.string({ description: 'Phone number' }),
    website: Flags.string({ description: 'Website' }),
    address: Flags.string({ description: 'Visit address, first line' }),
    postcode: Flags.string({ description: 'Visit address postcode' }),
    city: Flags.string({ description: 'Visit address city' }),
    country: Flags.string({
      description: 'Country code, 2 letters, for example BE',
    }),
    status: Flags.string({
      description: 'Customer status: A none, S suspect, P prospect, C customer',
    }),
    'dry-run': Flags.boolean({
      description: 'Show the validated request and send nothing',
      default: false,
    }),
  }

  async run() {
    const { args } = await this.parse(AccountUpdateCommand)
    const { flags } = this
    const dryRun = flags['dry-run']
    const { path: basePath, resource } = resolvePath(
      this.resolveDivision(),
      RESOURCE,
    )

    const body = {}
    for (const [flag, field] of Object.entries(TEXT_FIELDS)) {
      if (flags[flag] !== undefined) body[field] = flags[flag]
    }
    for (const [flag, field] of Object.entries(BOOL_FIELDS)) {
      if (flags[flag] !== undefined) {
        body[field] = renderValue('bool', flags[flag]) === 'true'
      }
    }
    if (body.Country !== undefined) {
      if (!COUNTRY_RE.test(body.Country)) {
        throw new CliError(
          `--country expects 2 letters, received: ${body.Country}`,
          { exitCode: 64 },
        )
      }
      body.Country = body.Country.toUpperCase()
    }
    const fields = Object.keys(body)
    if (fields.length === 0) {
      throw new CliError('Nothing to update: give at least one field flag', {
        exitCode: 64,
      })
    }
    validateWrite({ resource: RESOURCE, body, method: 'PUT' })
    // The gate comes before the key lookup: a refused write costs no call
    // at all. A dry run needs no permission.
    if (!dryRun) assertWritesAllowed(flags, 'PUT')

    const id = await resolveRef(this, RESOURCE, args.id)
    const path = `${basePath}${renderKey(resource, RESOURCE, id)}`

    if (dryRun) {
      await this.outputResults(
        describeRequest({ method: 'PUT', path, body }),
        {},
      )
      return
    }

    await this.apiClient.put(path, body)
    await this.outputAction(
      { ok: true, path, key: id, fields },
      `Updated ${RESOURCE} ${args.id}: ${fields.join(', ')}`,
    )
  }
}
