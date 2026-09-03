import { describe, it, expect } from 'vitest'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import {
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
        'crm/Accounts',
        '--set=Name=@str:Acme',
        '--dry-run',
        '--allow-writes',
        '--output=json',
      ],
    ])
    expect(result.structuredContent).toEqual({ method: 'POST' })

    const refused = await writes.client.callTool({
      name: 'exact_write',
      arguments: { operation: 'delete', resource: 'crm/Accounts', key: 'k' },
    })
    expect(refused.isError).toBe(true)
    expect(calls).toHaveLength(1)
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
