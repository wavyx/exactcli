import { describe, it, expect } from 'vitest'
import { lineDescriptors } from '../../src/lib/typed/line-descriptors.js'
import SalesInvoice from '../../src/commands/sales-invoice/lines.js'
import SalesEntry from '../../src/commands/sales-entry/lines.js'
import PurchaseEntry from '../../src/commands/purchase-entry/lines.js'
import JournalEntry from '../../src/commands/journal-entry/lines.js'
import BankEntry from '../../src/commands/bank-entry/lines.js'
import CashEntry from '../../src/commands/cash-entry/lines.js'
import SalesOrder from '../../src/commands/sales-order/lines.js'
import PurchaseOrder from '../../src/commands/purchase-order/lines.js'
import Quotation from '../../src/commands/quotation/lines.js'
import PurchaseInvoice from '../../src/commands/purchase-invoice/lines.js'

describe('lines commands', () => {
  it('registers one lines command per line descriptor', () => {
    const commands = {
      salesInvoice: SalesInvoice,
      salesEntry: SalesEntry,
      purchaseEntry: PurchaseEntry,
      journalEntry: JournalEntry,
      bankEntry: BankEntry,
      cashEntry: CashEntry,
      salesOrder: SalesOrder,
      purchaseOrder: PurchaseOrder,
      quotation: Quotation,
      purchaseInvoice: PurchaseInvoice,
    }
    expect(Object.keys(commands).sort()).toEqual(
      Object.keys(lineDescriptors).sort(),
    )
    for (const [key, Command] of Object.entries(commands)) {
      expect(Command.descriptor, key).toBe(lineDescriptors[key])
    }
  })
})
