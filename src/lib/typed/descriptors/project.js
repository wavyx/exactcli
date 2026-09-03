/** @type {import("../descriptors.js").Descriptor} */
const descriptor = {
  topic: 'project',
  resource: 'project/Projects',
  description: 'List projects (time and cost projects with their account)',
  examples: [
    '<%= config.bin %> project list --account 1001 --search website',
    '<%= config.bin %> project list --type 1 --from 2026-01-01 --all --output csv',
  ],
  columns: [
    'Code',
    'Description',
    'AccountName',
    'Type',
    'StartDate',
    'EndDate',
    'BudgetedAmount',
    'ID',
  ],
  orderBy: 'Code asc',
  filters: {
    account: {
      field: 'Account',
      type: 'guid',
      resolve: 'crm/Accounts',
      description: 'Account GUID or code (the customer of the project)',
    },
    search: {
      field: 'Description',
      type: 'search',
      description: 'Description contains, or exact Code',
    },
    type: {
      field: 'Type',
      type: 'int',
      description: 'Project type code',
    },
    from: {
      field: 'StartDate',
      op: 'ge',
      type: 'date',
      description: 'Start date from (YYYY-MM-DD)',
    },
    to: {
      field: 'StartDate',
      op: 'le',
      type: 'date',
      description: 'Start date to (YYYY-MM-DD)',
    },
  },
}

export default descriptor
