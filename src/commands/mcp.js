import { Flags } from '@oclif/core'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import BaseCommand from '../base-command.js'
import { buildServer } from '../lib/mcp/server.js'
import { makeExec } from '../lib/mcp/invoke.js'
import { readOnlyProfile } from '../lib/writes.js'

/**
 * Build and connect an MCP server. Extracted from run() so it can be tested
 * without a real stdio transport.
 * @param {object} o
 * @param {{name: string, commands: Array, version: string}} o.config
 * @param {Record<string, object>} [o.descriptors] typed descriptors
 * @param {boolean} o.allowWrites
 * @param {boolean} o.allTools
 * @param {Function} o.exec executor for tool calls
 * @param {(server: object) => Promise<void>} o.connect transport connector
 * @param {(msg: string) => void} [o.log] startup logger (stderr)
 */
export async function startMcpServer({
  config,
  descriptors,
  allowWrites,
  allTools,
  exec,
  connect,
  log,
}) {
  // Only exactcli's own commands become tools, never the bundled oclif
  // plugin commands (plugins:*, help, autocomplete).
  const commands = config.commands.filter((c) => c.pluginName === config.name)
  const { server, tools } = buildServer({
    commands,
    descriptors,
    version: config.version,
    allowWrites,
    allTools,
    exec,
  })
  log?.(
    `exactcli MCP server ready: ${tools.length} tools` +
      (allowWrites ? ' (writes enabled)' : ' (read-only)'),
  )
  await connect(server)
  return { server, tools }
}

export default class McpCommand extends BaseCommand {
  static summary =
    'Run exactcli as a Model Context Protocol (MCP) server over stdio'

  static description = `Run exactcli as a Model Context Protocol (MCP) server over stdio.

Exposes six generic tools that cover every resource of the catalogue
(exact_resources, exact_metadata, exact_list, exact_get, exact_me,
exact_quota) plus one tool per typed command. --allow-writes adds
exact_write (create, update, delete with dry_run and confirm). Each tool
call runs exactcli as a child process under the profile and division of
the server.

Register with Claude Code:
  claude mcp add exact -- exactcli mcp

Or in .mcp.json / claude_desktop_config.json:
  {"mcpServers":{"exact":{"command":"exactcli","args":["mcp"]}}}`

  static skipAuth = true // the children authenticate

  static examples = [
    '<%= config.bin %> mcp',
    '<%= config.bin %> mcp --division 123456',
    '<%= config.bin %> mcp --all-tools --allow-writes',
  ]

  // A long-running server has no use for the output-shaping global flags.
  static baseFlags = {
    profile: BaseCommand.baseFlags.profile,
    division: BaseCommand.baseFlags.division,
  }

  static flags = {
    'allow-writes': Flags.boolean({
      description:
        'Expose mutating tools. Off by default: the server is read-only.',
      default: false,
    }),
    'all-tools': Flags.boolean({
      description:
        'Expose every command as a tool, not only the generic and typed set',
      default: false,
    }),
    'tool-timeout': Flags.integer({
      description:
        'Seconds a tool call may run before its child process is terminated',
      default: 120,
      min: 1,
    }),
  }

  async run() {
    const { flags } = await this.parse(McpCommand)
    // Each tool call re-invokes this CLI as a child process, so the parent's
    // stdout (the MCP channel) stays free of command output. The profile and
    // the division of the server travel through the environment.
    const env = { EXACTCLI_PROFILE: this.activeProfile }
    if (flags.division) env.EXACTCLI_DIVISION = flags.division
    const exec = makeExec({
      command: process.execPath,
      args: [process.argv[1]],
      env,
      timeout: flags['tool-timeout'] * 1000,
    })
    // A read-only profile never exposes a write tool, whatever the flag says.
    const locked = readOnlyProfile(flags)
    if (locked && flags['allow-writes']) {
      process.stderr.write(
        `Profile ${locked} is read-only: writes stay hidden\n`,
      )
    }
    await startMcpServer({
      config: this.config,
      allowWrites: flags['allow-writes'] && !locked,
      allTools: flags['all-tools'],
      exec,
      connect: (server) => server.connect(new StdioServerTransport()),
      log: (msg) => process.stderr.write(msg + '\n'),
    })
  }
}
