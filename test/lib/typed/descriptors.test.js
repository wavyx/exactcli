import { describe, it, expect } from 'vitest'
import { columnsOf, descriptors } from '../../../src/lib/typed/descriptors.js'
import { resetCatalog, validateDescriptor } from '../../../src/lib/catalog.js'

describe('descriptors', () => {
  it('validate against the shipped catalogue', () => {
    resetCatalog()
    for (const descriptor of Object.values(descriptors)) {
      expect(() => validateDescriptor(descriptor)).not.toThrow()
    }
  })

  it('carry a unique topic, a resource, columns and an order', () => {
    const topics = Object.values(descriptors).map((d) => d.topic)
    expect(new Set(topics).size).toBe(topics.length)
    for (const d of Object.values(descriptors)) {
      expect(d.resource).toMatch(/^[a-z]+\/[A-Za-z]+$/)
      expect(d.columns.length).toBeGreaterThan(0)
      expect(d.orderBy).toMatch(/ (asc|desc)$/)
      expect(d.description).toMatch(/^List /)
    }
  })

  it('columnsOf builds the table columns of a descriptor', () => {
    expect(columnsOf(descriptors.salesEntry)).toEqual({
      EntryID: { header: 'EntryID' },
      EntryNumber: { header: 'EntryNumber' },
      EntryDate: { header: 'EntryDate' },
      InvoiceNumber: { header: 'InvoiceNumber' },
      Customer: { header: 'Customer' },
      CustomerName: { header: 'CustomerName' },
      Description: { header: 'Description' },
      AmountDC: { header: 'AmountDC' },
      VATAmountDC: { header: 'VATAmountDC' },
      Currency: { header: 'Currency' },
      Journal: { header: 'Journal' },
      StatusDescription: { header: 'StatusDescription' },
    })
  })
})
