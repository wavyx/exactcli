import { readFileSync } from 'node:fs'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { buildCatalog } from './catalog.js'
import { buildInputSchema } from './schema.js'
import { runTool, runWrite } from './invoke.js'

/** A resource path: segments of letters, digits, dots, dashes; never a flag. */
const RESOURCE_RE = /^[A-Za-z0-9][A-Za-z0-9/._-]*$/

/** The docs of the package, next to src/ (package.json ships them). */
const DOCS_DIR = new URL('../../../docs/', import.meta.url)

/** The docs an agent reads before it calls a tool. */
export const DOC_RESOURCES = [
  {
    name: 'recipes',
    uri: 'exactcli://docs/recipes',
    file: 'recipes.md',
    title: 'exactcli recipes',
    description:
      'End-to-end flows verified live (entries, invoices, orders, documents, ' +
      'payments, sync, reporting) and the API rules learned live',
  },
  {
    name: 'coverage',
    uri: 'exactcli://docs/coverage',
    file: 'coverage.md',
    title: 'API coverage',
    description:
      'Every catalogued call, the typed command that covers it, and the write ' +
      'calls verified live',
  },
]

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

  for (const doc of DOC_RESOURCES) {
    server.registerResource(
      doc.name,
      doc.uri,
      {
        title: doc.title,
        description: doc.description,
        mimeType: 'text/markdown',
      },
      async (uri) => ({
        contents: [
          {
            uri: uri.href,
            mimeType: 'text/markdown',
            text: readFileSync(new URL(doc.file, DOCS_DIR), 'utf8'),
          },
        ],
      }),
    )
  }

  return { server, tools }
}
