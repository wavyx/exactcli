/** @type {import("../descriptors.js").Descriptor} */
const descriptor = {
  topic: 'bank-account',
  resource: 'crm/BankAccounts',
  description: 'List bank accounts of customers and suppliers',
  examples: [
    '<%= config.bin %> bank-account list --account 1001',
    '<%= config.bin %> bank-account list --main yes --all --output csv',
  ],
  columns: [
    'BankAccount',
    'IBAN',
    'BICCode',
    'BankName',
    'AccountName',
    'Main',
    'Type',
    'ID',
  ],
  orderBy: 'BankAccount asc',
  filters: {
    account: {
      field: 'Account',
      type: 'guid',
      resolve: 'crm/Accounts',
      description: 'Account GUID or code',
    },
    main: {
      field: 'Main',
      type: 'bool',
      description: 'Main bank account only (true or false)',
    },
    search: {
      field: 'BankAccount',
      type: 'search',
      description: 'Bank account number contains',
    },
  },
}

export default descriptor
