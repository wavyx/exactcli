/** @type {import("../descriptors.js").Descriptor} */
const descriptor = {
  topic: 'gl-account',
  resource: 'financial/GLAccounts',
  description: 'List general ledger accounts',
  examples: [
    '<%= config.bin %> gl-account list --all',
    '<%= config.bin %> gl-account list --search bank --type 12',
  ],
  columns: [
    'Code',
    'Description',
    'Type',
    'TypeDescription',
    'BalanceSide',
    'IsBlocked',
    'ID',
  ],
  orderBy: 'Code asc',
  filters: {
    type: {
      field: 'Type',
      type: 'int',
      description: 'Account type code',
    },
    search: {
      field: 'Description',
      type: 'search',
      description: 'Description contains, or exact Code',
    },
  },
}

export default descriptor
