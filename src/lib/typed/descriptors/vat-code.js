/** @type {import("../descriptors.js").Descriptor} */
const descriptor = {
  topic: 'vat-code',
  resource: 'vat/VATCodes',
  description: 'List VAT codes',
  examples: [
    '<%= config.bin %> vat-code list',
    '<%= config.bin %> vat-code list --type E --blocked no',
  ],
  columns: [
    'Code',
    'Description',
    'Percentage',
    'Type',
    'VATTransactionType',
    'IsBlocked',
    'ID',
  ],
  orderBy: 'Code asc',
  filters: {
    search: {
      field: 'Description',
      type: 'search',
      description: 'Description contains, or exact Code',
    },
    type: {
      field: 'Type',
      type: 'string',
      description:
        'Calculation type: B (base only), E (excluding), I (including), N (no VAT)',
    },
    blocked: {
      field: 'IsBlocked',
      type: 'bool',
      description: 'Blocked codes only (true or false)',
    },
  },
}

export default descriptor
