/** @type {import("../descriptors.js").Descriptor} */
const descriptor = {
  topic: 'address',
  resource: 'crm/Addresses',
  description: 'List addresses of customers and suppliers',
  examples: [
    '<%= config.bin %> address list --account 1001',
    '<%= config.bin %> address list --type 3 --city Brussels --main yes --all',
  ],
  columns: [
    'AccountName',
    'Type',
    'AddressLine1',
    'Postcode',
    'City',
    'Country',
    'Main',
    'ID',
  ],
  orderBy: 'AccountName asc',
  filters: {
    account: {
      field: 'Account',
      type: 'guid',
      resolve: 'crm/Accounts',
      description: 'Account GUID or code',
    },
    type: {
      field: 'Type',
      type: 'int',
      description: 'Address type: 1 visit, 2 postal, 3 invoice, 4 delivery',
    },
    city: {
      field: 'City',
      type: 'string',
      description: 'City (exact match)',
    },
    main: {
      field: 'Main',
      type: 'bool',
      description: 'Main address of its type only (true or false)',
    },
  },
}

export default descriptor
