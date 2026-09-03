/** @type {import("../descriptors.js").Descriptor} */
const descriptor = {
  topic: 'payment-condition',
  resource: 'cashflow/PaymentConditions',
  description: 'List payment conditions',
  examples: [
    '<%= config.bin %> payment-condition list',
    '<%= config.bin %> payment-condition list --method B --days 30',
  ],
  columns: [
    'Code',
    'Description',
    'PaymentDays',
    'PaymentEndOfMonths',
    'DiscountPercentage',
    'DiscountPaymentDays',
    'PaymentMethod',
    'ID',
  ],
  orderBy: 'Code asc',
  filters: {
    search: {
      field: 'Description',
      type: 'search',
      description: 'Description contains, or exact Code',
    },
    method: {
      field: 'PaymentMethod',
      type: 'string',
      description: 'Payment method: B on credit, I collection, K cash, Q PSP',
    },
    days: {
      field: 'PaymentDays',
      type: 'int',
      description: 'Payment days',
    },
  },
}

export default descriptor
