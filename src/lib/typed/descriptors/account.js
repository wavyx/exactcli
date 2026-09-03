/** @type {import("../descriptors.js").Descriptor} */
const descriptor = {
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
}

export default descriptor
