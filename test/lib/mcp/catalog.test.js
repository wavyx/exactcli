import { describe, it, expect } from 'vitest'
import {
  GENERIC_TOOLS,
  buildCatalog,
  classifyKind,
  isExcluded,
  toolName,
  typedTools,
} from '../../../src/lib/mcp/catalog.js'
import { descriptors } from '../../../src/lib/typed/descriptors.js'
import { buildInputSchema } from '../../../src/lib/mcp/schema.js'

const opt = (description = 'x') => ({ type: 'option', description })
const bool = () => ({ type: 'boolean' })
const listing = {
  filter: opt(),
  select: opt(),
  expand: opt(),
  orderby: opt(),
  top: opt(),
  all: bool(),
  'max-pages': opt(),
  raw: bool(),
  limit: opt(),
  output: opt(),
  jq: opt(),
}
const cmd = (id, args = {}, flags = {}, extra = {}) => ({
  id,
  summary: `Summary of ${id}`,
  args,
  flags,
  ...extra,
})
const commands = [
  cmd(
    'metadata',
    { resource: opt('Resource') },
    {
      search: opt('Word'),
      mandatory: bool(),
      filterable: bool(),
      methods: bool(),
    },
  ),
  cmd('list', { resource: { required: true } }, { ...listing, beta: bool() }),
  cmd(
    'get',
    { resource: { required: true }, id: { required: true } },
    { select: opt(), expand: opt(), beta: bool(), raw: bool() },
  ),
  cmd(
    'probe',
    { resource: { required: true } },
    { top: opt(), filter: opt(), beta: bool(), output: opt(), jq: opt() },
  ),
  cmd('me', {}, { raw: bool() }),
  cmd('quota'),
  cmd(
    'account:list',
    {},
    {
      ...listing,
      search: opt(),
      status: opt(),
      customer: opt(),
      supplier: opt(),
    },
  ),
  cmd('gl-account:list', {}, { ...listing, type: opt(), search: opt() }),
  cmd(
    'transaction-line:list',
    {},
    {
      ...listing,
      year: opt(),
      period: opt(),
      from: opt(),
      to: opt(),
      'gl-account': opt(),
      account: opt(),
      journal: opt(),
    },
  ),
  cmd(
    'document:list',
    {},
    { ...listing, account: opt(), type: opt(), from: opt(), to: opt() },
  ),
  cmd('sales-entry:list', {}, listing),
  cmd('purchase-entry:list', {}, listing),
  cmd(
    'document:download',
    { id: { required: true } },
    { out: opt(), force: bool() },
  ),
  cmd('create', { resource: { required: true } }, { body: opt(), set: opt() }),
  cmd('update', { resource: { required: true }, id: { required: true } }),
  cmd('delete', { resource: { required: true }, id: { required: true } }),
  cmd('division:list', {}, listing),
  cmd('division:use', { code: { required: true } }),
  cmd('division:current'),
  cmd('api'),
  cmd('doctor'),
  cmd('mcp'),
  cmd('auth:login'),
  cmd('config:set'),
  cmd('profile:use'),
  cmd('secret:list', {}, {}, { hidden: true }),
]

const names = (entries) => entries.map((e) => e.toolName)

describe('classifyKind and helpers', () => {
  it('classifies by the leaf verb, mutation by default', () => {
    expect(classifyKind('division:list')).toBe('read')
    expect(classifyKind('me')).toBe('read')
    expect(classifyKind('division:use')).toBe('write')
    expect(classifyKind('create')).toBe('write')
    expect(classifyKind('delete')).toBe('destructive')
    expect(classifyKind('config:unset')).toBe('destructive')
  })

  it('excludes the escape hatch, diagnostics, the server, downloads and local state', () => {
    for (const id of [
      'api',
      'doctor',
      'mcp',
      'document:download',
      'auth:login',
      'config:set',
      'profile:use',
    ]) {
      expect(isExcluded(id)).toBe(true)
    }
    expect(isExcluded('division:use')).toBe(false)
  })

  it('builds tool names with the exact_ prefix', () => {
    expect(toolName('gl-account:list')).toBe('exact_gl_account_list')
  })
})

describe('buildCatalog', () => {
  const catalog = buildCatalog(commands, descriptors)

  it('exposes the seven generic tools and one tool per descriptor, all reads', () => {
    expect(names(catalog)).toEqual([
      'exact_resources',
      'exact_metadata',
      'exact_list',
      'exact_get',
      'exact_probe',
      'exact_me',
      'exact_quota',
      'exact_sales_entry_list',
      'exact_purchase_entry_list',
      'exact_transaction_line_list',
      'exact_account_list',
      'exact_gl_account_list',
      'exact_document_list',
      'exact_write',
    ])
    expect(catalog.filter((e) => e.kind === 'read')).toHaveLength(13)
    expect(catalog.at(-1)).toMatchObject({
      kind: 'write',
      custom: 'write',
      id: 'write',
    })
    expect(GENERIC_TOOLS).toHaveLength(7)
  })

  it('offers exact_write only when the three write commands exist', () => {
    const partial = buildCatalog([cmd('create'), cmd('update')], {})
    expect(names(partial)).toEqual([])
  })

  it('keeps only the listed args and flags of a generic tool', () => {
    const list = catalog.find((e) => e.toolName === 'exact_list')
    expect(Object.keys(buildInputSchema(list)).sort()).toEqual(
      [
        'resource',
        'filter',
        'select',
        'expand',
        'orderby',
        'top',
        'all',
        'max-pages',
        'limit',
        'beta',
      ].sort(),
    )
    expect(list.summary).toMatch(/substringof/)
    const get = catalog.find((e) => e.toolName === 'exact_get')
    expect(Object.keys(buildInputSchema(get)).sort()).toEqual([
      'beta',
      'expand',
      'id',
      'resource',
      'select',
    ])
    const probe = catalog.find((e) => e.toolName === 'exact_probe')
    expect(Object.keys(buildInputSchema(probe)).sort()).toEqual([
      'beta',
      'filter',
      'resource',
      'top',
    ])
  })

  it('makes the search word required for exact_resources and the resource for exact_metadata', () => {
    const resources = catalog.find((e) => e.toolName === 'exact_resources')
    expect(resources.id).toBe('metadata')
    expect(Object.keys(resources.args)).toEqual([])
    expect(resources.flags.search.required).toBe(true)
    const metadata = catalog.find((e) => e.toolName === 'exact_metadata')
    expect(metadata.args.resource.required).toBe(true)
    expect(Object.keys(metadata.flags).sort()).toEqual([
      'filterable',
      'mandatory',
      'methods',
    ])
  })

  it('gives a typed tool its filters plus the listing flags, and a guiding summary', () => {
    const typed = catalog.find(
      (e) => e.toolName === 'exact_transaction_line_list',
    )
    expect(Object.keys(typed.flags).sort()).toEqual(
      [
        'year',
        'period',
        'from',
        'to',
        'gl-account',
        'account',
        'journal',
        'filter',
        'select',
        'orderby',
        'all',
        'max-pages',
        'limit',
      ].sort(),
    )
    expect(typed.summary).toMatch(
      /Prefer this over exact_list for financialtransaction\/TransactionLines: filters year, period/,
    )
    const entry = catalog.find((e) => e.toolName === 'exact_sales_entry_list')
    expect(entry.summary).toMatch(/filters none/)
  })

  it('tolerates a command without args and flags', () => {
    const [me] = buildCatalog([{ id: 'me' }], {})
    expect(me.toolName).toBe('exact_me')
    expect(me.args).toEqual({})
    expect(me.flags).toEqual({})
  })

  it('skips a generic or typed tool whose command is absent', () => {
    const partial = buildCatalog([cmd('me')], descriptors)
    expect(names(partial)).toEqual(['exact_me'])
    expect(typedTools(descriptors, [])).toEqual([])
  })

  it('adds every other visible, non-excluded command with allTools', () => {
    const base = names(buildCatalog(commands, descriptors))
    const all = buildCatalog(commands, descriptors, { allTools: true })
    expect(names(all)).toEqual([
      ...base,
      'exact_division_list',
      'exact_division_use',
      'exact_division_current',
    ])
    const use = all.find((e) => e.toolName === 'exact_division_use')
    expect(use.kind).toBe('write')
    expect(use.summary).toBe('Summary of division:use')
  })

  it('falls back to description, then id, for the summary with allTools', () => {
    const bare = [
      { id: 'division:current', description: 'Current' },
      { id: 'division:list' },
    ]
    const all = buildCatalog(bare, {}, { allTools: true })
    expect(all.map((e) => e.summary)).toEqual(['Current', 'division:list'])
    expect(all[1].args).toEqual({})
    expect(all[1].flags).toEqual({})
  })
})
