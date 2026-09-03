/** @type {import("../descriptors.js").Descriptor} */
const descriptor = {
  topic: 'document-type',
  resource: 'documents/DocumentTypes',
  description: 'List document types (the Type codes of documents)',
  examples: [
    '<%= config.bin %> document-type list --creatable yes',
    '<%= config.bin %> document-type list --search invoice --output json',
  ],
  columns: [
    'Description',
    'DocumentIsCreatable',
    'DocumentIsDeletable',
    'DocumentIsUpdatable',
    'DocumentIsViewable',
    'TypeCategory',
    'ID',
  ],
  orderBy: 'ID asc',
  filters: {
    search: {
      field: 'Description',
      type: 'search',
      description: 'Description contains',
    },
    creatable: {
      field: 'DocumentIsCreatable',
      type: 'bool',
      description:
        'Types a POST on documents/Documents accepts (true or false)',
    },
    category: {
      field: 'TypeCategory',
      type: 'int',
      description: 'Document type category ID',
    },
  },
}

export default descriptor
