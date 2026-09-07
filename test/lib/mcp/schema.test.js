import { describe, it, expect } from 'vitest'
import { buildInputSchema, NOISE_FLAGS } from '../../../src/lib/mcp/schema.js'

const entry = {
  args: {
    id: { description: 'Deal id', required: true },
    note: { description: 'Optional note' },
  },
  flags: {
    status: {
      type: 'option',
      options: ['open', 'won', 'lost'],
      description: 'St',
    },
    title: { type: 'option', description: 'Title', required: true },
    'exact-match': { type: 'boolean', description: 'Exact' },
    include: { type: 'option', multiple: true, description: 'Include' },
    limit: { type: 'option', description: 'Max items' },
    // noise - must be dropped:
    output: { type: 'option', options: ['table', 'json', 'yaml', 'csv'] },
    jq: { type: 'option' },
    fields: { type: 'option' },
    raw: { type: 'boolean' },
    'no-color': { type: 'boolean' },
    verbose: { type: 'boolean' },
    'no-retry': { type: 'boolean' },
    timeout: { type: 'option' },
    profile: { type: 'option' },
    division: { type: 'option' },
    'allow-writes': { type: 'boolean' },
    yes: { type: 'boolean' },
    // local files - the agent surface never reads or writes one:
    file: { type: 'option', multiple: true },
    state: { type: 'option' },
    body: { type: 'option' },
    out: { type: 'option' },
  },
}

describe('buildInputSchema', () => {
  const shape = buildInputSchema(entry)

  it('drops global/noise flags (including yes, division, allow-writes and local files)', () => {
    for (const n of [
      'output',
      'jq',
      'fields',
      'raw',
      'no-color',
      'verbose',
      'no-retry',
      'timeout',
      'profile',
      'division',
      'allow-writes',
      'yes',
      'file',
      'state',
      'body',
      'out',
    ]) {
      expect(Object.keys(shape)).not.toContain(n)
      expect(NOISE_FLAGS.has(n)).toBe(true)
    }
  })

  it('keeps limit - an agent legitimately sizes list results', () => {
    expect(NOISE_FLAGS.has('limit')).toBe(false)
    expect(shape.limit.safeParse(50).success).toBe(true)
  })

  it('includes args and meaningful flags', () => {
    expect(Object.keys(shape).sort()).toEqual(
      [
        'exact-match',
        'id',
        'include',
        'limit',
        'note',
        'status',
        'title',
      ].sort(),
    )
  })

  it('makes a required arg non-optional and an optional arg optional', () => {
    expect(shape.id.safeParse(undefined).success).toBe(false)
    expect(shape.note.safeParse(undefined).success).toBe(true)
    expect(shape.id.safeParse('5').success).toBe(true)
  })

  it('accepts a number for an id/option (LLMs send {id: 123})', () => {
    expect(shape.id.safeParse(123).success).toBe(true)
    expect(shape.title.safeParse(7).success).toBe(true)
  })

  it('maps an options flag to an enum', () => {
    expect(shape.status.safeParse('won').success).toBe(true)
    expect(shape.status.safeParse('nope').success).toBe(false)
  })

  it('maps a plain option flag to a string and required flag stays required', () => {
    expect(shape.title.safeParse('Acme deal').success).toBe(true)
    expect(shape.title.safeParse(undefined).success).toBe(false)
  })

  it('maps a boolean flag (always optional)', () => {
    expect(shape['exact-match'].safeParse(true).success).toBe(true)
    expect(shape['exact-match'].safeParse('x').success).toBe(false)
    expect(shape['exact-match'].safeParse(undefined).success).toBe(true)
  })

  it('maps a multiple option flag to an array', () => {
    expect(shape.include.safeParse(['deal', 'person']).success).toBe(true)
    expect(shape.include.safeParse('deal').success).toBe(false)
  })

  it('gives a destructive tool an optional confirm boolean, other kinds none', () => {
    const destructive = buildInputSchema({ ...entry, kind: 'destructive' })
    expect(destructive.confirm.safeParse(true).success).toBe(true)
    expect(destructive.confirm.safeParse('yes').success).toBe(false)
    expect(destructive.confirm.safeParse(undefined).success).toBe(true)
    expect(destructive.confirm.description).toBe('Must be true to delete')
    expect(buildInputSchema({ ...entry, kind: 'write' })).not.toHaveProperty(
      'confirm',
    )
    expect(shape).not.toHaveProperty('confirm')
  })
})

describe('buildInputSchema edge cases', () => {
  it('returns an empty shape for an entry with no args or flags', () => {
    expect(buildInputSchema({})).toEqual({})
  })

  it('handles description-less args and flags', () => {
    const shape = buildInputSchema({
      args: { x: {} },
      flags: { b: { type: 'boolean' }, o: { type: 'option' } },
    })
    expect(shape.x.safeParse(undefined).success).toBe(true)
    expect(shape.b.safeParse(true).success).toBe(true)
    expect(shape.o.safeParse('v').success).toBe(true)
  })
})
