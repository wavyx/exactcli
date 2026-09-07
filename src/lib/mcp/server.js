import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { buildCatalog } from './catalog.js'
import { buildInputSchema } from './schema.js'
import { runTool, runWrite } from './invoke.js'

/** A resource path: segments of letters, digits, dots, dashes; never a flag. */
const RESOURCE_RE = /^[A-Za-z0-9][A-Za-z0-9/._-]*$/

/** The input of exact_write: hand-written, it maps to three commands. */
export const WRITE_SHAPE = {
  operation: z
    .enum(['create', 'update', 'delete'])
    .describe('create (POST), update (PUT) or delete (DELETE)'),
  resource: z
    .string()
    .regex(RESOURCE_RE, 'Resource path, for example crm/Accounts')
    .describe('Resource path, for example crm/Accounts'),
  key: z
    .union([z.string(), z.number()])
    .optional()
    .describe('Record key for update and delete: a GUID, or an integer'),
  body: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Request body as an object (nested values allowed)'),
  set: z
    .record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean(), z.null()]),
    )
    .optional()
    .describe(
      'Flat fields merged over body; "@ref:service/Resource:code" resolves a code',
    ),
  dry_run: z
    .boolean()
    .optional()
    .describe('Show the validated request and send nothing'),
  confirm: z.boolean().optional().describe('Required true for delete'),
}

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
    const custom = entry.custom === 'write'
    server.registerTool(
      entry.toolName,
      {
        title: entry.summary,
        description: entry.summary,
        inputSchema: custom ? WRITE_SHAPE : buildInputSchema(entry),
        annotations: annotationsFor(entry),
      },
      custom
        ? (input) => runWrite(input, exec)
        : (input) => runTool(entry, input, exec, { allowWrites }),
    )
  }

  return { server, tools }
}
