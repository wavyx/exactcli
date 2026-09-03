/** @type {import("../descriptors.js").Descriptor} */
const descriptor = {
  topic: 'quotation',
  resource: 'crm/Quotations',
  description: 'List quotations (the offers sent to prospects and customers)',
  examples: [
    '<%= config.bin %> quotation list --from 2026-01-01 --to 2026-01-31',
    '<%= config.bin %> quotation list --account 1001 --status 25 --all',
  ],
  columns: [
    'QuotationNumber',
    'QuotationDate',
    'OrderAccountName',
    'Description',
    'AmountDC',
    'StatusDescription',
    'CloseDate',
    'QuotationID',
  ],
  orderBy: 'QuotationDate desc',
  filters: {
    account: {
      field: 'OrderAccount',
      type: 'guid',
      resolve: 'crm/Accounts',
      description:
        'Account GUID or code (the account that requested the quotation)',
    },
    from: {
      field: 'QuotationDate',
      op: 'ge',
      type: 'date',
      description: 'Quotation date from (YYYY-MM-DD)',
    },
    to: {
      field: 'QuotationDate',
      op: 'le',
      type: 'date',
      description: 'Quotation date to (YYYY-MM-DD)',
    },
    status: {
      field: 'Status',
      type: 'int',
      description:
        'Status code: 5 rejected, 20 draft, 25 open, 40 printed, 50 accepted',
    },
    search: {
      field: 'Description',
      type: 'search',
      description: 'Description contains',
    },
  },
}

export default descriptor
