/** @type {import("../descriptors.js").Descriptor} */
const descriptor = {
  topic: 'aging-overview',
  resource: 'read/financial/AgingOverview',
  description: 'List open receivables and payables per age group',
  examples: [
    '<%= config.bin %> aging-overview list',
    '<%= config.bin %> aging-overview list --currency EUR --output json',
  ],
  columns: [
    'AgeGroupDescription',
    'AmountReceivable',
    'AmountPayable',
    'CurrencyCode',
    'AgeGroup',
  ],
  orderBy: 'AgeGroup asc',
  filters: {
    'age-group': {
      field: 'AgeGroup',
      type: 'int',
      description: 'Age group number, 1 is the youngest',
    },
    currency: {
      field: 'CurrencyCode',
      type: 'string',
      description: 'Currency code, for example EUR',
    },
  },
}

export default descriptor
