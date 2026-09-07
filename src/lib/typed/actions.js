/**
 * The actions of Exact Online: POST-only resources that act on one record.
 * One descriptor per command; src/lib/typed/action.js turns it into a
 * command. Keys are `<topic>:<verb>`.
 * @type {Record<string, import('./action.js').Action>}
 */

const LAYOUT = {
  layout: {
    field: 'DocumentLayout',
    type: 'guid',
    description: 'Document layout (GUID) of the PDF',
  },
  'email-layout': {
    field: 'EmailLayout',
    type: 'guid',
    description: 'Email layout (GUID) of the message text',
  },
  'extra-text': {
    field: 'ExtraText',
    type: 'string',
    description: 'Extra text on the document and in the email',
  },
}
const SEND_EMAIL = {
  email: {
    field: 'SendEmailToCustomer',
    type: 'bool',
    description: 'Send the document to the customer by email',
  },
}
const COMPLETE = {
  delivery: {
    field: 'CompleteDelivery',
    type: 'bool',
    description: 'Complete the remaining goods delivery',
  },
  invoice: {
    field: 'CompleteInvoice',
    type: 'bool',
    description: 'Complete the outstanding invoice amount',
  },
}
const QUOTATION = (description) => ({
  field: 'QuotationID',
  description: `${description} (a GUID; quotation list shows it)`,
})
const FOLLOW_UP = {
  action: {
    field: 'Action',
    type: 'int',
    description:
      'Follow-up: 0 none, 1 sales order, 2 sales invoice, 3 project, ' +
      '4 project WBS, 5 subscription',
  },
  'invoice-journal': {
    field: 'InvoiceJournal',
    type: 'string',
    description: 'Journal code of the sales invoice (action 2)',
  },
  'your-ref': {
    field: 'YourRef',
    type: 'string',
    description: 'Purchase order number of the customer',
  },
}
const STAGE = {
  'opportunity-stage': {
    field: 'OpportunityStage',
    type: 'guid',
    description: 'Stage (GUID) of the linked opportunity afterwards',
  },
  'notification-layout': {
    field: 'NotificationLayout',
    type: 'guid',
    description: 'Email layout (GUID) of the notification',
  },
}

export const actions = {
  'quotation:accept': {
    topic: 'quotation',
    verb: 'accept',
    resource: 'crm/AcceptQuotation',
    description: 'Accept a quotation, with an optional follow-up',
    target: QUOTATION('Quotation to accept'),
    fields: {
      ...FOLLOW_UP,
      reason: {
        field: 'ReasonCode',
        type: 'guid',
        description: 'Reason code (GUID) of the acceptance',
      },
      ...STAGE,
    },
    examples: [
      '<%= config.bin %> quotation accept <id> --dry-run',
      '<%= config.bin %> quotation accept <id> --action 1 --allow-writes',
      '<%= config.bin %> quotation accept <id> --action 2 --invoice-journal 70 --allow-writes',
    ],
  },
  'quotation:reject': {
    topic: 'quotation',
    verb: 'reject',
    resource: 'crm/RejectQuotation',
    description: 'Reject a quotation',
    target: QUOTATION('Quotation to reject'),
    fields: {
      reason: {
        field: 'ReasonCode',
        type: 'guid',
        description: 'Reason code (GUID) of the rejection',
      },
      ...STAGE,
    },
  },
  'quotation:reopen': {
    topic: 'quotation',
    verb: 'reopen',
    resource: 'crm/ReopenQuotation',
    description: 'Reopen an accepted or rejected quotation',
    target: QUOTATION('Quotation to reopen'),
    fields: {},
  },
  'quotation:review': {
    topic: 'quotation',
    verb: 'review',
    resource: 'crm/ReviewQuotation',
    description: 'Review a quotation: a new version replaces it',
    target: QUOTATION('Quotation to review'),
    fields: {
      description: {
        field: 'Description',
        type: 'string',
        description: 'Description of the new quotation',
      },
      date: {
        field: 'QuotationDate',
        type: 'date',
        description: 'Date of the new quotation (YYYY-MM-DD)',
      },
      'copy-prices': {
        field: 'CopyItemPrices',
        type: 'bool',
        description: 'Copy the item prices of the original',
      },
      account: {
        field: 'OrderAccount',
        type: 'guid',
        resolve: 'crm/Accounts',
        description: 'Order account (code or GUID) of the new quotation',
      },
      'payment-condition': {
        field: 'PaymentCondition',
        type: 'string',
        description: 'Payment condition code',
      },
      document: {
        field: 'Document',
        type: 'guid',
        description: 'Document (GUID) linked to the new quotation',
      },
    },
  },
  'quotation:print': {
    topic: 'quotation',
    verb: 'print',
    resource: 'crm/PrintQuotation',
    description: 'Print a quotation to a PDF document, and email it',
    target: QUOTATION('Quotation to print'),
    fields: {
      ...LAYOUT,
      ...SEND_EMAIL,
      date: {
        field: 'QuotationDate',
        type: 'date',
        description: 'Date printed on the quotation (YYYY-MM-DD)',
      },
    },
    examples: [
      '<%= config.bin %> quotation print <id> --dry-run',
      '<%= config.bin %> quotation print <id> --email --allow-writes',
    ],
  },
  'quotation:email': {
    topic: 'quotation',
    verb: 'email',
    resource: 'crm/EmailWithSignOffQuotation',
    description: 'Email a quotation that the customer signs off online',
    target: QUOTATION('Quotation to send'),
    fields: {
      'email-layout': { ...LAYOUT['email-layout'], required: true },
      layout: LAYOUT.layout,
      subject: {
        field: 'Subject',
        type: 'string',
        description: 'Subject of the email',
      },
      'extra-text': LAYOUT['extra-text'],
      ...FOLLOW_UP,
      'allow-your-ref': {
        field: 'AllowProvideYourRef',
        type: 'bool',
        description: 'Let the customer enter a purchase order number',
      },
      'accept-layout': {
        field: 'AcceptEmailLayout',
        type: 'guid',
        description: 'Email layout (GUID) sent on acceptance',
      },
      'reject-layout': {
        field: 'RejectEmailLayout',
        type: 'guid',
        description: 'Email layout (GUID) sent on rejection',
      },
      date: {
        field: 'QuotationDate',
        type: 'date',
        description: 'Date printed on the quotation (YYYY-MM-DD)',
      },
    },
    examples: [
      '<%= config.bin %> quotation email <id> --email-layout <layout-id> --dry-run',
      '<%= config.bin %> quotation email <id> --email-layout <layout-id> --action 1 --allow-writes',
    ],
  },
  'sales-order:complete': {
    topic: 'sales-order',
    verb: 'complete',
    resource: 'salesorder/CompleteSalesOrder',
    description:
      'Complete a sales order: close what is not delivered or invoiced',
    target: {
      field: 'OrderID',
      description: 'Sales order to complete (a GUID)',
    },
    fields: COMPLETE,
    examples: [
      '<%= config.bin %> sales-order complete <id> --dry-run',
      '<%= config.bin %> sales-order complete <id> --delivery --invoice --allow-writes',
    ],
  },
  'sales-order:complete-line': {
    topic: 'sales-order',
    verb: 'complete-line',
    resource: 'salesorder/CompleteSalesOrderLine',
    description: 'Complete one sales order line',
    target: {
      field: 'ID',
      description: 'Sales order line to complete (a GUID)',
    },
    fields: COMPLETE,
  },
  'sales-order:print': {
    topic: 'sales-order',
    verb: 'print',
    resource: 'salesorder/PrintedSalesOrders',
    description: 'Print a sales order to a PDF document, and email it',
    target: { field: 'OrderId', description: 'Sales order to print (a GUID)' },
    fields: {
      ...LAYOUT,
      ...SEND_EMAIL,
      sender: {
        field: 'SenderEmailAddress',
        type: 'string',
        description: 'Email address of the sender',
      },
    },
  },
  'sales-invoice:print': {
    topic: 'sales-invoice',
    verb: 'print',
    resource: 'salesinvoice/PrintedSalesInvoices',
    description:
      'Print a sales invoice to a PDF document, and send it by email, ' +
      'postbox or Peppol',
    target: {
      field: 'InvoiceID',
      description:
        'Sales invoice to print (a GUID; sales-invoice list shows it)',
    },
    fields: {
      ...LAYOUT,
      ...SEND_EMAIL,
      sender: {
        field: 'SenderEmailAddress',
        type: 'string',
        description: 'Email address of the sender',
      },
      postbox: {
        field: 'SendInvoiceToCustomerPostbox',
        type: 'bool',
        description: 'Send the invoice to the postbox of the customer',
      },
      'postbox-sender': {
        field: 'PostboxSender',
        type: 'guid',
        description: 'Postbox (GUID) that sends the message',
      },
      peppol: {
        field: 'SendInvoiceViaPeppol',
        type: 'bool',
        description: 'Send the invoice through Peppol',
      },
      'by-account': {
        field: 'SendOutputBasedOnAccount',
        type: 'bool',
        description: 'Take the output preference of the account',
      },
      date: {
        field: 'InvoiceDate',
        type: 'date',
        description: 'Invoice date (YYYY-MM-DD)',
      },
      'reporting-year': {
        field: 'ReportingYear',
        type: 'int',
        description: 'Reporting year',
      },
      'reporting-period': {
        field: 'ReportingPeriod',
        type: 'int',
        description: 'Reporting period',
      },
    },
    examples: [
      '<%= config.bin %> sales-invoice print <id> --dry-run',
      '<%= config.bin %> sales-invoice print <id> --email --allow-writes',
      '<%= config.bin %> sales-invoice print <id> --peppol --allow-writes',
    ],
  },
  'stock-count:process': {
    topic: 'stock-count',
    verb: 'process',
    resource: 'inventory/ProcessStockCount',
    description: 'Process a stock count',
    target: {
      field: 'StockCountID',
      description: 'Stock count to process (a GUID)',
    },
    fields: {},
  },
  'warehouse-transfer:process': {
    topic: 'warehouse-transfer',
    verb: 'process',
    resource: 'inventory/ProcessWarehouseTransfer',
    description: 'Process a warehouse transfer',
    target: {
      field: 'TransferID',
      description: 'Warehouse transfer to process (a GUID)',
    },
    fields: {
      date: {
        field: 'TransferDate',
        type: 'date',
        description: 'Transfer date (YYYY-MM-DD)',
      },
    },
  },
  'assembly-order:finish': {
    topic: 'assembly-order',
    verb: 'finish',
    resource: 'inventory/FinishAssemblyOrder',
    description: 'Finish an assembly order for a quantity',
    target: {
      field: 'AssemblyOrder',
      description: 'Assembly order to finish (a GUID)',
    },
    fields: {
      quantity: {
        field: 'FinishOrderQuantity',
        type: 'number',
        required: true,
        description: 'Quantity finished',
      },
      date: {
        field: 'AssemblyDate',
        type: 'date',
        description: 'Assembly date (YYYY-MM-DD)',
      },
      description: {
        field: 'Description',
        type: 'string',
        description: 'Description of the assembly order',
      },
      notes: { field: 'Notes', type: 'string', description: 'Notes' },
      location: {
        field: 'AssembledItemStorageLocation',
        type: 'guid',
        description: 'Storage location (GUID) of the assembled item',
      },
    },
    examples: [
      '<%= config.bin %> assembly-order finish <id> --quantity 10 --dry-run',
      '<%= config.bin %> assembly-order finish <id> --quantity 10 --allow-writes',
    ],
  },
  'return:process': {
    topic: 'return',
    verb: 'process',
    resource: 'financial/ProcessReturn',
    description:
      'Set the status of a return request (VAT or payroll declaration)',
    target: {
      field: 'Request',
      description:
        'Request to process (a GUID; list read/financial/Returns shows it)',
    },
    fields: {
      status: {
        field: 'Status',
        type: 'int',
        required: true,
        description: 'New status: 5 rejected, 50 processed',
      },
    },
    examples: [
      '<%= config.bin %> return process <request-id> --status 50 --dry-run',
      '<%= config.bin %> return process <request-id> --status 50 --allow-writes',
    ],
  },
  'custom-field:set': {
    topic: 'custom-field',
    verb: 'set',
    resource: 'customfield/UpdateCustomField',
    description: 'Set the value of a custom field on one record',
    target: {
      field: 'PropertyName',
      type: 'string',
      description: 'Property name of the custom field',
    },
    fields: {
      component: {
        field: 'BusinessComponentName',
        type: 'string',
        required: true,
        description: 'Business component, for example Account or Item',
      },
      record: {
        field: 'LinkId',
        type: 'guid',
        required: true,
        description: 'Record (GUID) that carries the field',
      },
      value: {
        field: 'Value',
        type: 'string',
        required: true,
        description: 'Value to store',
      },
      caption: {
        field: 'Caption',
        type: 'string',
        description: 'Description of the custom field',
      },
      type: {
        field: 'Type',
        type: 'string',
        description: 'Data type of the custom field',
      },
      'refers-to': {
        field: 'RefersTo',
        type: 'string',
        description: 'Referenced entity, for example Item or Account',
      },
    },
    examples: [
      '<%= config.bin %> custom-field set Segment --component Account --record <account-id> --value North --dry-run',
      '<%= config.bin %> custom-field set Segment --component Account --record <account-id> --value North --allow-writes',
    ],
  },
}
