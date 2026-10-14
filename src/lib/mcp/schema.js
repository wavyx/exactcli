import { z } from 'zod'

/**
 * Flags that never belong in a tool's input schema, and that toArgv never
 * emits: the server forces `--output json` and runs under its own profile,
 * the write gate travels as `--allow-writes` only when the server allows
 * writes, and `--yes` only with `confirm: true` on a destructive tool. The
 * agent surface never reads or writes a local file, so the file flags are
 * noise too. `limit` stays: an agent legitimately sizes list results.
 */
export const NOISE_FLAGS = new Set([
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
  'help',
  'yes',
  // Local files: --file (uploads), --state (sync), --body (@file), --out.
  'file',
  'state',
  'body',
  'out',
])

/** The gate of a destructive tool: the handler refuses a call without it. */
const CONFIRM = z.boolean().optional().describe('Must be true to delete')

function flagSchema(flag) {
  let s
  if (flag.type === 'boolean') {
    // A boolean flag is presence-based, so it is always optional.
    s = z.boolean()
    if (flag.description) s = s.describe(flag.description)
    return s.optional()
  }
  if (Array.isArray(flag.options) && flag.options.length) {
    // A numeric option such as a type code may come as a number: accept it
    // when its text is one of the options.
    s = z.union([
      z.enum(flag.options),
      z.number().refine((n) => flag.options.includes(String(n))),
    ])
  } else {
    // Accept numbers too - an LLM will naturally send {limit: 50}, {id: 123}.
    // toArgv stringifies before spawning, so either form is fine.
    s = z.union([z.string(), z.number()])
  }
  if (flag.multiple) s = z.array(s)
  if (flag.description) s = s.describe(flag.description)
  return flag.required ? s : s.optional()
}

function argSchema(arg) {
  let s = z.union([z.string(), z.number()])
  if (arg.description) s = s.describe(arg.description)
  return arg.required ? s : s.optional()
}

/**
 * Build a zod raw shape (the object MCP's registerTool expects as
 * `inputSchema`) from a catalog entry's args + flags. A destructive entry
 * gets a `confirm` boolean on top.
 * @param {{args?: object, flags?: object, kind?: string}} entry
 * @returns {Record<string, import('zod').ZodTypeAny>}
 */
export function buildInputSchema(entry) {
  const shape = {}
  for (const [name, arg] of Object.entries(entry.args || {})) {
    shape[name] = argSchema(arg)
  }
  for (const [name, flag] of Object.entries(entry.flags || {})) {
    if (NOISE_FLAGS.has(name)) continue
    shape[name] = flagSchema(flag)
  }
  if (entry.kind === 'destructive') shape.confirm = CONFIRM
  return shape
}
