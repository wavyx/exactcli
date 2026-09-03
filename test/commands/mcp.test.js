import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Replace the stdio transport so run() does not block on a real socket.
vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: class {
    async start() {}
    async send() {}
    async close() {}
  },
}))
// Wrap (never replace) buildServer and makeExec: run() drives the real
// catalogue, while the tests observe the tool set and the executor options.
vi.mock('../../src/lib/mcp/server.js', async (importOriginal) => {
  const mod = await importOriginal()
  return { ...mod, buildServer: vi.fn(mod.buildServer) }
})
vi.mock('../../src/lib/mcp/invoke.js', async (importOriginal) => {
  const mod = await importOriginal()
  return { ...mod, makeExec: vi.fn(mod.makeExec) }
})

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-mcp-'))
const { buildServer } = await import('../../src/lib/mcp/server.js')
const { makeExec } = await import('../../src/lib/mcp/invoke.js')
const { default: Cmd, startMcpServer } =
  await import('../../src/commands/mcp.js')
const { descriptors } = await import('../../src/lib/typed/descriptors.js')

const own = (id, extra = {}) => ({
  id,
  pluginName: '@wavyx/exactcli',
  summary: id,
  flags: {},
  args: {},
  ...extra,
})
const config = {
  name: '@wavyx/exactcli',
  version: '0.2.0',
  commands: [
    own('me'),
    own('quota'),
    own('account:list', { flags: { search: { type: 'option' } } }),
    own('division:use', { args: { code: { required: true } } }),
    {
      id: 'plugins:install',
      pluginName: '@oclif/plugin-plugins',
      flags: {},
      args: {},
    },
  ],
}

beforeEach(() => {
  process.env.EXACTCLI_CONFIG_DIR = TMP_CONFIG_DIR
  delete process.env.EXACTCLI_DIVISION
  vi.clearAllMocks()
})

afterEach(() => {
  delete process.env.EXACTCLI_CONFIG_DIR
  delete process.env.EXACTCLI_DIVISION
})

describe('startMcpServer', () => {
  it('exposes the read tools of the own commands only and logs the ready line', async () => {
    const connect = vi.fn(async () => {})
    const log = vi.fn()

    const { tools } = await startMcpServer({
      config,
      descriptors,
      allowWrites: false,
      allTools: false,
      exec: async () => ({ stdout: '', stderr: '', code: 0 }),
      connect,
      log,
    })

    expect(tools.map((t) => t.toolName)).toEqual([
      'exact_me',
      'exact_quota',
      'exact_account_list',
    ])
    expect(connect).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledWith(
      'exactcli MCP server ready: 3 tools (read-only)',
    )
  })

  it('reports writes enabled and never exposes a bundled plugin command', async () => {
    const log = vi.fn()

    const { tools } = await startMcpServer({
      config,
      descriptors,
      allowWrites: true,
      allTools: true,
      exec: async () => ({ stdout: '', stderr: '', code: 0 }),
      connect: async () => {},
      log,
    })

    expect(tools.map((t) => t.toolName)).toContain('exact_division_use')
    expect(tools.map((t) => t.id)).not.toContain('plugins:install')
    expect(log).toHaveBeenCalledWith(
      'exactcli MCP server ready: 4 tools (writes enabled)',
    )
  })

  it('works without a logger', async () => {
    const { tools } = await startMcpServer({
      config,
      descriptors,
      allowWrites: false,
      allTools: false,
      exec: async () => ({ stdout: '', stderr: '', code: 0 }),
      connect: async () => {},
    })
    expect(tools).toHaveLength(3)
  })
})

describe('mcp command', () => {
  it('forwards the profile and the division to the child executor', async () => {
    const stderr = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true)
    try {
      await Cmd.run(['--division', '123456', '--tool-timeout', '5'])
    } finally {
      stderr.mockRestore()
    }

    expect(makeExec).toHaveBeenCalledTimes(1)
    const options = makeExec.mock.calls[0][0]
    expect(options.command).toBe(process.execPath)
    expect(options.env).toEqual({
      EXACTCLI_PROFILE: 'default',
      EXACTCLI_DIVISION: '123456',
    })
    expect(options.timeout).toBe(5000)
    expect(buildServer).toHaveBeenCalledTimes(1)
    expect(buildServer.mock.calls[0][0].allowWrites).toBe(false)
  })

  it('leaves the division to the profile when the flag is absent', async () => {
    const lines = []
    const stderr = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk) => lines.push(String(chunk)) > 0)
    try {
      await Cmd.run(['--allow-writes', '--all-tools'])
    } finally {
      stderr.mockRestore()
    }

    expect(makeExec.mock.calls[0][0].env).toEqual({
      EXACTCLI_PROFILE: 'default',
    })
    expect(buildServer.mock.calls[0][0].allowWrites).toBe(true)
    expect(buildServer.mock.calls[0][0].allTools).toBe(true)
    expect(lines.join('')).toMatch(
      /exactcli MCP server ready: \d+ tools \(writes enabled\)\n/,
    )
  })
})

rmSync(TMP_CONFIG_DIR, { recursive: true, force: true })
