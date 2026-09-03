import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { buildCatalog } from './catalog.js'
import { buildInputSchema } from './schema.js'
import { runTool } from './invoke.js'

/**
 * MCP tool annotations derived from a catalogue entry's kind. Per the MCP
 * spec `destructiveHint: false` promises additive-only changes, and an
 * update overwrites values, so every non-read tool carries the hint.
 */
export function annotationsFor(entry) {
  return {
    title: entry.summary,
    readOnlyHint: entry.kind === 'read',
    destructiveHint: entry.kind !== 'read',
    idempotentHint: entry.kind === 'read',
    openWorldHint: true,
  }
}

/**
 * The write gate of the server: reads always, write and destructive tools
 * only with `allowWrites`.
 * @param {Array} catalog
 * @param {{allowWrites?: boolean}} [options]
 */
export function selectTools(catalog, { allowWrites = false } = {}) {
  return catalog.filter((e) => allowWrites || e.kind === 'read')
}

/**
 * Build an McpServer that exposes exactcli commands as tools.
 * @param {object} options
 * @param {Array} options.commands oclif command descriptors
 * @param {Record<string, object>} [options.descriptors] typed descriptors
 * @param {string} options.version server version
 * @param {boolean} [options.allowWrites] expose mutating tools
 * @param {boolean} [options.allTools] expose every non-excluded command
 * @param {Function} options.exec executor passed to runTool
 * @returns {{server: McpServer, tools: Array}}
 */
export function buildServer({
  commands,
  descriptors,
  version,
  allowWrites,
  allTools,
  exec,
}) {
  const server = new McpServer({ name: 'exactcli', version })
  const tools = selectTools(buildCatalog(commands, descriptors, { allTools }), {
    allowWrites,
  })

  for (const entry of tools) {
    server.registerTool(
      entry.toolName,
      {
        title: entry.summary,
        description: entry.summary,
        inputSchema: buildInputSchema(entry),
        annotations: annotationsFor(entry),
      },
      (input) => runTool(entry, input, exec),
    )
  }

  return { server, tools }
}
