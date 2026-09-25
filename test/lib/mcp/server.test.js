import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import {
  WRITE_SHAPE,
  annotationsFor,
  buildServer,
  selectTools,
} from '../../../src/lib/mcp/server.js'
import { descriptors } from '../../../src/lib/typed/descriptors.js'

const commands = [
  { id: 'me', summary: 'Me', args: {}, flags: {} },
  { id: 'quota', summary: 'Quota', args: {}, flags: {} },
  {
    id: 'account:list',
    summary: 'Accounts',
    args: {},
    flags: {
      search: { type: 'option', description: 'Word' },
      limit: { type: 'option' },
    },
  },
  {
    id: 'division:use',
    summary: 'Use',
    args: { code: { required: true } },
    flags: {},
  },
  { id: 'division:list', summary: 'Divisions', args: {}, flags: {} },
  {
    id: 'webhook:create',
    summary: 'Hook',
    args: {},
    flags: {
      url: { type: 'option' },
      'allow-writes': { type: 'boolean' },
      yes: { type: 'boolean' },
    },
  },
  {
    id: 'webhook:delete',
    summary: 'Unhook',
    args: { id: { required: true } },
    flags: { 'allow-writes': { type: 'boolean' }, yes: { type: 'boolean' } },
  },
  { id: 'create', summary: 'Create', args: {}, flags: {} },
  { id: 'update', summary: 'Update', args: {}, flags: {} },
  { id: 'delete', summary: 'Delete', args: {}, flags: {} },
]

describe('selectTools', () => {
  const catalog = [
    { id: 'me', kind: 'read' },
    { id: 'create', kind: 'write' },
    { id: 'delete', kind: 'destructive' },
  ]

  it('keeps reads only by default', () => {
    expect(selectTools(catalog).map((e) => e.id)).toEqual(['me'])
  })

  it('keeps everything with allowWrites', () => {
    expect(selectTools(catalog, { allowWrites: true })).toHaveLength(3)
  })
})

describe('WRITE_SHAPE', () => {
  const shape = z.object(WRITE_SHAPE)
  const base = { operation: 'update', key: 'k' }

  it('accepts a resource path and refuses a flag or odd characters in it', () => {
    for (const resource of [
      'crm/Accounts',
      'beta/crm/Accounts',
      'sync/CRM/Accounts',
      'financialtransaction/TransactionLines',
    ]) {
      expect(shape.safeParse({ ...base, resource }).success).toBe(true)
    }
    for (const resource of [
      '--division=999999',
      '-x',
      'crm/Accounts;rm',
      'crm Accounts',
      'crm/Accounts?$top=1',
      '',
    ]) {
      expect(shape.safeParse({ ...base, resource }).success).toBe(false)
    }
  })

  it('accepts a string or an integer key', () => {
    const resource = 'system/Divisions'
    expect(shape.safeParse({ ...base, resource, key: 'abc' }).success).toBe(
      true,
    )
    expect(shape.safeParse({ ...base, resource, key: 5 }).success).toBe(true)
    expect(shape.safeParse({ ...base, resource, key: true }).success).toBe(
      false,
    )
  })
})

describe('annotationsFor', () => {
  it('marks reads read-only and idempotent, writes destructive', () => {
    expect(annotationsFor({ summary: 'r', kind: 'read' })).toEqual({
      title: 'r',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    })
    expect(
      annotationsFor({ summary: 'w', kind: 'write' }).destructiveHint,
    ).toBe(true)
  })
})

describe('buildServer', () => {
  async function connect(options) {
    const exec =
      options.exec ?? (async () => ({ stdout: '[]', stderr: '', code: 0 }))
    const { server, tools } = buildServer({
      commands,
      descriptors,
      version: '0.2.0',
      exec,
      ...options,
    })
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair()
    await server.connect(serverTransport)
    const client = new Client({ name: 'test', version: '0' })
    await client.connect(clientTransport)
    return { client, tools }
  }

  it('serves the recipes and the coverage report as Markdown resources', async () => {
    // An agent reads the verified flows before it calls a tool.
    const { client } = await connect({})

    const { resources } = await client.listResources()
    expect(resources.map((r) => r.uri).sort()).toEqual([
      'exactcli://docs/coverage',
      'exactcli://docs/recipes',
    ])
    expect(resources.every((r) => r.mimeType === 'text/markdown')).toBe(true)

    const { contents } = await client.readResource({
      uri: 'exactcli://docs/recipes',
    })
    expect(contents[0].text).toMatch(/^---\ntitle: Recipes/)
    expect(contents[0].text).toContain('Sales order to invoice')
    const coverage = await client.readResource({
      uri: 'exactcli://docs/coverage',
    })
    expect(coverage.contents[0].text).toMatch(/^# API coverage/)
  })

  it('registers the read tools and answers a call through the executor', async () => {
    const calls = []
    const exec = async (argv) => {
      calls.push(argv)
      return { stdout: '[{"Code":"1001"}]', stderr: '', code: 0 }
    }
    const { client, tools } = await connect({ exec })

    const listed = await client.listTools()
    expect(listed.tools.map((t) => t.name).sort()).toEqual(
      ['exact_me', 'exact_quota', 'exact_account_list'].sort(),
    )
    expect(tools).toHaveLength(3)
    const account = listed.tools.find((t) => t.name === 'exact_account_list')
    expect(account.annotations.readOnlyHint).toBe(true)
    expect(account.inputSchema.properties).toHaveProperty('search')

    const result = await client.callTool({
      name: 'exact_account_list',
      arguments: { search: 'acme' },
    })
    expect(calls).toEqual([
      ['account', 'list', '--search=acme', '--output=json'],
    ])
    expect(result.structuredContent).toEqual({ results: [{ Code: '1001' }] })
  })

  it('registers exact_write only with allowWrites and routes it to the write argv', async () => {
    const readOnly = await connect({})
    expect(
      (await readOnly.client.listTools()).tools.map((t) => t.name),
    ).not.toContain('exact_write')

    const calls = []
    const exec = async (argv) => {
      calls.push(argv)
      return { stdout: '{"method":"POST"}', stderr: '', code: 0 }
    }
    const writes = await connect({ allowWrites: true, exec })
    const listed = await writes.client.listTools()
    const tool = listed.tools.find((t) => t.name === 'exact_write')
    expect(tool.annotations.readOnlyHint).toBe(false)
    expect(Object.keys(tool.inputSchema.properties).sort()).toEqual([
      'body',
      'confirm',
      'dry_run',
      'key',
      'operation',
      'resource',
      'set',
    ])

    const result = await writes.client.callTool({
      name: 'exact_write',
      arguments: {
        operation: 'create',
        resource: 'crm/Accounts',
        set: { Name: 'Acme' },
        dry_run: true,
      },
    })
    expect(calls).toEqual([
      [
        'create',
        '--set=Name=@str:Acme',
        '--dry-run',
        '--allow-writes',
        '--output=json',
        '--',
        'crm/Accounts',
      ],
    ])
    expect(result.structuredContent).toEqual({ method: 'POST' })

    const refused = await writes.client.callTool({
      name: 'exact_write',
      arguments: { operation: 'delete', resource: 'crm/Accounts', key: 'k' },
    })
    expect(refused.isError).toBe(true)
    expect(calls).toHaveLength(1)

    const injected = await writes.client.callTool({
      name: 'exact_write',
      arguments: {
        operation: 'update',
        resource: '--division=999999',
        key: 'crm/Accounts',
      },
    })
    expect(injected.isError).toBe(true)
    expect(calls).toHaveLength(1)

    const integerKey = await writes.client.callTool({
      name: 'exact_write',
      arguments: {
        operation: 'update',
        resource: 'system/Divisions',
        key: 5,
        set: { Description: 'Acme' },
      },
    })
    expect(integerKey.isError).toBeFalsy()
    expect(calls[1].slice(-3)).toEqual(['--', 'system/Divisions', '5'])
  })

  it('runs a per-command write tool with --allow-writes, a delete only with confirm', async () => {
    const exec = vi.fn(async () => ({ stdout: '{}', stderr: '', code: 0 }))
    const { client } = await connect({
      allTools: true,
      allowWrites: true,
      exec,
    })

    await client.callTool({
      name: 'exact_webhook_create',
      arguments: { url: 'https://acme.example' },
    })
    expect(exec).toHaveBeenLastCalledWith([
      'webhook',
      'create',
      '--url=https://acme.example',
      '--output=json',
      '--allow-writes',
    ])

    const listed = await client.listTools()
    const remove = listed.tools.find((t) => t.name === 'exact_webhook_delete')
    expect(remove.inputSchema.properties.confirm).toMatchObject({
      type: 'boolean',
      description: 'Must be true to delete',
    })
    expect(remove.inputSchema.properties).not.toHaveProperty('allow-writes')
    expect(remove.inputSchema.properties).not.toHaveProperty('yes')

    const refused = await client.callTool({
      name: 'exact_webhook_delete',
      arguments: { id: '7' },
    })
    expect(refused.isError).toBe(true)
    expect(refused.content[0].text).toBe('delete needs confirm: true')
    expect(exec).toHaveBeenCalledTimes(1)

    await client.callTool({
      name: 'exact_webhook_delete',
      arguments: { id: '7', confirm: true },
    })
    expect(exec).toHaveBeenLastCalledWith([
      'webhook',
      'delete',
      '--output=json',
      '--allow-writes',
      '--yes',
      '--',
      '7',
    ])
  })

  it('adds writes only with allowWrites and allTools', async () => {
    const readOnly = await connect({ allTools: true })
    expect(
      (await readOnly.client.listTools()).tools.map((t) => t.name),
    ).toContain('exact_division_list')
    expect(
      (await readOnly.client.listTools()).tools.map((t) => t.name),
    ).not.toContain('exact_division_use')

    const writes = await connect({ allTools: true, allowWrites: true })
    expect(
      (await writes.client.listTools()).tools.map((t) => t.name),
    ).toContain('exact_division_use')
  })
})
