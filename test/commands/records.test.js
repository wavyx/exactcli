import { describe, it, expect } from 'vitest'
import { findResource } from '../../src/lib/catalog.js'
import { records } from '../../src/lib/typed/records.js'

const VERBS = { create: 'POST', update: 'PUT', delete: 'DELETE' }

describe('record write commands', () => {
  it('offer only methods the catalogue has, each with its command file', async () => {
    let count = 0
    for (const [key, spec] of Object.entries(records)) {
      const res = findResource(spec.resource)
      for (const m of spec.methods) {
        expect(res.methods, `${key} ${m}`).toContain(VERBS[m])
        const { default: Command } = await import(
          `../../src/commands/${spec.topic}/${m}.js`
        )
        expect(Command.description, `${spec.topic} ${m}`).toContain(
          `${VERBS[m]} ${spec.resource}`,
        )
        count++
      }
    }
    expect(count).toBe(54)
  })

  it('take a code where the resource has one', () => {
    expect(records.project).toMatchObject({ byCode: true, codeFlags: true })
    expect(records.warehouse).toMatchObject({ byCode: true, codeFlags: true })
    expect(records.account).toMatchObject({ byCode: true, codeFlags: false })
    expect(records.opportunity).toMatchObject({
      byCode: false,
      codeFlags: false,
    })
    expect(records.timeEntry.topic).toBe('time-entry')
    // The Code of a contact is the code of its account: GUIDs only.
    expect(records.contact).toMatchObject({ byCode: false, codeFlags: false })
  })
})
