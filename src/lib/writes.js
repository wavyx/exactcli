import { Flags } from '@oclif/core'
import { resolveBody } from './body.js'
import { findResource, loadCatalog, mandatoryFields } from './catalog.js'
import { getProfileConfig, loadConfig } from './config.js'
import { CliError } from './errors.js'
import { NUMBER_RE } from './lines.js'
import { GUID_RE, resolveRef } from './refs.js'

export const WRITE_METHODS = ['POST', 'PUT', 'DELETE']

/** Flags of every command that can write. */
export const writeFlags = {
  'allow-writes': Flags.boolean({
    description:
      'Allow this command to write (POST, PUT, DELETE). Env: EXACTCLI_ALLOW_WRITES=1',
    default: false,
  }),
  yes: Flags.boolean({ description: 'Confirm a DELETE', default: false }),
}

/**
 * @param {{ 'allow-writes'?: boolean }} flags
 * @returns {boolean}
 */
export const writesAllowed = (flags) =>
  Boolean(flags['allow-writes']) || process.env.EXACTCLI_ALLOW_WRITES === '1'

/**
 * A profile with `read_only` set refuses every write, whatever the flags say.
 * The belt for a production administration that must stay untouched.
 *
 * The lock has two carriers. The config store follows EXACTCLI_CONFIG_DIR,
 * so an empty config directory would unlock it; the keychain blob does not,
 * so BaseCommand.init sets `flags.readOnlyCredential` to the profile name
 * when the blob carries the lock, and that carrier wins.
 * @param {{ profile?: string, readOnlyCredential?: string }} flags
 * @returns {string | null} the profile name when it is locked
 */
export function readOnlyProfile(flags) {
  if (flags.readOnlyCredential) return flags.readOnlyCredential
  const profile = loadConfig(flags.profile).activeProfile
  return getProfileConfig(profile, 'read_only') === true ? profile : null
}

/**
 * Refuse before anything is read or sent: a refused write costs nothing.
 * @param {{ 'allow-writes'?: boolean, yes?: boolean, profile?: string }} flags
 * @param {string} method
 */
export function assertWritesAllowed(flags, method) {
  if (!WRITE_METHODS.includes(method)) return
  const locked = readOnlyProfile(flags)
  if (locked) {
    throw new CliError(
      `Profile ${locked} is read-only (config set read_only false to change it).`,
      { exitCode: 77 },
    )
  }
  if (!writesAllowed(flags)) {
    throw new CliError(
      'Writes are off. Add --allow-writes (and --yes for DELETE).',
      { exitCode: 77 },
    )
  }
  if (method === 'DELETE' && !flags.yes) {
    throw new CliError('DELETE needs --yes.', { exitCode: 77 })
  }
}

const REF_RE = /^@ref:([^:]+\/[^:]+):(.+)$/

/**
 * A `--set` value as JSON would carry it: null, booleans and numbers become
 * themselves, markers force a type or name a reference, the rest is a string.
 * @param {string} text
 * @returns {unknown}
 */
export function coerce(text) {
  if (text === 'null') return null
  if (text === 'true') return true
  if (text === 'false') return false
  if (NUMBER_RE.test(text)) return Number(text)
  if (text.startsWith('@str:')) return text.slice(5)
  if (text.startsWith('@guid:')) {
    const guid = text.slice(6)
    if (!GUID_RE.test(guid)) {
      throw new CliError(`@guid expects a GUID, received ${guid}`, {
        exitCode: 64,
      })
    }
    return guid
  }
  if (text.startsWith('@ref:')) {
    const match = text.match(REF_RE)
    if (!match) {
      throw new CliError('@ref expects @ref:service/Resource:code', {
        exitCode: 64,
      })
    }
    return { $ref: match[1], code: match[2] }
  }
  return text
}

/**
 * The repeatable `--set Key=value` flag as a body. The first `=` splits.
 * @param {string[]} [pairs]
 * @returns {object}
 */
export function parseSet(pairs = []) {
  const body = {}
  for (const pair of pairs) {
    const separator = pair.indexOf('=')
    if (separator < 1) {
      throw new CliError(`--set expects Key=value, received: ${pair}`, {
        exitCode: 64,
      })
    }
    body[pair.slice(0, separator)] = coerce(pair.slice(separator + 1))
  }
  return body
}

/**
 * Deep copy of a body where every `{ $ref, code }` marker becomes the GUID
 * of that record. Lookups run one after the other.
 * @param {{ apiClient: object, resolveDivision: () => number }} cmd
 * @param {unknown} value
 * @returns {Promise<unknown>}
 */
export async function applyRefs(cmd, value) {
  if (Array.isArray(value)) {
    const out = []
    for (const item of value) out.push(await applyRefs(cmd, item))
    return out
  }
  if (value !== null && typeof value === 'object') {
    if (typeof value.$ref === 'string') {
      return resolveRef(cmd, value.$ref, String(value.code))
    }
    const out = {}
    for (const [key, item] of Object.entries(value)) {
      out[key] = await applyRefs(cmd, item)
    }
    return out
  }
  return value
}

/**
 * Check a write against the catalogue before anything is sent. Every
 * problem lands in one message. Nested objects and arrays are not checked.
 * @param {{ resource: string, body: object, method: string, force?: boolean, catalog?: object }} options
 * @returns {object | undefined} the catalogue record when known
 */
export function validateWrite({
  resource: ref,
  body,
  method,
  force = false,
  catalog = loadCatalog(),
}) {
  const res = findResource(ref, catalog)
  const problems = []
  if (!res) {
    if (!force) problems.push(`unknown resource ${ref}`)
  } else {
    if (!res.methods.includes(method)) {
      problems.push(
        `method ${method} not allowed on ${ref} (allowed: ${res.methods.join(', ')})`,
      )
    }
    const byName = new Map(res.properties.map((p) => [p.name, p]))
    const keys = Object.keys(body)
    if (method === 'POST') {
      const missing = mandatoryFields(res).filter((f) => !(f in body))
      if (missing.length) {
        problems.push(`missing mandatory fields: ${missing.join(', ')}`)
      }
    }
    const unknown = keys.filter((k) => !byName.has(k))
    if (unknown.length && !force) {
      problems.push(`unknown fields: ${unknown.join(', ')}`)
    }
    if (method === 'PUT') {
      const readOnly = keys.filter((k) => byName.get(k)?.put === false)
      if (readOnly.length) {
        problems.push(`read-only fields on PUT: ${readOnly.join(', ')}`)
      }
    }
  }
  if (problems.length) {
    throw new CliError(`${ref}: ${problems.join('; ')}`, { exitCode: 64 })
  }
  return res
}

/** What --dry-run prints. */
export const describeRequest = ({ method, path, body }) => ({
  method,
  path,
  body,
})

/**
 * The JSON body of a write: `--body` (a string, @file, or piped stdin), or
 * an empty object when `--set` carries the fields or nothing is piped.
 * @param {{ body?: string, set?: string[] }} flags
 * @returns {Promise<object>}
 */
export async function readBody(flags) {
  const piped = !flags.body && !flags.set?.length && !process.stdin.isTTY
  if (!flags.body && !piped) return {}
  const text = await resolveBody(flags)
  try {
    return JSON.parse(text)
  } catch (cause) {
    throw new CliError(`--body is not valid JSON: ${cause.message}`, {
      exitCode: 64,
    })
  }
}
