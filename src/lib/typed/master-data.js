/**
 * The master data whose records a code names: create takes --code and
 * --description, update and delete take a GUID or a code.
 * @type {Record<string, import('./record-write.js').RecordSpec & { methods: string[] }>}
 */
export const masterData = {
  glAccount: {
    topic: 'gl-account',
    resource: 'financial/GLAccounts',
    singular: 'a ledger account',
    plural: 'ledger accounts',
    methods: ['create', 'update', 'delete'],
  },
  journal: {
    topic: 'journal',
    resource: 'financial/Journals',
    singular: 'a journal',
    plural: 'journals',
    methods: ['create', 'update', 'delete'],
  },
  vatCode: {
    topic: 'vat-code',
    resource: 'vat/VATCodes',
    singular: 'a VAT code',
    plural: 'VAT codes',
    methods: ['create', 'update', 'delete'],
  },
  paymentCondition: {
    topic: 'payment-condition',
    resource: 'cashflow/PaymentConditions',
    singular: 'a payment condition',
    plural: 'payment conditions',
    // Exact offers no PUT and no DELETE on payment conditions.
    methods: ['create'],
  },
  costCenter: {
    topic: 'cost-center',
    resource: 'hrm/Costcenters',
    singular: 'a cost center',
    plural: 'cost centers',
    methods: ['create', 'update', 'delete'],
  },
  costUnit: {
    topic: 'cost-unit',
    resource: 'hrm/Costunits',
    singular: 'a cost unit',
    plural: 'cost units',
    methods: ['create', 'update', 'delete'],
  },
}

for (const spec of Object.values(masterData)) {
  spec.byCode = true
  spec.codeFlags = true
}
