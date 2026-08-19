import { describe, it, expect, vi } from 'vitest'
import { formatOutput } from '../../../src/lib/output/index.js'

describe('formatOutput', () => {
  it('dispatches to the json formatter when the format is "json"', () => {
    const cmd = { log: vi.fn() }
    const data = { ID: 1, Name: 'Acme' }

    formatOutput(data, { ID: { header: 'ID' } }, 'json', cmd)

    expect(cmd.log).toHaveBeenCalledOnce()
    expect(JSON.parse(cmd.log.mock.calls[0][0])).toEqual(data)
  })

  it('dispatches to the table formatter when the format is "table"', () => {
    const cmd = { log: vi.fn() }
    const columns = { ID: { header: 'ID' }, Name: { header: 'Name' } }

    formatOutput([{ ID: 1, Name: 'Acme' }], columns, 'table', cmd)

    expect(cmd.log).toHaveBeenCalledOnce()
    const output = cmd.log.mock.calls[0][0]
    expect(output).toContain('ID')
    expect(output).toContain('Name')
    expect(output).toContain('Acme')
  })

  it('defaults to the table format for unknown format values', () => {
    const cmd = { log: vi.fn() }

    formatOutput([{ ID: 1 }], { ID: { header: 'ID' } }, 'unknown', cmd)

    expect(cmd.log).toHaveBeenCalledOnce()
    expect(cmd.log.mock.calls[0][0]).toContain('ID')
  })

  it('wraps non-array data into an array for the table format', () => {
    const cmd = { log: vi.fn() }
    const columns = { ID: { header: 'ID' }, Name: { header: 'Name' } }

    formatOutput({ ID: 5, Name: 'Solo' }, columns, 'table', cmd)

    const output = cmd.log.mock.calls[0][0]
    expect(output).toContain('5')
    expect(output).toContain('Solo')
  })

  it('passes raw (unwrapped) data to the json formatter', () => {
    const cmd = { log: vi.fn() }

    formatOutput({ ID: 1 }, { ID: { header: 'ID' } }, 'json', cmd)

    expect(JSON.parse(cmd.log.mock.calls[0][0])).toEqual({ ID: 1 })
  })

  it('dispatches to the yaml formatter', () => {
    const cmd = { log: vi.fn() }

    formatOutput({ ID: 1, Name: 'Acme' }, {}, 'yaml', cmd)

    const output = cmd.log.mock.calls[0][0]
    expect(output).toContain('ID: 1')
    expect(output).toContain('Name: Acme')
  })

  it('dispatches to the csv formatter', () => {
    const cmd = { log: vi.fn() }
    const columns = { ID: { header: 'ID' }, Name: { header: 'Name' } }

    formatOutput([{ ID: 1, Name: 'Acme' }], columns, 'csv', cmd)

    const output = cmd.log.mock.calls[0][0]
    expect(output).toContain('ID,Name')
    expect(output).toContain('1,Acme')
  })
})
