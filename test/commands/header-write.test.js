import { describe, it, expect } from 'vitest'
import { lineDescriptors } from '../../src/lib/typed/line-descriptors.js'
import SalesInvoiceDelete from '../../src/commands/sales-invoice/delete.js'
import SalesEntryDelete from '../../src/commands/sales-entry/delete.js'
import PurchaseEntryDelete from '../../src/commands/purchase-entry/delete.js'
import JournalEntryDelete from '../../src/commands/journal-entry/delete.js'
import BankEntryDelete from '../../src/commands/bank-entry/delete.js'
import CashEntryDelete from '../../src/commands/cash-entry/delete.js'
import SalesOrderDelete from '../../src/commands/sales-order/delete.js'
import PurchaseOrderDelete from '../../src/commands/purchase-order/delete.js'
import QuotationDelete from '../../src/commands/quotation/delete.js'
import PurchaseInvoiceDelete from '../../src/commands/purchase-invoice/delete.js'
import SalesInvoiceUpdate from '../../src/commands/sales-invoice/update.js'
import SalesEntryUpdate from '../../src/commands/sales-entry/update.js'
import PurchaseEntryUpdate from '../../src/commands/purchase-entry/update.js'
import SalesOrderUpdate from '../../src/commands/sales-order/update.js'
import PurchaseOrderUpdate from '../../src/commands/purchase-order/update.js'
import PurchaseInvoiceUpdate from '../../src/commands/purchase-invoice/update.js'

describe('header write commands', () => {
  it('registers one delete command per header descriptor', () => {
    const commands = {
      salesInvoice: SalesInvoiceDelete,
      salesEntry: SalesEntryDelete,
      purchaseEntry: PurchaseEntryDelete,
      journalEntry: JournalEntryDelete,
      bankEntry: BankEntryDelete,
      cashEntry: CashEntryDelete,
      salesOrder: SalesOrderDelete,
      purchaseOrder: PurchaseOrderDelete,
      quotation: QuotationDelete,
      purchaseInvoice: PurchaseInvoiceDelete,
    }
    expect(Object.keys(commands).sort()).toEqual(
      Object.keys(lineDescriptors).sort(),
    )
    for (const [key, Command] of Object.entries(commands)) {
      expect(Command.descriptor, key).toBe(lineDescriptors[key])
    }
  })

  it('registers an update command where the header takes a PUT', () => {
    // No PUT on general journal, bank and cash entries; quotation update is
    // a typed command of its own.
    const commands = {
      salesInvoice: SalesInvoiceUpdate,
      salesEntry: SalesEntryUpdate,
      purchaseEntry: PurchaseEntryUpdate,
      salesOrder: SalesOrderUpdate,
      purchaseOrder: PurchaseOrderUpdate,
      purchaseInvoice: PurchaseInvoiceUpdate,
    }
    for (const [key, Command] of Object.entries(commands)) {
      expect(Command.descriptor, key).toBe(lineDescriptors[key])
    }
  })
})
