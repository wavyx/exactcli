/** @type {import("../descriptors.js").Descriptor} */
const descriptor = {
  topic: 'cost-unit',
  resource: 'hrm/Costunits',
  description: 'List cost units (the projects or products that costs book to)',
  examples: [
    '<%= config.bin %> cost-unit list',
    '<%= config.bin %> cost-unit list --search project --all',
  ],
  columns: ['Code', 'Description', 'EndDate', 'CustomField', 'ID'],
  orderBy: 'Code asc',
  filters: {
    search: {
      field: 'Description',
      type: 'search',
      description: 'Description contains, or exact Code',
    },
  },
}

export default descriptor
