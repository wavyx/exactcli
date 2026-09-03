/**
 * @typedef {object} TypedFilter
 * @property {string} field property the flag filters on
 * @property {'int'|'string'|'date'|'guid'|'bool'|'search'} type value rendering
 * @property {'eq'|'ne'|'ge'|'le'|'gt'|'lt'} [op] comparison, `eq` by default
 * @property {string} [resolve] resource whose Code resolves to the GUID
 * @property {string} [description] flag help
 */

/**
 * @typedef {object} Descriptor
 * @property {string} topic command topic, the `list` subcommand hangs under it
 * @property {string} resource `service/Resource`
 * @property {string} description
 * @property {string[]} [examples]
 * @property {string[]} columns default `$select` and table columns, in order
 * @property {string} orderBy default `$orderby`
 * @property {Record<string, TypedFilter>} filters one flag per entry
 */

import salesEntry from './descriptors/sales-entry.js'
import purchaseEntry from './descriptors/purchase-entry.js'
import transactionLine from './descriptors/transaction-line.js'
import account from './descriptors/account.js'
import glAccount from './descriptors/gl-account.js'
import document from './descriptors/document.js'
import journal from './descriptors/journal.js'
import vatCode from './descriptors/vat-code.js'
import item from './descriptors/item.js'
import contact from './descriptors/contact.js'
import salesInvoice from './descriptors/sales-invoice.js'
import purchaseInvoice from './descriptors/purchase-invoice.js'
import bankEntry from './descriptors/bank-entry.js'
import journalEntry from './descriptors/journal-entry.js'
import receivable from './descriptors/receivable.js'
import paymentCondition from './descriptors/payment-condition.js'
import documentType from './descriptors/document-type.js'
import salesOrder from './descriptors/sales-order.js'
import quotation from './descriptors/quotation.js'
import webhook from './descriptors/webhook.js'
import currency from './descriptors/currency.js'
import exchangeRate from './descriptors/exchange-rate.js'
import payment from './descriptors/payment.js'
import bankAccount from './descriptors/bank-account.js'
import address from './descriptors/address.js'
import balance from './descriptors/balance.js'
import financialPeriod from './descriptors/financial-period.js'
import glClassification from './descriptors/gl-classification.js'
import agingReceivable from './descriptors/aging-receivable.js'
import agingPayable from './descriptors/aging-payable.js'
import profitLoss from './descriptors/profit-loss.js'

/**
 * One file per descriptor under ./descriptors/: a new typed command adds a
 * file there and one line here.
 * @type {Record<string, Descriptor>}
 */
export const descriptors = {
  salesEntry,
  purchaseEntry,
  transactionLine,
  account,
  glAccount,
  document,
  journal,
  vatCode,
  item,
  contact,
  salesInvoice,
  purchaseInvoice,
  bankEntry,
  journalEntry,
  receivable,
  paymentCondition,
  documentType,
  salesOrder,
  quotation,
  webhook,
  currency,
  exchangeRate,
  payment,
  bankAccount,
  address,
  balance,
  financialPeriod,
  glClassification,
  agingReceivable,
  agingPayable,
  profitLoss,
}

/**
 * @param {Descriptor} descriptor
 * @returns {Record<string, {header: string}>}
 */
export const columnsOf = (descriptor) =>
  Object.fromEntries(descriptor.columns.map((c) => [c, { header: c }]))
