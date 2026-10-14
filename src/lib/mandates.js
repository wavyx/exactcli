import { CliError } from './errors.js'
import { divisionPath, unwrap } from './odata.js'
import { quote } from './refs.js'

/** The resource of direct debit mandates and how its commands name it. */
export const mandateSpec = {
  topic: 'mandate',
  resource: 'cashflow/DirectDebitMandates',
  singular: 'a direct debit mandate',
  plural: 'direct debit mandates',
}

/** Mandate Type: the bank file Exact generates. */
export const MANDATE_TYPES = { core: 0, b2b: 1 }

/** Mandate PaymentType: one collection or a series. */
export const PAYMENT_TYPES = { 'one-off': 0, recurrent: 1 }

/** An IBAN without spaces: two letters, two check digits, up to 30 more. */
const IBAN_RE = /^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/

/**
 * An IBAN as Exact stores it: upper case, no spaces. It lands in a filter,
 * so anything else is refused.
 * @param {string} value
 * @returns {string}
 */
export function normalizeIban(value) {
  const iban = value.replace(/\s+/g, '').toUpperCase()
  if (!IBAN_RE.test(iban)) {
    throw new CliError(`Expected an IBAN, received ${value}`, { exitCode: 64 })
  }
  return iban
}

/**
 * The GUID of the bank account that carries an IBAN on one account.
 * @param {{ apiClient: object, resolveDivision: () => number }} cmd
 * @param {string} account account GUID
 * @param {string} iban normalized
 * @param {string} label how the user named the account
 * @returns {Promise<string>}
 */
export async function bankAccountOf(cmd, account, iban, label) {
  const path = divisionPath(cmd.resolveDivision(), 'crm/BankAccounts')
  const rows = unwrap(
    await cmd.apiClient.get(path, {
      query: {
        $filter: `Account eq guid'${account}' and IBAN eq ${quote(iban)}`,
        $select: 'ID,IBAN',
      },
    }),
  )
  if (rows.length === 0) {
    throw new CliError(
      `Account ${label} has no bank account with IBAN ${iban}: create it first (bank-account list shows the others)`,
      { exitCode: 65 },
    )
  }
  if (rows.length > 1) {
    throw new CliError(
      `Account ${label} has ${rows.length} bank accounts with IBAN ${iban}: pass --bank-account with the GUID of one`,
      { exitCode: 65 },
    )
  }
  return rows[0].ID
}
