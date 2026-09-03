/** @type {import("../descriptors.js").Descriptor} */
const descriptor = {
  topic: 'document',
  resource: 'documents/Documents',
  description: 'List documents',
  examples: [
    '<%= config.bin %> document list --from 2026-01-01',
    '<%= config.bin %> document list --account 1001 --type 10',
  ],
  columns: [
    'Subject',
    'Type',
    'TypeDescription',
    'AccountName',
    'DocumentDate',
    'Created',
    'ID',
  ],
  orderBy: 'DocumentDate desc',
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
      description: 'Document type code',
    },
    from: {
      field: 'DocumentDate',
      op: 'ge',
      type: 'date',
      description: 'Document date from (YYYY-MM-DD)',
    },
    to: {
      field: 'DocumentDate',
      op: 'le',
      type: 'date',
      description: 'Document date to (YYYY-MM-DD)',
    },
  },
}

export default descriptor
