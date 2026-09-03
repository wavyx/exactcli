/**
 * The MCP tool catalogue: a few generic tools that cover every resource, one
 * tool per typed descriptor, and (with allTools) every other command.
 */
import { descriptors as defaultDescriptors } from '../typed/descriptors.js'

export const LIST_HELP =
  'List records of any Exact Online resource (service/Resource, for example ' +
  'crm/Accounts). Call exact_metadata first to learn the fields. OData v3 ' +
  "filter syntax: Name eq 'Acme'; substringof('acme', Name); " +
  "Date ge datetime'2026-01-01'; Account eq guid'...'; " +
  "Status eq 'C' and IsSales eq true. select trims the fields, orderby sorts " +
  '(EntryDate desc), limit caps the rows (default 60, pages of 60).'

/**
 * Generic tools: which command they run and which args and flags they keep.
 * @type {Array<{toolName: string, id: string, description: string, args?: string[], flags?: string[], required?: string[]}>}
 */
export const GENERIC_TOOLS = [
  {
    toolName: 'exact_resources',
    id: 'metadata',
    description:
      'Search the Exact Online resource catalogue by word. Returns ' +
      'service/Resource names, families and methods. Call this first when ' +
      'you do not know the resource path.',
    args: [],
    flags: ['search'],
    required: ['search'],
  },
  {
    toolName: 'exact_metadata',
    id: 'metadata',
    description:
      'Fields of one resource: name, type, key, mandatory, filterable, post, ' +
      'put. Read it before you build a $filter or a write body.',
    args: ['resource'],
    flags: ['mandatory', 'filterable', 'methods'],
    required: ['resource'],
  },
  {
    toolName: 'exact_list',
    id: 'list',
    description: LIST_HELP,
    args: ['resource'],
    flags: [
      'filter',
      'select',
      'expand',
      'orderby',
      'top',
      'all',
      'max-pages',
      'limit',
      'beta',
    ],
  },
  {
    toolName: 'exact_get',
    id: 'get',
    description:
      'Read one record of a resource by its key (a GUID, or an integer for ' +
      'resources such as system/Divisions).',
    args: ['resource', 'id'],
    flags: ['select', 'expand', 'beta'],
  },
  {
    toolName: 'exact_me',
    id: 'me',
    description: 'The current user and the division in use.',
    args: [],
    flags: [],
  },
  {
    toolName: 'exact_quota',
    id: 'quota',
    description:
      'The rate-limit budget: calls left this minute and today, and when ' +
      'each window resets.',
    args: [],
    flags: [],
  },
]

/** Flags every typed list tool keeps next to its own filters. */
const TYPED_FLAGS = ['filter', 'select', 'orderby', 'all', 'max-pages', 'limit']

/**
 * The one write tool. It maps an operation to create, update or delete and
 * exists only when the server runs with --allow-writes.
 */
export const WRITE_TOOL = {
  id: 'write',
  toolName: 'exact_write',
  kind: 'write',
  custom: 'write',
  summary:
    'Create, update or delete a record. Validated against the catalogue ' +
    '(mandatory and unknown fields). Use dry_run: true first to see the ' +
    'request. delete needs confirm: true. set values: strings, numbers, ' +
    'booleans, null; "@ref:crm/Accounts:1001" resolves a code to a GUID.',
  args: {},
  flags: {},
}
const WRITE_COMMANDS = ['create', 'update', 'delete']

// Never exposed one by one: the raw escape hatch, local diagnostics, the
// server itself, a command that writes files, the three write commands
// (exact_write covers them), and the commands that manage local state.
export const EXCLUDED = new Set([
  'api',
  'doctor',
  'mcp',
  'document:download',
  ...WRITE_COMMANDS,
])
const EXCLUDED_PREFIXES = ['auth:', 'config:', 'profile:']

const READ_LEAVES = new Set([
  'list',
  'get',
  'current',
  'me',
  'quota',
  'metadata',
  'version',
  'status',
])
const DESTRUCTIVE_LEAVES = new Set(['delete', 'unset'])

/** @param {string} id */
export function isExcluded(id) {
  return EXCLUDED.has(id) || EXCLUDED_PREFIXES.some((p) => id.startsWith(p))
}

/**
 * @param {string} id oclif command id
 * @returns {'read'|'write'|'destructive'}
 */
export function classifyKind(id) {
  const leaf = id.split(':').pop()
  if (DESTRUCTIVE_LEAVES.has(leaf)) return 'destructive'
  if (READ_LEAVES.has(leaf)) return 'read'
  // Any other verb mutates until proven otherwise.
  return 'write'
}

/** Turn a command id into a valid MCP tool name. */
export function toolName(id) {
  return `exact_${id.replace(/[:-]/g, '_')}`
}

/**
 * @param {object} [source]
 * @param {string[]} names
 * @param {string[]} [required]
 */
function pick(source = {}, names, required = []) {
  const chosen = names.filter((n) => n in source)
  return Object.fromEntries(
    chosen.map((n) => [
      n,
      required.includes(n) ? { ...source[n], required: true } : source[n],
    ]),
  )
}

/**
 * One tool per typed descriptor.
 * @param {Record<string, import('../typed/descriptors.js').Descriptor>} descriptors
 * @param {Array<{id: string, flags?: object, args?: object}>} commands
 */
export function typedTools(descriptors, commands) {
  return Object.values(descriptors).flatMap((d) => {
    const id = `${d.topic}:list`
    const command = commands.find((c) => c.id === id)
    if (!command) return []
    const filters = Object.keys(d.filters)
    return [
      {
        id,
        toolName: toolName(id),
        summary:
          `${d.description}. Prefer this over exact_list for ${d.resource}: ` +
          `filters ${filters.join(', ') || 'none'}; ` +
          `columns ${d.columns.join(', ')}.`,
        kind: 'read',
        args: {},
        flags: pick(command.flags, [...filters, ...TYPED_FLAGS]),
      },
    ]
  })
}

/**
 * Build the tool catalogue from the oclif command descriptors.
 * @param {Array<{id: string, summary?: string, description?: string, hidden?: boolean, flags?: object, args?: object}>} commands
 * @param {Record<string, object>} [descriptors]
 * @param {{allTools?: boolean}} [options]
 */
export function buildCatalog(
  commands,
  descriptors = defaultDescriptors,
  { allTools = false } = {},
) {
  const generic = GENERIC_TOOLS.flatMap((tool) => {
    const command = commands.find((c) => c.id === tool.id)
    if (!command) return []
    return [
      {
        id: tool.id,
        toolName: tool.toolName,
        summary: tool.description,
        kind: 'read',
        args: pick(command.args, tool.args, tool.required),
        flags: pick(command.flags, tool.flags, tool.required),
      },
    ]
  })
  const typed = typedTools(descriptors, commands)
  const entries = [...generic, ...typed]
  if (WRITE_COMMANDS.every((id) => commands.some((c) => c.id === id))) {
    entries.push(WRITE_TOOL)
  }

  if (allTools) {
    const seen = new Set(entries.map((e) => e.id))
    for (const c of commands) {
      if (c.hidden || seen.has(c.id) || isExcluded(c.id)) continue
      entries.push({
        id: c.id,
        toolName: toolName(c.id),
        summary: c.summary || c.description || c.id,
        kind: classifyKind(c.id),
        args: c.args || {},
        flags: c.flags || {},
      })
    }
  }
  return entries
}
