/** @type {import("../descriptors.js").Descriptor} */
const descriptor = {
  topic: 'aging-receivable',
  resource: 'read/financial/AgingReceivablesList',
  description: 'List aged receivables per customer (open amounts by age group)',
  examples: [
    '<%= config.bin %> aging-receivable list --search acme',
    '<%= config.bin %> aging-receivable list --account 1001 --output json',
  ],
  columns: [
    'AccountCode',
    'AccountName',
    'TotalAmount',
    'AgeGroup1Amount',
    'AgeGroup2Amount',
    'AgeGroup3Amount',
    'AgeGroup4Amount',
    'CurrencyCode',
    'AccountId',
  ],
  orderBy: 'TotalAmount desc',
  filters: {
    search: {
      field: 'AccountName',
      type: 'search',
      description: 'Account name contains (a code goes to --account)',
    },
    account: {
      field: 'AccountId',
      type: 'guid',
      resolve: 'crm/Accounts',
      description: 'Account GUID or code',
    },
  },
}

export default descriptor
