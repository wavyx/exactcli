import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { resolvePath } from '../../lib/catalog.js'
import { CliError } from '../../lib/errors.js'
import { autoColumns, normalize, unwrap } from '../../lib/odata.js'
import { renderValue } from '../../lib/typed/factory.js'
import {
  assertWritesAllowed,
  describeRequest,
  validateWrite,
  writeFlags,
} from '../../lib/writes.js'

const RESOURCE = 'crm/Accounts'
const COUNTRY_RE = /^[A-Za-z]{2}$/

/** The text flags and the field each one fills. */
export const TEXT_FIELDS = {
  name: 'Name',
  code: 'Code',
  'vat-number': 'VATNumber',
  email: 'Email',
  phone: 'Phone',
  website: 'Website',
  address: 'AddressLine1',
  postcode: 'Postcode',
  city: 'City',
  country: 'Country',
  status: 'Status',
}

/** The true-or-false flags and the field each one fills. */
export const BOOL_FIELDS = { customer: 'IsSales', supplier: 'IsSupplier' }

export default class AccountCreateCommand extends BaseCommand {
  static description = `Create an account, customer or supplier (POST ${RESOURCE})`

  static examples = [
    '<%= config.bin %> account create --name Acme --customer true --status C --dry-run',
    '<%= config.bin %> account create --name Acme --code 1001 --customer true --status C --country BE --allow-writes',
  ]

  static flags = {
    ...writeFlags,
    name: Flags.string({ required: true, description: 'Account name' }),
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
    const { flags } = this
    const { path } = resolvePath(this.resolveDivision(), RESOURCE)

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
    validateWrite({ resource: RESOURCE, body, method: 'POST' })

    if (flags['dry-run']) {
      await this.outputResults(
        describeRequest({ method: 'POST', path, body }),
        {},
      )
      return
    }

    assertWritesAllowed(flags, 'POST')
    const record = normalize(unwrap(await this.apiClient.post(path, body)))
    await this.outputResults(record, autoColumns([record]))
  }
}
