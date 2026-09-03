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
}

/**
 * @param {Descriptor} descriptor
 * @returns {Record<string, {header: string}>}
 */
export const columnsOf = (descriptor) =>
  Object.fromEntries(descriptor.columns.map((c) => [c, { header: c }]))
