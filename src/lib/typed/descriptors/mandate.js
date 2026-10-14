/** @type {import("../descriptors.js").Descriptor} */
const descriptor = {
  topic: 'mandate',
  resource: 'cashflow/DirectDebitMandates',
  description: 'List direct debit mandates (SEPA Core and B2B) of customers',
  examples: [
    '<%= config.bin %> mandate list --account 1001',
    '<%= config.bin %> mandate list --type 1 --output json',
  ],
  columns: [
    'Reference',
    'Description',
    'Account',
    'BankAccount',
    'Type',
    'PaymentType',
    'SignatureDate',
    'CancellationDate',
    'Main',
    'FirstSend',
    'ID',
  ],
  orderBy: 'Reference asc',
  filters: {
    account: {
      field: 'Account',
      type: 'guid',
      resolve: 'crm/Accounts',
      description: 'Account GUID or code',
    },
    reference: {
      field: 'Reference',
      type: 'string',
      description: 'Mandate reference',
    },
    type: {
      field: 'Type',
      type: 'int',
      description: 'Type: 0 Core, 1 B2B',
    },
    search: {
      field: 'Description',
      type: 'search',
      description: 'Description contains',
    },
  },
}

export default descriptor
