/** @type {import("../descriptors.js").Descriptor} */
const descriptor = {
  topic: 'cost-center',
  resource: 'hrm/Costcenters',
  description: 'List cost centers (the departments that costs book to)',
  examples: [
    '<%= config.bin %> cost-center list',
    '<%= config.bin %> cost-center list --search sales --active true',
  ],
  columns: ['Code', 'Description', 'Active', 'EndDate', 'CustomField', 'ID'],
  orderBy: 'Code asc',
  filters: {
    search: {
      field: 'Description',
      type: 'search',
      description: 'Description contains, or exact Code',
    },
    active: {
      field: 'Active',
      type: 'bool',
      description: 'Active cost centers only (true or false)',
    },
  },
}

export default descriptor
