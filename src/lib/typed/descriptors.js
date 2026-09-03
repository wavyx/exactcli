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

const ENTRY_COLUMNS = (party, partyName) => [
  'EntryID',
  'EntryNumber',
  'EntryDate',
  'InvoiceNumber',
  party,
  partyName,
  'Description',
  'AmountDC',
  'VATAmountDC',
  'Currency',
  'Journal',
  'StatusDescription',
]

/** @type {Record<string, Descriptor>} */
export const descriptors = {
  salesEntry: {
    topic: 'sales-entry',
    resource: 'salesentry/SalesEntries',
    description: 'List sales entries (the accounting ledger of sales)',
    examples: [
      '<%= config.bin %> sales-entry list',
      '<%= config.bin %> sales-entry list --filter "EntryDate ge datetime\'2026-01-01\'" --all',
      '<%= config.bin %> sales-entry list --limit 200 --output json',
    ],
    columns: ENTRY_COLUMNS('Customer', 'CustomerName'),
    orderBy: 'EntryDate desc',
    filters: {},
  },
  purchaseEntry: {
    topic: 'purchase-entry',
    resource: 'purchaseentry/PurchaseEntries',
    description: 'List purchase entries (the accounting ledger of purchases)',
    examples: [
      '<%= config.bin %> purchase-entry list',
      '<%= config.bin %> purchase-entry list --filter "EntryDate ge datetime\'2026-01-01\'" --all',
      '<%= config.bin %> purchase-entry list --limit 200 --output json',
    ],
    columns: ENTRY_COLUMNS('Supplier', 'SupplierName'),
    orderBy: 'EntryDate desc',
    filters: {},
  },
  transactionLine: {
    topic: 'transaction-line',
    resource: 'financialtransaction/TransactionLines',
    description: 'List transaction lines (general ledger detail)',
    examples: [
      '<%= config.bin %> transaction-line list --year 2026 --period 9',
      '<%= config.bin %> transaction-line list --from 2026-01-01 --to 2026-01-31 --gl-account 700000',
      '<%= config.bin %> transaction-line list --account 1001 --all --output csv',
    ],
    columns: [
      'Date',
      'FinancialYear',
      'FinancialPeriod',
      'GLAccountCode',
      'GLAccountDescription',
      'AccountName',
      'Description',
      'AmountDC',
      'VATCode',
      'JournalCode',
      'EntryNumber',
      'ID',
    ],
    orderBy: 'Date desc',
    filters: {
      year: {
        field: 'FinancialYear',
        type: 'int',
        description: 'Financial year',
      },
      period: {
        field: 'FinancialPeriod',
        type: 'int',
        description: 'Financial period',
      },
      from: {
        field: 'Date',
        op: 'ge',
        type: 'date',
        description: 'Date from (YYYY-MM-DD)',
      },
      to: {
        field: 'Date',
        op: 'le',
        type: 'date',
        description: 'Date to (YYYY-MM-DD)',
      },
      'gl-account': {
        field: 'GLAccountCode',
        type: 'string',
        description: 'General ledger account code',
      },
      account: {
        field: 'Account',
        type: 'guid',
        resolve: 'crm/Accounts',
        description: 'Account GUID or code',
      },
      journal: {
        field: 'JournalCode',
        type: 'string',
        description: 'Journal code',
      },
    },
  },
  account: {
    topic: 'account',
    resource: 'crm/Accounts',
    description: 'List accounts (customers and suppliers)',
    examples: [
      '<%= config.bin %> account list --search acme',
      '<%= config.bin %> account list --customer yes --status C --all',
    ],
    columns: [
      'Code',
      'Name',
      'City',
      'Country',
      'VATNumber',
      'Status',
      'IsSupplier',
      'IsSales',
      'ID',
    ],
    orderBy: 'Name asc',
    filters: {
      search: {
        field: 'Name',
        type: 'search',
        description: 'Name contains, or exact Code',
      },
      status: {
        field: 'Status',
        type: 'string',
        description: 'Status code, for example C',
      },
      customer: {
        field: 'IsSales',
        type: 'bool',
        description: 'Customers only (true or false)',
      },
      supplier: {
        field: 'IsSupplier',
        type: 'bool',
        description: 'Suppliers only (true or false)',
      },
    },
  },
  glAccount: {
    topic: 'gl-account',
    resource: 'financial/GLAccounts',
    description: 'List general ledger accounts',
    examples: [
      '<%= config.bin %> gl-account list --all',
      '<%= config.bin %> gl-account list --search bank --type 12',
    ],
    columns: [
      'Code',
      'Description',
      'Type',
      'TypeDescription',
      'BalanceSide',
      'IsBlocked',
      'ID',
    ],
    orderBy: 'Code asc',
    filters: {
      type: { field: 'Type', type: 'int', description: 'Account type code' },
      search: {
        field: 'Description',
        type: 'search',
        description: 'Description contains, or exact Code',
      },
    },
  },
  document: {
    topic: 'document',
    resource: 'documents/Documents',
    description: 'List documents',
    examples: [
      '<%= config.bin %> document list --from 2026-01-01',
      '<%= config.bin %> document list --account 1001 --type 10',
    ],
    columns: [
      'Subject',
      'Type',
      'TypeDescription',
      'AccountName',
      'DocumentDate',
      'Created',
      'ID',
    ],
    orderBy: 'DocumentDate desc',
    filters: {
      account: {
        field: 'Account',
        type: 'guid',
        resolve: 'crm/Accounts',
        description: 'Account GUID or code',
      },
      type: { field: 'Type', type: 'int', description: 'Document type code' },
      from: {
        field: 'DocumentDate',
        op: 'ge',
        type: 'date',
        description: 'Document date from (YYYY-MM-DD)',
      },
      to: {
        field: 'DocumentDate',
        op: 'le',
        type: 'date',
        description: 'Document date to (YYYY-MM-DD)',
      },
    },
  },
}

/**
 * @param {Descriptor} descriptor
 * @returns {Record<string, {header: string}>}
 */
export const columnsOf = (descriptor) =>
  Object.fromEntries(descriptor.columns.map((c) => [c, { header: c }]))
