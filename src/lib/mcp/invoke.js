import { spawn } from 'node:child_process'
import { NOISE_FLAGS } from './schema.js'

const CONFIRM_ERROR = 'delete needs confirm: true'

/**
 * Turn a validated tool input into an argv for the exactcli CLI: flags as
 * `--name=value` (so a value can never be reinterpreted as a flag), then a
 * forced `--output=json`, then the write gate (`--allow-writes` when the
 * server allows writes and the command has the flag, `--yes` only for a
 * destructive tool with `confirm: true`), then positional args after a `--`
 * separator (so a value starting with `-` stays a positional).
 * @param {{id: string, kind?: string, args?: object, flags?: object}} entry
 * @param {Record<string, unknown>} input
 * @param {{allowWrites?: boolean}} [context] the server context
 * @returns {string[]}
 */
export function toArgv(entry, input, { allowWrites = false } = {}) {
  const argv = entry.id.split(':')
  const flags = entry.flags || {}

  const positionals = []
  for (const name of Object.keys(entry.args || {})) {
    const v = input[name]
    if (v !== undefined && v !== null) positionals.push(String(v))
  }

  for (const [name, flag] of Object.entries(flags)) {
    if (NOISE_FLAGS.has(name)) continue // the server owns these
    const v = input[name]
    if (v === undefined || v === null) continue
    if (flag.type === 'boolean') {
      if (v) argv.push(`--${name}`)
    } else if (Array.isArray(v)) {
      for (const item of v) argv.push(`--${name}=${item}`)
    } else {
      argv.push(`--${name}=${v}`)
    }
  }

  argv.push('--output=json')
  const mutates = entry.kind === 'write' || entry.kind === 'destructive'
  if (mutates && allowWrites && 'allow-writes' in flags) {
    argv.push('--allow-writes')
  }
  if (
    entry.kind === 'destructive' &&
    input.confirm === true &&
    'yes' in flags
  ) {
    argv.push('--yes')
  }
  if (positionals.length) argv.push('--', ...positionals)
  return argv
}

/** An error result that spawns nothing. */
function refuse(text) {
  return Promise.resolve({
    content: [{ type: 'text', text }],
    isError: true,
  })
}

function wrap(data) {
  if (Array.isArray(data)) return { results: data }
  if (data && typeof data === 'object') return data
  return { value: data }
}

/**
 * Run an argv through the executor and shape the answer as an MCP tool
 * result. A non-zero exit OR a signal termination is an error (a
 * signal-killed child must never look like success). On failure the stderr
 * JSON error envelope exactcli emits in machine mode becomes the error text.
 * @param {string[]} argv
 * @param {(argv: string[]) => Promise<{stdout: string, stderr: string, code: number, signal?: string|null}>} exec
 */
export async function runArgv(argv, exec) {
  const { stdout, stderr, code, signal } = await exec(argv)

  if (signal || code !== 0) {
    // Pseudo-signals from makeExec ('output limit exceeded', 'tool timed out
    // after Ns') are already self-describing; only real signals get a prefix.
    const text = signal
      ? signal.startsWith('SIG')
        ? `terminated: ${signal}`
        : signal
      : (stderr || stdout || `exited ${code}`).trim()
    return { content: [{ type: 'text', text }], isError: true }
  }

  const text = stdout.trim()
  const result = { content: [{ type: 'text', text: text || 'OK' }] }
  // A hint next to a good answer ("More results available", "Next
  // timestamp: N") lands on stderr; the agent gets it as a second block.
  const hint = stderr.trim()
  if (hint) result.content.push({ type: 'text', text: hint })
  try {
    result.structuredContent = wrap(JSON.parse(text))
  } catch {
    // Plain-text output (e.g. "Deleted crm/Accounts 5") - no structured content.
  }
  return result
}

/**
 * Run a catalogue tool: build the argv from the input, execute, shape. A
 * destructive tool runs only with `confirm: true`.
 * @param {object} entry catalog entry
 * @param {Record<string, unknown>} input
 * @param {Function} exec
 * @param {{allowWrites?: boolean}} [context] the server context
 */
export function runTool(entry, input, exec, context) {
  if (entry.kind === 'destructive' && input.confirm !== true) {
    return refuse(CONFIRM_ERROR)
  }
  return runArgv(toArgv(entry, input, context), exec)
}

/** A --set value as the CLI parses it: literals stay, plain text is pinned. */
function setValue(value) {
  if (value === null) return 'null'
  if (typeof value !== 'string') return String(value)
  // A marker (@ref:, @guid:, @str:) travels as it is; other text is pinned
  // so that "1001" stays a string instead of becoming a number.
  return value.startsWith('@') ? value : `@str:${value}`
}

/**
 * The argv of the exact_write tool, or an error text when the input cannot
 * become a command. Nothing is spawned for an error. The resource and the
 * key follow a `--` separator, as in toArgv, so neither can become a flag.
 * @param {{operation: string, resource: string, key?: string|number, body?: object, set?: object, dry_run?: boolean, confirm?: boolean}} input
 * @returns {{argv?: string[], error?: string}}
 */
export function writeArgv(input) {
  const {
    operation,
    resource,
    key,
    body,
    set,
    dry_run: dryRun,
    confirm,
  } = input
  if ((operation === 'update' || operation === 'delete') && !key) {
    return { error: `${operation} needs a key` }
  }
  if (operation === 'delete' && !dryRun && confirm !== true) {
    return { error: CONFIRM_ERROR }
  }
  const argv = [operation]
  if (operation !== 'delete') {
    if (body) argv.push(`--body=${JSON.stringify(body)}`)
    for (const [name, value] of Object.entries(set ?? {})) {
      argv.push(`--set=${name}=${setValue(value)}`)
    }
  }
  if (dryRun) argv.push('--dry-run')
  argv.push('--allow-writes')
  if (operation === 'delete' && confirm === true) argv.push('--yes')
  argv.push('--output=json', '--', resource)
  if (key) argv.push(String(key))
  return { argv }
}

/**
 * Run the exact_write tool.
 * @param {object} input
 * @param {Function} exec
 */
export function runWrite(input, exec) {
  const { argv, error } = writeArgv(input)
  return error ? refuse(error) : runArgv(argv, exec)
}

/** A process killed by a signal reports a null exit code; treat that as 0. */
export function normalizeExit(code) {
  return code ?? 0
}

/** Best-effort string for a spawn error. */
export function errMessage(e) {
  return String(e?.message || e)
}

/**
 * After a graceful SIGTERM, force-kill the child if it has not exited within
 * `grace` ms. Extracted so the escalation is unit-testable without depending on
 * OS signal semantics: Windows terminates a child on the first kill, so a
 * real-process test can never exercise this escalation there.
 * @param {import('node:child_process').ChildProcess} child
 * @param {number} grace
 */
export function scheduleHardKill(child, grace) {
  return setTimeout(() => child.kill('SIGKILL'), grace)
}

/**
 * Build an executor that spawns the exactcli CLI as a child process. Keeping
 * command output in a child process keeps the parent's stdout (the MCP stdio
 * channel) clean. Guards against hangs (timeout: SIGTERM, escalating to
 * SIGKILL after `grace`) and runaway output on EITHER stream (maxBuffer caps
 * stdout + stderr combined). Both kills resolve with a self-describing
 * pseudo-signal so callers can tell them from a genuine signal death.
 * @param {{command: string, args?: string[], env?: object, timeout?: number, grace?: number, maxBuffer?: number}} options
 */
export function makeExec({
  command,
  args = [],
  env,
  timeout = 120_000,
  grace = 2_000,
  maxBuffer = 16 * 1024 * 1024,
}) {
  return (argv) =>
    new Promise((resolve) => {
      const child = spawn(command, [...args, ...argv], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: env ? { ...process.env, ...env } : process.env,
      })
      // Decode in the stream so a multibyte character split across chunk
      // boundaries is never corrupted by per-chunk toString().
      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')
      let stdout = ''
      let stderr = ''
      let limit = false
      let timedOut = false
      let killTimer
      const timer = setTimeout(() => {
        timedOut = true
        child.kill('SIGTERM')
        killTimer = scheduleHardKill(child, grace)
      }, timeout)
      const guard = () => {
        if (stdout.length + stderr.length > maxBuffer) {
          limit = true
          child.kill('SIGKILL')
        }
      }
      child.stdout.on('data', (d) => {
        stdout += d
        guard()
      })
      child.stderr.on('data', (d) => {
        stderr += d
        guard()
      })
      child.on('error', (e) => {
        clearTimeout(timer)
        clearTimeout(killTimer)
        resolve({ stdout: '', stderr: errMessage(e), code: 1, signal: null })
      })
      child.on('close', (code, signal) => {
        clearTimeout(timer)
        clearTimeout(killTimer)
        resolve({
          stdout,
          stderr,
          code: normalizeExit(code),
          signal: limit
            ? 'output limit exceeded'
            : timedOut
              ? `tool timed out after ${timeout / 1000}s`
              : signal,
        })
      })
    })
}
