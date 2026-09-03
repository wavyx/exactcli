/** @type {import("../descriptors.js").Descriptor} */
const descriptor = {
  topic: 'gl-classification',
  resource: 'financial/GLClassifications',
  description: 'List ledger classifications (the reporting scheme elements)',
  examples: [
    '<%= config.bin %> gl-classification list --search turnover',
    '<%= config.bin %> gl-classification list --parent <guid> --all',
  ],
  columns: [
    'Code',
    'Description',
    'Name',
    'Balance',
    'PeriodType',
    'Abstract',
    'Parent',
    'TaxonomyNamespaceDescription',
    'ID',
  ],
  orderBy: 'Code asc',
  filters: {
    search: {
      field: 'Description',
      type: 'search',
      description: 'Description contains, or exact Code',
    },
    parent: {
      field: 'Parent',
      type: 'guid',
      description: 'Parent element GUID',
    },
    namespace: {
      field: 'TaxonomyNamespace',
      type: 'guid',
      description: 'Taxonomy namespace GUID (the reporting scheme)',
    },
    abstract: {
      field: 'Abstract',
      type: 'bool',
      description: 'Group elements only (true or false)',
    },
  },
}

export default descriptor
