import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { CliError } from '../../lib/errors.js'
import { assertDate } from '../../lib/lines.js'
import {
  bankAccountOf,
  MANDATE_TYPES,
  mandateSpec,
  normalizeIban,
  PAYMENT_TYPES,
} from '../../lib/mandates.js'
import {
  autoColumns,
  divisionPath,
  normalize,
  unwrap,
} from '../../lib/odata.js'
import { GUID_RE, resolveRef } from '../../lib/refs.js'
import {
  assertWritesAllowed,
  describeRequest,
  validateWrite,
  writeFlags,
} from '../../lib/writes.js'

const { resource: RESOURCE } = mandateSpec

export default class MandateCreateCommand extends BaseCommand {
  static description = `Create a direct debit mandate for an account and one of its bank accounts (POST ${RESOURCE})`

  static examples = [
    '<%= config.bin %> mandate create --account 1001 --iban BE68539007547034 --reference ACME-001 --type b2b --signature-date 2026-10-01 --dry-run',
    '<%= config.bin %> mandate create --account 1001 --bank-account <guid> --reference ACME-001 --allow-writes',
  ]

  static flags = {
    ...writeFlags,
    account: Flags.string({
      required: true,
      description: 'Account code or GUID (the debtor)',
    }),
    iban: Flags.string({
      description: 'IBAN of a bank account of the account',
      exclusive: ['bank-account'],
    }),
    'bank-account': Flags.string({
      description: 'Bank account GUID (crm/BankAccounts), instead of --iban',
    }),
    reference: Flags.string({
      required: true,
      description: 'Mandate reference (unique per mandate)',
    }),
    type: Flags.string({
      options: Object.keys(MANDATE_TYPES),
      default: 'core',
      description: 'SEPA scheme',
    }),
    'payment-type': Flags.string({
      options: Object.keys(PAYMENT_TYPES),
      default: 'recurrent',
      description: 'One collection or a series',
    }),
    'signature-date': Flags.string({
      description: 'Date the debtor signed (YYYY-MM-DD)',
    }),
    description: Flags.string({ description: 'Description' }),
    main: Flags.boolean({
      description: 'Make it the main mandate of the account',
      default: false,
    }),
    'dry-run': Flags.boolean({
      description: 'Show the validated request and send nothing',
      default: false,
    }),
  }

  async run() {
    const { flags } = this
    const dryRun = flags['dry-run']
    const bankFlag = flags['bank-account']
    if (!bankFlag && !flags.iban) {
      throw new CliError('Give --iban or --bank-account', { exitCode: 64 })
    }
    if (bankFlag && !GUID_RE.test(bankFlag)) {
      throw new CliError(
        `--bank-account expects a GUID, received ${bankFlag}`,
        {
          exitCode: 64,
        },
      )
    }
    const iban = flags.iban && normalizeIban(flags.iban)
    if (flags['signature-date']) {
      assertDate(flags['signature-date'], 'signature-date')
    }
    // A refused write costs no call at all. A dry run needs no permission.
    if (!dryRun) assertWritesAllowed(flags, 'POST')

    const account = await resolveRef(this, 'crm/Accounts', flags.account)
    const bankAccount =
      bankFlag ?? (await bankAccountOf(this, account, iban, flags.account))
    const body = {
      Account: account,
      BankAccount: bankAccount,
      Reference: flags.reference,
      Type: MANDATE_TYPES[flags.type],
      PaymentType: PAYMENT_TYPES[flags['payment-type']],
    }
    if (flags['signature-date']) body.SignatureDate = flags['signature-date']
    if (flags.description) body.Description = flags.description
    if (flags.main) body.Main = 1
    validateWrite({ resource: RESOURCE, body, method: 'POST' })

    const path = divisionPath(this.resolveDivision(), RESOURCE)
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
